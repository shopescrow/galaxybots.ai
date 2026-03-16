import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthUser {
  userId: number;
  clientId: number;
  role: string;
  email: string;
  plan?: string;
  bypassPayment?: boolean;
  guestSessionId?: number;
  iat?: number;
  developerKeyId?: number;
}

let checkRevocation: ((email: string, iat: number) => boolean) | null = null;

export function setRevocationChecker(fn: (email: string, iat: number) => boolean): void {
  checkRevocation = fn;
}

const activeStatusCache = new Map<number, { isActive: boolean; checkedAt: number }>();
const ACTIVE_CHECK_TTL = 30 * 1000;

async function isUserActive(userId: number): Promise<boolean> {
  const cached = activeStatusCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < ACTIVE_CHECK_TTL) {
    return cached.isActive;
  }
  const [user] = await db.select({ isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, userId));
  const isActive = user?.isActive ?? false;
  activeStatusCache.set(userId, { isActive, checkedAt: Date.now() });
  return isActive;
}

export function invalidateActiveStatusCache(userId: number): void {
  activeStatusCache.delete(userId);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export function signToken(payload: AuthUser, expiresIn: string = "7d"): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    if (checkRevocation && decoded.email && decoded.iat) {
      if (checkRevocation(decoded.email, decoded.iat)) {
        res.status(401).json({ error: "Session has been revoked" });
        return;
      }
    }
    if (decoded.userId && !(await isUserActive(decoded.userId))) {
      res.status(401).json({ error: "Account has been deactivated" });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function authenticateOrGuest(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    if (checkRevocation && decoded.email && decoded.iat) {
      if (checkRevocation(decoded.email, decoded.iat)) {
        res.status(401).json({ error: "Session has been revoked" });
        return;
      }
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function isGuestSession(req: Request): boolean {
  return req.user?.role === "guest";
}

export function requirePayment(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.bypassPayment) {
    next();
    return;
  }
  // TODO: check active subscription / payment status from DB when payment system is integrated
  // For now, allow access — this middleware is a hook for future payment gating
  next();
}

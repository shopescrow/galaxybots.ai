import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: number;
  clientId: number;
  role: string;
  email: string;
  plan?: string;
  bypassPayment?: boolean;
  guestSessionId?: number;
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

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
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

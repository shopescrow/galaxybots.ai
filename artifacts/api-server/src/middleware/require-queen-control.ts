import type { Request, Response, NextFunction } from "express";
import { db, platformAuditLogTable } from "@workspace/db";

export function requireQueenControl(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role !== "owner" || !user.bypassPayment) {
    res.status(403).json({ error: "Forbidden: Only Platform Admins may command the Guardian Queen" });
    return;
  }
  db.insert(platformAuditLogTable)
    .values({
      userId: user.userId,
      clientId: user.clientId,
      action: "guardian_control",
      resource: "guardian_queen",
      resourceId: req.path,
      metadata: { method: req.method, body: req.body },
      ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
    })
    .catch((err: unknown) => console.error("[requireQueenControl] Audit log write failed:", err));
  next();
}

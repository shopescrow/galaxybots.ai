import type { Request, Response, NextFunction } from "express";
import { db, platformAuditLogTable } from "@workspace/db";

const AUDITED_ACTIONS: Record<string, { action: string; resource: string }> = {
  "POST /api/auth/login": { action: "login", resource: "auth" },
  "POST /api/auth/register": { action: "register", resource: "auth" },
  "POST /api/task-sessions": { action: "session_start", resource: "task_session" },
  "POST /api/task-sessions/analyze": { action: "task_analyze", resource: "task_session" },
  "POST /api/client-integrations": { action: "integration_connect", resource: "integration" },
  "DELETE /api/client-integrations": { action: "integration_disconnect", resource: "integration" },
  "POST /api/bots/fabricate": { action: "bot_fabricate", resource: "bot" },
  "POST /api/bots/generate-declarations": { action: "generate_declarations", resource: "bot" },
  "POST /api/boardroom/messages": { action: "boardroom_message", resource: "boardroom" },
};

function matchAuditedAction(method: string, path: string): { action: string; resource: string } | null {
  const key = `${method} ${path}`;
  if (AUDITED_ACTIONS[key]) return AUDITED_ACTIONS[key];

  for (const [pattern, value] of Object.entries(AUDITED_ACTIONS)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (method !== pMethod) continue;
    if (path.startsWith(pPath.replace(/\/:.*$/, ""))) return value;
  }
  return null;
}

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    const matched = matchAuditedAction(req.method, req.path);
    if (matched && res.statusCode < 400) {
      const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
      db.insert(platformAuditLogTable)
        .values({
          clientId: req.user?.clientId ?? null,
          userId: req.user?.userId ?? null,
          action: matched.action,
          resource: matched.resource,
          resourceId: req.params?.id ?? null,
          metadata: { path: req.path, method: req.method, statusCode: res.statusCode },
          ipAddress,
        })
        .catch((err: unknown) => {
          console.error("Audit log write failed:", err);
        });
    }
  });

  next();
}

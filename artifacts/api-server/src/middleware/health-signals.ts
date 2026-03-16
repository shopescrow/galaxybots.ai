import type { Request, Response, NextFunction } from "express";
import { recordHealthEvent } from "../services/client-health";

function getClientId(req: Request): number | null {
  const clientId = req.user?.clientId;
  if (typeof clientId === "number" && clientId > 0) return clientId;
  const paramId = Number(req.params?.clientId);
  if (!isNaN(paramId) && paramId > 0) return paramId;
  return null;
}

function safeRecord(clientId: number, signal: string, value = 1, metadata: Record<string, string> = {}) {
  recordHealthEvent(clientId, signal, value, metadata).catch((err) => {
    console.error(`[health-signals] Failed to record ${signal} for client ${clientId}:`, String(err));
  });
}

interface SignalRule {
  method: string;
  pattern: RegExp;
  signal: string;
  statusCheck?: (body: Record<string, unknown>) => boolean;
}

const SIGNAL_RULES: SignalRule[] = [
  { method: "POST", pattern: /\/task-sessions\/?$/, signal: "task_session_started" },
  {
    method: "PATCH",
    pattern: /\/task-sessions\/\d+/,
    signal: "task_session_completed",
    statusCheck: (body) => body?.status === "completed",
  },
  { method: "POST", pattern: /\/pipelines\/\d+\/run/, signal: "pipeline_triggered" },
  { method: "POST", pattern: /\/client-integrations\/?$/, signal: "integration_connected" },
  { method: "POST", pattern: /\/conversations\/\d+\/messages/, signal: "bot_interaction" },
  { method: "GET", pattern: /\/analytics\/roi/, signal: "roi_report_viewed" },
  { method: "POST", pattern: /\/proposals\/?$/, signal: "proposal_sent" },
  {
    method: "PATCH",
    pattern: /\/proposals\/\d+/,
    signal: "proposal_won",
    statusCheck: (body) => body?.status === "won",
  },
];

export function instrumentHealthSignals(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  const wrappedJson: Response["json"] = function (body: unknown) {
    const method = req.method;
    const path = req.path;
    const status = res.statusCode;

    if (status >= 200 && status < 300) {
      const clientId = getClientId(req);
      if (clientId) {
        for (const rule of SIGNAL_RULES) {
          if (method !== rule.method) continue;
          if (!rule.pattern.test(path)) continue;
          if (rule.statusCheck) {
            const bodyObj = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
            if (!rule.statusCheck(bodyObj)) continue;
          }
          safeRecord(clientId, rule.signal, 1, { path });
          break;
        }
      }
    }

    return originalJson(body);
  };

  res.json = wrappedJson;
  next();
}

export function recordLoginSignal(clientId: number): void {
  safeRecord(clientId, "login_recorded", 1, { source: "auth" });
}

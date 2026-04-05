import { broadcastSSE } from "../platform/sse";

export type ActivityEventInput = {
  clientId: number;
  type?: string;
  eventType?: string;
  title?: string;
  description?: string;
  severity?: "info" | "warning" | "critical";
  source?: "galaxybots" | "bingolingo" | "piratemonster" | "mcp" | "system";
  link?: string;
  metadata?: unknown;
};

type ActivityEvent = {
  id: string;
  timestamp: string;
  source: "galaxybots" | "bingolingo" | "piratemonster" | "mcp" | "system";
  eventType: string;
  description: string;
  clientId: number | null;
  severity: "info" | "warning" | "critical";
  link?: string;
  metadata?: unknown;
};

export function emitActivityEvent(event: ActivityEventInput) {
  const full: ActivityEvent = {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    source: event.source ?? "galaxybots",
    severity: event.severity ?? "info",
    description: event.description ?? event.title ?? "Activity event",
    clientId: event.clientId,
    eventType: event.eventType ?? event.type ?? "event",
    link: event.link,
    metadata: event.metadata,
  };
  broadcastSSE("activity", full as unknown as Record<string, unknown>);
}

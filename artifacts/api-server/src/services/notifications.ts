import { db, notificationsTable } from "@workspace/db";
import type { InsertNotification } from "@workspace/db";
import { broadcastSSE } from "./scheduler";
import { sendPushToClient, sendPushToUser } from "./push-sender";

export async function createNotification(payload: {
  clientId: number | null;
  userId?: number | null;
  category: "prospect" | "aeo" | "competitor" | "cost" | "bot" | "pipeline" | "system";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
  isApproval?: boolean;
}) {
  if (!payload.clientId) {
    console.warn("[notifications] createNotification called without clientId — skipping to prevent cross-tenant broadcast");
    return null;
  }

  const row: InsertNotification = {
    clientId: payload.clientId,
    userId: payload.userId ?? null,
    category: payload.category,
    severity: payload.severity,
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
    metadata: payload.metadata ?? null,
  };

  const [notification] = await db.insert(notificationsTable).values(row).returning();

  broadcastSSE("notification", {
    id: notification.id,
    clientId: notification.clientId,
    category: notification.category,
    severity: notification.severity,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    createdAt: notification.createdAt.toISOString(),
  });

  const pushData: Record<string, string> = {};
  if (payload.link) pushData.route = payload.link;

  const badge = payload.metadata?.badge as number | undefined;

  try {
    if (payload.userId) {
      await sendPushToUser(payload.userId, {
        title: payload.title,
        body: payload.body,
        data: pushData,
        badge,
        category: payload.category,
        isApproval: payload.isApproval,
      });
    } else {
      await sendPushToClient(payload.clientId, {
        title: payload.title,
        body: payload.body,
        data: pushData,
        badge,
        category: payload.category,
        isApproval: payload.isApproval,
      });
    }
  } catch (err) {
    console.error("[notifications] push send failed:", err);
  }

  return notification;
}

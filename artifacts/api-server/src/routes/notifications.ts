import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

const router: IRouter = Router();

const VALID_CATEGORIES = ["prospect", "aeo", "competitor", "cost", "bot", "pipeline", "system"] as const;
const VALID_SEVERITIES = ["info", "warning", "critical"] as const;

type NotificationCategory = typeof VALID_CATEGORIES[number];
type NotificationSeverity = typeof VALID_SEVERITIES[number];

function isValidCategory(value: string): value is NotificationCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

function isValidSeverity(value: string): value is NotificationSeverity {
  return (VALID_SEVERITIES as readonly string[]).includes(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

router.get("/notifications", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const category = req.query.category as string | undefined;
  const severity = req.query.severity as string | undefined;
  const includeRead = req.query.includeRead === "true";

  if (category && !isValidCategory(category)) {
    res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }
  if (severity && !isValidSeverity(severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}` });
    return;
  }

  const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const rawOffset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  if (isNaN(rawLimit) || isNaN(rawOffset)) {
    res.status(400).json({ error: "limit and offset must be valid numbers" });
    return;
  }

  const limit = clamp(rawLimit, 1, 100);
  const offset = Math.max(0, rawOffset);

  const conditions: SQL[] = [
    eq(notificationsTable.clientId, clientId),
    isNull(notificationsTable.dismissedAt),
  ];

  if (!includeRead) {
    conditions.push(isNull(notificationsTable.readAt));
  }

  if (category && isValidCategory(category)) {
    conditions.push(sql`${notificationsTable.category} = ${category}`);
  }
  if (severity && isValidSeverity(severity)) {
    conditions.push(sql`${notificationsTable.severity} = ${severity}`);
  }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(notifications);
});

router.get("/notifications/count", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.clientId, clientId),
        isNull(notificationsTable.readAt),
        isNull(notificationsTable.dismissedAt),
      )
    );

  res.json({ unread: result[0]?.count ?? 0 });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.clientId, req.user!.clientId),
      )
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(updated);
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.clientId, clientId),
        isNull(notificationsTable.readAt),
      )
    );

  res.json({ success: true });
});

router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.clientId, req.user!.clientId),
      )
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({ success: true });
});

export default router;

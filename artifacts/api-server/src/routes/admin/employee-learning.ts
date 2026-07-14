import { Router, type IRouter } from "express";
import {
  db,
  employeeBehavioralProfilesTable,
  employeeLearningEventsTable,
  botsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/auth";
import { emitLearningSignal, refreshEmployeeProfileFromEvents, emitExplicitFeedback } from "../../services/gaa/employee-learning";

const router: IRouter = Router();

router.get(
  "/employee-learning/my-profile",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.userId;

    const bots = await db
      .select({ id: botsTable.id, name: botsTable.name, title: botsTable.title })
      .from(botsTable);

    const profiles = await db
      .select()
      .from(employeeBehavioralProfilesTable)
      .where(eq(employeeBehavioralProfilesTable.userId, userId))
      .orderBy(desc(employeeBehavioralProfilesTable.lastUpdatedAt));

    const enriched = profiles.map((p) => ({
      ...p,
      botName: bots.find((b) => b.id === p.botId)?.name ?? `Bot #${p.botId}`,
      botTitle: bots.find((b) => b.id === p.botId)?.title ?? "",
    }));

    res.json(enriched);
  },
);

router.post(
  "/employee-learning/my-profile/:botId/flag",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.userId;
    const botId = Number(req.params.botId);
    const { item, reason } = req.body as { item: string; reason?: string };

    if (isNaN(botId) || !item) {
      res.status(400).json({ error: "botId and item are required" });
      return;
    }

    const [profile] = await db
      .select()
      .from(employeeBehavioralProfilesTable)
      .where(
        and(
          eq(employeeBehavioralProfilesTable.userId, userId),
          eq(employeeBehavioralProfilesTable.botId, botId),
        ),
      );

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    await emitLearningSignal({
      userId,
      botId,
      clientId: req.user!.clientId,
      taskSessionId: 0,
      eventType: "profile_flag",
      signalData: { flaggedItem: item, reason: reason ?? "", profileId: profile.id },
      confidenceContribution: 0.2,
    });

    await refreshEmployeeProfileFromEvents({
      userId,
      botId,
      clientId: req.user!.clientId,
    }).catch(() => null);

    res.json({ ok: true, message: "Flag recorded. Profile will be updated." });
  },
);

router.post(
  "/employee-learning/my-profile/:botId/feedback",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.userId;
    const botId = Number(req.params.botId);
    const { rating, comment, taskSessionId } = req.body as { rating: number; comment?: string; taskSessionId?: number };

    if (isNaN(botId) || typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ error: "botId and rating (1-5) are required" });
      return;
    }

    await emitExplicitFeedback({
      userId,
      botId,
      clientId: req.user!.clientId,
      taskSessionId: taskSessionId ?? 0,
      rating,
      comment,
    });

    res.json({ ok: true });
  },
);

router.get(
  "/employee-learning/admin/profiles",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const clientId = req.user!.clientId;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    let query = db
      .select()
      .from(employeeBehavioralProfilesTable)
      .where(
        userId !== undefined
          ? and(
              eq(employeeBehavioralProfilesTable.clientId, clientId),
              eq(employeeBehavioralProfilesTable.userId, userId),
            )
          : eq(employeeBehavioralProfilesTable.clientId, clientId),
      )
      .orderBy(desc(employeeBehavioralProfilesTable.lastUpdatedAt));

    const profiles = await query;

    const userIds = [...new Set(profiles.map((p) => p.userId))];
    const botIds = [...new Set(profiles.map((p) => p.botId))];

    const users = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.clientId, clientId))
      : [];

    const bots = botIds.length > 0
      ? await db
          .select({ id: botsTable.id, name: botsTable.name, title: botsTable.title })
          .from(botsTable)
      : [];

    const enriched = profiles.map((p) => ({
      ...p,
      userName: users.find((u) => u.id === p.userId)?.displayName ?? `User #${p.userId}`,
      userEmail: users.find((u) => u.id === p.userId)?.email ?? "",
      botName: bots.find((b) => b.id === p.botId)?.name ?? `Bot #${p.botId}`,
      botTitle: bots.find((b) => b.id === p.botId)?.title ?? "",
    }));

    res.json(enriched);
  },
);

router.get(
  "/employee-learning/admin/profiles/:userId/events",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const clientId = req.user!.clientId;
    const userId = Number(req.params.userId);
    const botId = req.query.botId ? Number(req.query.botId) : undefined;

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    const whereCondition = botId !== undefined
      ? and(
          eq(employeeLearningEventsTable.clientId, clientId),
          eq(employeeLearningEventsTable.userId, userId),
          eq(employeeLearningEventsTable.botId, botId),
        )
      : and(
          eq(employeeLearningEventsTable.clientId, clientId),
          eq(employeeLearningEventsTable.userId, userId),
        );

    const events = await db
      .select()
      .from(employeeLearningEventsTable)
      .where(whereCondition)
      .orderBy(desc(employeeLearningEventsTable.createdAt))
      .limit(200);

    res.json(events);
  },
);

router.post(
  "/employee-learning/admin/profiles/:userId/reset",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const clientId = req.user!.clientId;
    const userId = Number(req.params.userId);
    const botId = req.query.botId ? Number(req.query.botId) : undefined;

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    if (botId !== undefined) {
      await db
        .delete(employeeBehavioralProfilesTable)
        .where(
          and(
            eq(employeeBehavioralProfilesTable.clientId, clientId),
            eq(employeeBehavioralProfilesTable.userId, userId),
            eq(employeeBehavioralProfilesTable.botId, botId),
          ),
        );
      await db
        .delete(employeeLearningEventsTable)
        .where(
          and(
            eq(employeeLearningEventsTable.clientId, clientId),
            eq(employeeLearningEventsTable.userId, userId),
            eq(employeeLearningEventsTable.botId, botId),
          ),
        );
    } else {
      await db
        .delete(employeeBehavioralProfilesTable)
        .where(
          and(
            eq(employeeBehavioralProfilesTable.clientId, clientId),
            eq(employeeBehavioralProfilesTable.userId, userId),
          ),
        );
      await db
        .delete(employeeLearningEventsTable)
        .where(
          and(
            eq(employeeLearningEventsTable.clientId, clientId),
            eq(employeeLearningEventsTable.userId, userId),
          ),
        );
    }

    res.json({ ok: true });
  },
);

export default router;

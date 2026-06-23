import { Router } from "express";
import { db, botBeliefsTable, clientBeliefsTable, clientBotsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { authenticate } from "../../middleware/auth.js";
import { broadcastSSE } from "../../services/platform/sse.js";

const router = Router();

router.get(
  "/bots/:botId/beliefs",
  authenticate,
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    if (isNaN(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }

    const beliefs = await db
      .select()
      .from(botBeliefsTable)
      .where(
        and(
          eq(botBeliefsTable.botId, botId),
          isNull(botBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(botBeliefsTable.confidence));

    res.json(beliefs);
  },
);

router.post(
  "/bots/:botId/beliefs",
  authenticate,
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    if (isNaN(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }

    const {
      beliefText,
      confidence = 0.5,
      category = "operational",
      clientId,
      immutable = false,
    } = req.body as {
      beliefText?: string;
      confidence?: number;
      category?: string;
      clientId?: number;
      immutable?: boolean;
    };

    if (!beliefText) { res.status(400).json({ error: "beliefText required" }); return; }

    const { BELIEF_HALF_LIFE_DAYS } = await import("@workspace/db");
    type BC = keyof typeof BELIEF_HALF_LIFE_DAYS;
    const halfLife = BELIEF_HALF_LIFE_DAYS[category as BC] ?? 30;

    const [belief] = await db
      .insert(botBeliefsTable)
      .values({
        botId,
        clientId: clientId ?? null,
        beliefText,
        confidence,
        category,
        halfLifeDays: halfLife,
        immutable,
        lastConfirmedAt: new Date(),
      })
      .returning();

    res.json(belief);
  },
);

router.patch(
  "/bots/:botId/beliefs/:beliefId",
  authenticate,
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    const beliefId = Number(req.params.beliefId);
    if (isNaN(botId) || isNaN(beliefId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

    const { beliefText, confidence, immutable } = req.body as {
      beliefText?: string;
      confidence?: number;
      immutable?: boolean;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (beliefText !== undefined) updates.beliefText = beliefText;
    if (confidence !== undefined) updates.confidence = confidence;
    if (immutable !== undefined) updates.immutable = immutable;

    const [updated] = await db
      .update(botBeliefsTable)
      .set(updates)
      .where(
        and(eq(botBeliefsTable.id, beliefId), eq(botBeliefsTable.botId, botId)),
      )
      .returning();

    if (!updated) { res.status(404).json({ error: "Belief not found" }); return; }
    res.json(updated);
  },
);

router.delete(
  "/bots/:botId/beliefs/:beliefId",
  authenticate,
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    const beliefId = Number(req.params.beliefId);
    if (isNaN(botId) || isNaN(beliefId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

    await db
      .update(botBeliefsTable)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(botBeliefsTable.id, beliefId), eq(botBeliefsTable.botId, botId)),
      );

    res.json({ success: true });
  },
);

router.get(
  "/clients/:clientId/beliefs",
  authenticate,
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

    const beliefs = await db
      .select()
      .from(clientBeliefsTable)
      .where(
        and(
          eq(clientBeliefsTable.clientId, clientId),
          isNull(clientBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(clientBeliefsTable.updatedAt));

    res.json(beliefs);
  },
);

router.post(
  "/clients/:clientId/beliefs",
  authenticate,
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

    const { beliefText, confidence = 0.5, category = "client_facts", authorBotId } = req.body as {
      beliefText?: string;
      confidence?: number;
      category?: string;
      authorBotId?: number;
    };

    if (!beliefText) { res.status(400).json({ error: "beliefText required" }); return; }
    if (!authorBotId) { res.status(400).json({ error: "authorBotId required" }); return; }

    const [belief] = await db
      .insert(clientBeliefsTable)
      .values({
        clientId,
        authorBotId,
        beliefText,
        confidence,
        category,
        conflictResolutionStatus: "none",
      })
      .returning();

    const assignedBots = await db
      .select({ botId: clientBotsTable.botId })
      .from(clientBotsTable)
      .where(and(eq(clientBotsTable.clientId, clientId), eq(clientBotsTable.status, "active")));

    for (const assignment of assignedBots) {
      if (assignment.botId === authorBotId) continue;
      broadcastSSE("client_belief_update", {
        clientId,
        botId: assignment.botId,
        beliefId: belief!.id,
        authorBotId,
        beliefText,
        confidence,
        category,
      });
    }

    res.json(belief);
  },
);

export default router;

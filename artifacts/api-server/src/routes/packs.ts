import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  db,
  installedPacksTable,
  clientsTable,
  botsTable,
  pipelinesTable,
  pipelineStepsTable,
  knowledgeBaseDocumentsTable,
  knowledgeBaseChunksTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { authenticate, requireRole, type AuthUser } from "../middleware/auth";
import { ALL_PACKS, getPackById } from "../data/packs";
import type { VerticalPack } from "../data/packs";
import { generateEmbedding } from "../services/memory";

function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  if (token) {
    try {
      const secret = process.env["JWT_SECRET"];
      if (secret) {
        req.user = jwt.verify(token, secret) as AuthUser;
      }
    } catch {}
  }
  next();
}

const router: IRouter = Router();

function packSummary(pack: VerticalPack, installed: boolean) {
  return {
    id: pack.id,
    name: pack.name,
    industry: pack.industry,
    icon: pack.icon,
    color: pack.color,
    tagline: pack.tagline,
    description: pack.description,
    highlights: pack.highlights,
    botCount: pack.botOverlays.length,
    scenarioCount: pack.scenarios.length,
    pipelineCount: pack.pipelines.length,
    kbDocCount: pack.kbDocuments.length,
    installed,
  };
}

router.get("/packs", optionalAuth, async (req, res): Promise<void> => {
  const clientId = req.user?.clientId;
  let installedPackIds: string[] = [];

  if (clientId) {
    const installed = await db
      .select({ packId: installedPacksTable.packId })
      .from(installedPacksTable)
      .where(eq(installedPacksTable.clientId, clientId));
    installedPackIds = installed.map((i) => i.packId);
  }

  const packs = ALL_PACKS.map((pack) =>
    packSummary(pack, installedPackIds.includes(pack.id)),
  );

  res.json(packs);
});

router.get("/packs/:packId", optionalAuth, async (req, res): Promise<void> => {
  const pack = getPackById(req.params.packId);
  if (!pack) {
    res.status(404).json({ error: "Pack not found" });
    return;
  }

  const clientId = req.user?.clientId;
  let installed = false;

  if (clientId) {
    const [existing] = await db
      .select()
      .from(installedPacksTable)
      .where(
        and(
          eq(installedPacksTable.clientId, clientId),
          eq(installedPacksTable.packId, pack.id),
        ),
      );
    installed = !!existing;
  }

  res.json({
    ...packSummary(pack, installed),
    botOverlays: pack.botOverlays.map((b) => ({
      botTitle: b.botTitle,
      description: b.overlayPrompt.substring(0, 150) + "...",
    })),
    scenarios: pack.scenarios.map((s) => ({
      title: s.title,
      category: s.category,
      difficulty: s.difficulty,
      situation: s.situation,
      actions: s.actions,
      recommendedBots: s.recommendedBots,
    })),
    pipelines: pack.pipelines.map((p) => ({
      name: p.name,
      triggerType: p.triggerType,
      stepCount: p.steps.length,
      steps: p.steps.map((s) => ({
        botTitle: s.botTitle,
        instruction: s.instruction.substring(0, 100) + "...",
      })),
    })),
    kbDocuments: pack.kbDocuments.map((k) => ({
      title: k.title,
      filename: k.filename,
    })),
  });
});

router.post(
  "/packs/:packId/install",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const pack = getPackById(req.params.packId);
    if (!pack) {
      res.status(404).json({ error: "Pack not found" });
      return;
    }

    const clientId = req.user!.clientId;

    const [existing] = await db
      .select()
      .from(installedPacksTable)
      .where(
        and(
          eq(installedPacksTable.clientId, clientId),
          eq(installedPacksTable.packId, pack.id),
        ),
      );

    if (existing) {
      res.status(409).json({ error: "Pack already installed" });
      return;
    }

    const allBots = await db.select().from(botsTable);

    const chunkEmbeddings: Map<string, (number[] | null)[]> = new Map();
    for (const kbDoc of pack.kbDocuments) {
      const chunks = kbDoc.content.match(/[\s\S]{1,800}/g) || [kbDoc.content];
      const embeddings: (number[] | null)[] = [];
      for (const chunk of chunks) {
        try {
          embeddings.push(await generateEmbedding(chunk));
        } catch (_e) {
          embeddings.push(null);
        }
      }
      chunkEmbeddings.set(kbDoc.filename, embeddings);
    }

    const result = await db.transaction(async (tx) => {
      await tx.update(clientsTable)
        .set({ industry: pack.industry })
        .where(eq(clientsTable.id, clientId));

      for (const pipeline of pack.pipelines) {
        const steps = pipeline.steps
          .map((step) => {
            const bot = allBots.find((b) => b.title === step.botTitle);
            return bot ? { botId: bot.id, instruction: step.instruction } : null;
          })
          .filter(Boolean) as { botId: number; instruction: string }[];

        if (steps.length > 0) {
          const [created] = await tx
            .insert(pipelinesTable)
            .values({
              clientId,
              name: pipeline.name,
              triggerType: pipeline.triggerType,
              active: true,
            })
            .returning();

          await tx.insert(pipelineStepsTable).values(
            steps.map((step, index) => ({
              pipelineId: created.id,
              stepOrder: index + 1,
              botId: step.botId,
              instruction: step.instruction,
            })),
          );
        }
      }

      for (const kbDoc of pack.kbDocuments) {
        const chunks = kbDoc.content.match(/[\s\S]{1,800}/g) || [kbDoc.content];
        const embeddings = chunkEmbeddings.get(kbDoc.filename) || [];

        const [doc] = await tx
          .insert(knowledgeBaseDocumentsTable)
          .values({
            clientId,
            title: kbDoc.title,
            sourceFilename: kbDoc.filename,
            fileType: "text/plain",
            chunkCount: chunks.length,
          })
          .returning();

        for (let i = 0; i < chunks.length; i++) {
          const embedding = embeddings[i];
          await tx.insert(knowledgeBaseChunksTable).values({
            documentId: doc.id,
            clientId,
            chunkText: chunks[i],
            chunkIndex: i,
            ...(embedding ? { embedding } : {}),
          });
        }
      }

      const [installed] = await tx
        .insert(installedPacksTable)
        .values({ clientId, packId: pack.id })
        .returning();

      return installed;
    });

    res.status(201).json({
      success: true,
      packId: pack.id,
      packName: pack.name,
      installedAt: result.installedAt,
      created: {
        pipelines: pack.pipelines.length,
        kbDocuments: pack.kbDocuments.length,
        botOverlays: pack.botOverlays.length,
      },
    });
  },
);

router.delete(
  "/packs/:packId/uninstall",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const clientId = req.user!.clientId;

    const [existing] = await db
      .select()
      .from(installedPacksTable)
      .where(
        and(
          eq(installedPacksTable.clientId, clientId),
          eq(installedPacksTable.packId, req.params.packId),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Pack not installed" });
      return;
    }

    await db
      .delete(installedPacksTable)
      .where(eq(installedPacksTable.id, existing.id));

    res.json({ success: true });
  },
);

export default router;

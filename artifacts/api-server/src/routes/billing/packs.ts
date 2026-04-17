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
  taskSessionsTable,
  taskSessionBotsTable,
  type WebsiteIntel,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { authenticate, requireRole, type AuthUser } from "../../middleware/auth";
import { ALL_PACKS, getPackById } from "../../data/packs";
import type { VerticalPack } from "../../data/packs";
import { generateEmbedding } from "../../services/bots/memory";
import { openai } from "@workspace/integrations-openai-ai-server";

async function generatePersonalizedObjective(
  packName: string,
  companyName: string,
  websiteIntel: WebsiteIntel | null | undefined,
  industry: string | null | undefined,
  fallbackObjective: string,
): Promise<string> {
  if (!websiteIntel?.summary && !websiteIntel?.valueProposition && !industry) {
    return fallbackObjective;
  }

  try {
    const context = [
      websiteIntel?.summary ? `Company overview: ${websiteIntel.summary}` : null,
      websiteIntel?.valueProposition ? `Value proposition: ${websiteIntel.valueProposition}` : null,
      websiteIntel?.industry ? `Industry: ${websiteIntel.industry}` : industry ? `Industry: ${industry}` : null,
      websiteIntel?.targetMarket ? `Target market: ${websiteIntel.targetMarket}` : null,
      websiteIntel?.productCategories?.length ? `Products/services: ${websiteIntel.productCategories.join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume pack onboarding, cost-efficient
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a senior business strategy consultant creating a personalized AI mission brief. Given company intelligence, create a specific, actionable mission objective for an AI executive team. The mission should reference the company's actual business context. Be specific, professional, and compelling. Keep it to 2-3 sentences max.`,
        },
        {
          role: "user",
          content: `Pack: ${packName}\nCompany: ${companyName}\n\n${context}\n\nCreate a personalized mission objective for this company's first AI-powered mission. Reference their specific industry, products, or market position.`,
        },
      ],
    });

    const personalizedObjective = completion.choices[0]?.message?.content?.trim();
    if (personalizedObjective && personalizedObjective.length > 20) {
      return `${personalizedObjective}\n\n---\n${fallbackObjective}`;
    }
  } catch (err) {
    console.error("[packs] Failed to generate personalized objective:", err);
  }

  return fallbackObjective;
}

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
  const pack = getPackById(String(req.params.packId));
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
    const pack = getPackById(String(req.params.packId));
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

    let [clientData] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));

    if (!clientData?.websiteIntel && clientData?.websiteUrl) {
      const POLL_INTERVAL_MS = 2000;
      const MAX_WAIT_MS = 10000;
      const pollStart = Date.now();
      while (Date.now() - pollStart < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const [refreshed] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
        if (refreshed?.websiteIntel) {
          clientData = refreshed;
          break;
        }
      }
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

      let pipelinesCreated = 0;
      let kbDocsCreated = 0;
      let scenariosCreated = 0;

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
          pipelinesCreated++;
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
        kbDocsCreated++;
      }

      let welcomeSessionId: number | null = null;
      let isFirstScenario = true;
      const websiteIntel = clientData?.websiteIntel as WebsiteIntel | null | undefined;
      for (const scenario of pack.scenarios) {
        const baseObjective = `[${pack.name}] ${scenario.title}\n\nCategory: ${scenario.category} | Difficulty: ${scenario.difficulty}\n\nSituation: ${scenario.situation}\n\nMission Objective: ${scenario.missionObjective}\n\nRecommended Actions:\n${scenario.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`;

        let objective = baseObjective;
        if (isFirstScenario && (websiteIntel || clientData?.industry)) {
          try {
            objective = await generatePersonalizedObjective(
              pack.name,
              clientData?.companyName ?? "your company",
              websiteIntel,
              clientData?.industry,
              baseObjective,
            );
          } catch (_e) {
            objective = baseObjective;
          }
        }
        isFirstScenario = false;

        const [session] = await tx
          .insert(taskSessionsTable)
          .values({ clientId, objective, status: "active" })
          .returning();

        if (!welcomeSessionId) welcomeSessionId = session.id;
        scenariosCreated++;

        const recommendedBotRows = allBots.filter((b) =>
          scenario.recommendedBots.some((rb) => rb.toLowerCase() === b.title.toLowerCase()),
        );

        if (recommendedBotRows.length > 0) {
          await tx.insert(taskSessionBotsTable).values(
            recommendedBotRows.map((b) => ({
              sessionId: session.id,
              botId: b.id,
              role: "member",
            })),
          );
        }
      }

      const [installed] = await tx
        .insert(installedPacksTable)
        .values({ clientId, packId: pack.id })
        .returning();

      return { installed, welcomeSessionId, pipelinesCreated, kbDocsCreated, scenariosCreated };
    });

    res.status(201).json({
      success: true,
      packId: pack.id,
      packName: pack.name,
      installedAt: result.installed.installedAt,
      welcomeSessionId: result.welcomeSessionId,
      created: {
        pipelines: result.pipelinesCreated,
        kbDocuments: result.kbDocsCreated,
        botOverlays: pack.botOverlays.length,
        scenarios: result.scenariosCreated,
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

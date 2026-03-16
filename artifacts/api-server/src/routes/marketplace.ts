import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  db,
  marketplaceTemplatesTable,
  marketplaceInstallsTable,
  botsTable,
  pipelinesTable,
  pipelineStepsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, or, ilike, sql, desc, asc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { authenticate, requireRole, type AuthUser } from "../middleware/auth";

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

router.get("/marketplace", optionalAuth, async (req, res): Promise<void> => {
  const { type, category, industry, search, sort, featured } = req.query;

  let query = db
    .select()
    .from(marketplaceTemplatesTable)
    .where(eq(marketplaceTemplatesTable.status, "approved"))
    .$dynamic();

  const conditions = [
    eq(marketplaceTemplatesTable.status, "approved"),
    eq(marketplaceTemplatesTable.visibility, "public"),
  ];

  if (type && typeof type === "string") {
    conditions.push(eq(marketplaceTemplatesTable.type, type));
  }
  if (category && typeof category === "string") {
    conditions.push(eq(marketplaceTemplatesTable.category, category));
  }
  if (featured === "true") {
    conditions.push(eq(marketplaceTemplatesTable.featured, true));
  }
  if (industry && typeof industry === "string") {
    conditions.push(sql`${marketplaceTemplatesTable.industryTags}::jsonb @> ${JSON.stringify([industry])}::jsonb`);
  }
  if (search && typeof search === "string") {
    conditions.push(
      or(
        ilike(marketplaceTemplatesTable.title, `%${search}%`),
        ilike(marketplaceTemplatesTable.description, `%${search}%`),
      )!,
    );
  }

  const templates = await db
    .select()
    .from(marketplaceTemplatesTable)
    .where(and(...conditions))
    .orderBy(
      desc(marketplaceTemplatesTable.featured),
      sort === "popular"
        ? desc(marketplaceTemplatesTable.installCount)
        : desc(marketplaceTemplatesTable.createdAt),
    );

  let filtered = templates;
  if (industry && typeof industry === "string") {
    filtered = templates.filter((t) => {
      const tags = (t.industryTags as string[]) || [];
      return tags.some((tag) => tag.toLowerCase() === industry.toLowerCase());
    });
  }

  res.json(
    filtered.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      category: t.category,
      industryTags: t.industryTags,
      authorName: t.authorName,
      installCount: t.installCount,
      featured: t.featured,
      verified: t.verified,
      createdAt: t.createdAt,
    })),
  );
});

router.get(
  "/marketplace/my-templates",
  authenticate,
  async (req, res): Promise<void> => {
    const templates = await db
      .select()
      .from(marketplaceTemplatesTable)
      .where(eq(marketplaceTemplatesTable.authorUserId, req.user!.userId))
      .orderBy(desc(marketplaceTemplatesTable.createdAt));

    res.json(templates);
  },
);

router.get("/marketplace/:id", optionalAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const [template] = await db
    .select()
    .from(marketplaceTemplatesTable)
    .where(eq(marketplaceTemplatesTable.id, id));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  if (template.status !== "approved" && template.authorUserId !== req.user?.userId) {
    if (req.user?.role !== "owner" && req.user?.role !== "admin") {
      res.status(404).json({ error: "Template not found" });
      return;
    }
  }

  let alreadyInstalled = false;
  if (req.user) {
    const [existing] = await db
      .select()
      .from(marketplaceInstallsTable)
      .where(
        and(
          eq(marketplaceInstallsTable.templateId, id),
          eq(marketplaceInstallsTable.userId, req.user.userId),
        ),
      );
    alreadyInstalled = !!existing;
  }

  res.json({
    ...template,
    alreadyInstalled,
  });
});

router.post(
  "/marketplace",
  authenticate,
  async (req, res): Promise<void> => {
    const { type, title, description, category, industryTags, visibility, sourceData } = req.body;

    if (!type || !title || !description || !category || !sourceData) {
      res.status(400).json({ error: "Missing required fields: type, title, description, category, sourceData" });
      return;
    }

    const validTypes = ["bot", "scenario", "pipeline"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: "Invalid type. Must be one of: bot, scenario, pipeline" });
      return;
    }

    const [user] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));

    const isOfficial = req.user!.role === "owner" || req.user!.role === "admin";

    const [template] = await db
      .insert(marketplaceTemplatesTable)
      .values({
        type,
        title,
        description,
        category,
        industryTags: industryTags || [],
        visibility: visibility || "public",
        sourceData,
        authorUserId: req.user!.userId,
        authorClientId: req.user!.clientId,
        authorName: user?.username || "Anonymous",
        verified: isOfficial,
        status: isOfficial ? "approved" : "pending",
      })
      .returning();

    res.status(201).json(template);
  },
);

router.post(
  "/marketplace/:id/deploy",
  authenticate,
  async (req, res): Promise<void> => {
    const templateId = Number(req.params.id);
    if (isNaN(templateId)) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const [template] = await db
      .select()
      .from(marketplaceTemplatesTable)
      .where(
        and(
          eq(marketplaceTemplatesTable.id, templateId),
          eq(marketplaceTemplatesTable.status, "approved"),
        ),
      );

    if (!template) {
      res.status(404).json({ error: "Template not found or not approved" });
      return;
    }

    const [existingInstall] = await db
      .select()
      .from(marketplaceInstallsTable)
      .where(
        and(
          eq(marketplaceInstallsTable.templateId, templateId),
          eq(marketplaceInstallsTable.userId, req.user!.userId),
        ),
      );

    const isReinstall = !!existingInstall;

    const clientId = req.user!.clientId;
    const userId = req.user!.userId;
    const data = template.sourceData as Record<string, unknown>;

    if (template.type === "bot") {
      const d = data as Record<string, unknown>;
      if (!d.name || !d.title || !d.department || !d.category || !d.description || !d.personality) {
        res.status(400).json({ error: "Bot template is missing required fields (name, title, department, category, description, personality)" });
        return;
      }
    } else if (template.type === "scenario") {
      const d = data as Record<string, unknown>;
      if (!d.objective || typeof d.objective !== "string") {
        res.status(400).json({ error: "Scenario template is missing required objective" });
        return;
      }
    } else if (template.type === "pipeline") {
      const d = data as Record<string, unknown>;
      if (!d.name || !Array.isArray(d.steps) || d.steps.length === 0) {
        res.status(400).json({ error: "Pipeline template is missing required fields (name, steps)" });
        return;
      }
    }

    try {
      await db.transaction(async (tx) => {
        if (template.type === "bot") {
          const botData = data as {
            name: string;
            title: string;
            department: string;
            category: string;
            description: string;
            responsibilities: string[];
            personality: string;
            avatar?: string;
            declaration?: string;
          };
          await tx.insert(botsTable).values({
            name: botData.name,
            title: botData.title,
            department: botData.department,
            category: botData.category,
            description: botData.description,
            responsibilities: botData.responsibilities || [],
            personality: botData.personality,
            avatar: botData.avatar,
            declaration: botData.declaration,
            isAiGenerated: true,
          });
        } else if (template.type === "scenario") {
          const scenarioData = data as {
            objective: string;
            recommendedBotTitles?: string[];
          };
          const allBots = await tx.select().from(botsTable);
          const [session] = await tx
            .insert(taskSessionsTable)
            .values({
              clientId,
              objective: scenarioData.objective,
              status: "active",
            })
            .returning();

          if (scenarioData.recommendedBotTitles && scenarioData.recommendedBotTitles.length > 0) {
            const matchedBots = allBots.filter((b) =>
              scenarioData.recommendedBotTitles!.some(
                (t) => t.toLowerCase() === b.title.toLowerCase(),
              ),
            );
            if (matchedBots.length > 0) {
              await tx.insert(taskSessionBotsTable).values(
                matchedBots.map((b) => ({
                  sessionId: session.id,
                  botId: b.id,
                  role: "member",
                })),
              );
            }
          }
        } else if (template.type === "pipeline") {
          const pipelineData = data as {
            name: string;
            triggerType: string;
            steps: { botTitle: string; instruction: string }[];
          };
          const allBots = await tx.select().from(botsTable);
          const resolvedSteps = pipelineData.steps
            .map((step) => {
              const bot = allBots.find((b) => b.title.toLowerCase() === step.botTitle.toLowerCase());
              return bot ? { botId: bot.id, instruction: step.instruction } : null;
            })
            .filter(Boolean) as { botId: number; instruction: string }[];

          if (resolvedSteps.length === 0) {
            throw new Error("Could not resolve any bot titles from the pipeline template. Ensure the required bots exist in your roster.");
          }

          const [pipeline] = await tx
            .insert(pipelinesTable)
            .values({
              clientId,
              name: pipelineData.name,
              triggerType: pipelineData.triggerType || "manual",
              active: true,
            })
            .returning();

          await tx.insert(pipelineStepsTable).values(
            resolvedSteps.map((step, index) => ({
              pipelineId: pipeline.id,
              stepOrder: index + 1,
              botId: step.botId,
              instruction: step.instruction,
            })),
          );
        }

        if (!isReinstall) {
          await tx.insert(marketplaceInstallsTable).values({
            templateId,
            userId,
            clientId,
          });

          await tx
            .update(marketplaceTemplatesTable)
            .set({ installCount: sql`${marketplaceTemplatesTable.installCount} + 1` })
            .where(eq(marketplaceTemplatesTable.id, templateId));
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Deployment failed";
      if (message.includes("marketplace_installs_unique_idx")) {
        res.status(409).json({ error: "Template already deployed to your account" });
        return;
      }
      res.status(400).json({ error: message });
      return;
    }

    res.json({ success: true, message: `${template.type} template ${isReinstall ? "re-deployed" : "deployed"} successfully`, reinstall: isReinstall });
  },
);

router.patch(
  "/marketplace/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const [template] = await db
      .select()
      .from(marketplaceTemplatesTable)
      .where(eq(marketplaceTemplatesTable.id, id));

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    if (template.authorUserId !== req.user!.userId && req.user!.role !== "owner") {
      res.status(403).json({ error: "Not authorized to edit this template" });
      return;
    }

    const { title, description, category, industryTags, visibility } = req.body;
    const updates: Record<string, unknown> = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (category) updates.category = category;
    if (industryTags) updates.industryTags = industryTags;
    if (visibility) updates.visibility = visibility;

    const [updated] = await db
      .update(marketplaceTemplatesTable)
      .set(updates)
      .where(eq(marketplaceTemplatesTable.id, id))
      .returning();

    res.json(updated);
  },
);

router.delete(
  "/marketplace/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const [template] = await db
      .select()
      .from(marketplaceTemplatesTable)
      .where(eq(marketplaceTemplatesTable.id, id));

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    if (template.authorUserId !== req.user!.userId && req.user!.role !== "owner") {
      res.status(403).json({ error: "Not authorized to delete this template" });
      return;
    }

    await db
      .delete(marketplaceTemplatesTable)
      .where(eq(marketplaceTemplatesTable.id, id));

    res.json({ success: true });
  },
);

router.get(
  "/admin/marketplace",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const status = (req.query.status as string) || "pending";
    const templates = await db
      .select()
      .from(marketplaceTemplatesTable)
      .where(eq(marketplaceTemplatesTable.status, status))
      .orderBy(asc(marketplaceTemplatesTable.createdAt));

    res.json(templates);
  },
);

router.patch(
  "/admin/marketplace/:id",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const { status, featured, verified } = req.body;
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (featured !== undefined) updates.featured = featured;
    if (verified !== undefined) updates.verified = verified;

    const [updated] = await db
      .update(marketplaceTemplatesTable)
      .set(updates)
      .where(eq(marketplaceTemplatesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.json(updated);
  },
);

export default router;

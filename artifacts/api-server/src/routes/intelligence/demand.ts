import { Router, type IRouter, type Request, type Response } from "express";
import { requireRole } from "../../middleware/auth";
import { db, demandOpportunitiesTable, assetsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  researchDemandForCategory,
  getCreationQueue,
  reviewOpportunity,
  listOpportunities,
  listCategories,
  ensureDemandResearchBot,
  type ReviewAction,
} from "../../services/intelligence/demand-engine";

const router: IRouter = Router();

const ResearchSchema = z.object({
  category: z.string().min(1).max(200),
  count: z.number().int().min(1).max(10).optional(),
  groundingContext: z.string().max(20000).optional(),
});

const ReviewSchema = z.object({
  action: z.enum(["approve", "reject", "pin", "unpin", "requeue"]),
});

router.get(
  "/demand/opportunities",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = req.user!.clientId;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const opportunities = await listOpportunities(clientId, { status, category });
      const categories = await listCategories(clientId);
      res.json({ opportunities, categories });
    } catch (err) {
      console.error("[DemandRoutes] GET /demand/opportunities error:", err);
      res.status(500).json({ error: "Failed to list demand opportunities" });
    }
  },
);

router.get(
  "/demand/queue",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = req.user!.clientId;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const includePending = req.query.includePending === "true";
      const queue = await getCreationQueue(clientId, { category, limit, includePending });
      res.json({ queue });
    } catch (err) {
      console.error("[DemandRoutes] GET /demand/queue error:", err);
      res.status(500).json({ error: "Failed to fetch creation queue" });
    }
  },
);

router.post(
  "/demand/research",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = req.user!.clientId;
      const parsed = ResearchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
        return;
      }
      const botId = await ensureDemandResearchBot();
      const result = await researchDemandForCategory(clientId, parsed.data.category, {
        botId,
        count: parsed.data.count,
        groundingContext: parsed.data.groundingContext,
      });
      res.status(201).json(result);
    } catch (err) {
      console.error("[DemandRoutes] POST /demand/research error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Demand research failed" });
    }
  },
);

router.patch(
  "/demand/opportunities/:id/review",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = req.user!.clientId;
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid opportunity id" });
        return;
      }
      const parsed = ReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
        return;
      }
      const updated = await reviewOpportunity(
        clientId,
        id,
        parsed.data.action as ReviewAction,
        req.user?.userId,
      );
      if (!updated) {
        res.status(404).json({ error: "Opportunity not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      console.error("[DemandRoutes] PATCH /demand/opportunities/:id/review error:", err);
      res.status(500).json({ error: "Failed to review opportunity" });
    }
  },
);

router.get(
  "/demand/produced-assets",
  requireRole("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = req.user!.clientId;
      const produced = await db
        .select()
        .from(demandOpportunitiesTable)
        .where(
          and(
            eq(demandOpportunitiesTable.clientId, clientId),
            eq(demandOpportunitiesTable.status, "produced"),
          ),
        );

      const assetIds = produced
        .map((o) => o.resultingAssetId)
        .filter((x): x is number => typeof x === "number");

      const assets = assetIds.length
        ? await db
            .select()
            .from(assetsTable)
            .where(
              and(
                eq(assetsTable.clientId, clientId),
                inArray(assetsTable.id, assetIds),
              ),
            )
        : [];

      const assetById = new Map(assets.map((a) => [a.id, a]));
      const links = produced.map((o) => ({
        opportunityId: o.id,
        title: o.title,
        niche: o.niche,
        category: o.category,
        opportunityScore: o.opportunityScore,
        asset: o.resultingAssetId ? (assetById.get(o.resultingAssetId) ?? null) : null,
      }));

      res.json({ links });
    } catch (err) {
      console.error("[DemandRoutes] GET /demand/produced-assets error:", err);
      res.status(500).json({ error: "Failed to fetch produced assets" });
    }
  },
);

export default router;

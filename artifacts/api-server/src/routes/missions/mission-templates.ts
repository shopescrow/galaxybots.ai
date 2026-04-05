import { Router, type IRouter } from "express";
import { db, missionTemplatesTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { z } from "zod";

const router: IRouter = Router();

const CreateMissionTemplateBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  estimatedDuration: z.string().optional(),
  recommendedBots: z.array(z.string()).default([]),
  objectiveTemplate: z.string().min(1),
  successCriteria: z.string().optional(),
});

router.get("/mission-templates", async (req, res): Promise<void> => {
  const { category } = req.query;
  const orgClientId = req.user?.clientId ?? null;

  const rows = await db
    .select()
    .from(missionTemplatesTable)
    .where(
      or(
        eq(missionTemplatesTable.isBuiltIn, true),
        and(
          eq(missionTemplatesTable.isBuiltIn, false),
          orgClientId !== null
            ? eq(missionTemplatesTable.clientId, orgClientId)
            : isNull(missionTemplatesTable.clientId)
        )
      )
    )
    .orderBy(missionTemplatesTable.category, missionTemplatesTable.name);

  if (category && typeof category === "string") {
    const filtered = rows.filter(
      (t) => t.category.toLowerCase() === category.toLowerCase()
    );
    res.json(filtered);
    return;
  }

  res.json(rows);
});

router.post("/mission-templates", requireRole("owner"), async (req, res): Promise<void> => {
  const parsed = CreateMissionTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const userId = req.user?.userId?.toString() ?? null;
  const orgClientId = req.user?.clientId ?? null;

  const [created] = await db
    .insert(missionTemplatesTable)
    .values({
      ...parsed.data,
      isBuiltIn: false,
      createdBy: userId,
      clientId: orgClientId,
    })
    .returning();

  res.status(201).json(created);
});

router.delete("/mission-templates/:id", requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template id" });
    return;
  }

  const orgClientId = req.user?.clientId ?? null;

  const [template] = await db
    .select()
    .from(missionTemplatesTable)
    .where(eq(missionTemplatesTable.id, id));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  if (template.isBuiltIn) {
    res.status(403).json({ error: "Cannot delete built-in templates" });
    return;
  }

  if (template.clientId !== null && template.clientId !== orgClientId) {
    res.status(403).json({ error: "You can only delete templates from your own organization" });
    return;
  }

  await db
    .delete(missionTemplatesTable)
    .where(and(eq(missionTemplatesTable.id, id), eq(missionTemplatesTable.isBuiltIn, false)));

  res.json({ success: true });
});

export default router;

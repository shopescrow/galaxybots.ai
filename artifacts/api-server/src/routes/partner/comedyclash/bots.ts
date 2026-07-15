import { Router, type IRouter } from "express";
import { db, botsTable } from "@workspace/db";
import { eq, and, or, isNull, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/integrations/comedyclash/bots", async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const allowedTools = (req.user as { allowedTools?: string[] | null } | undefined)?.allowedTools;

    const conditions = [
      eq(botsTable.isAvailable, true),
      or(eq(botsTable.tenantId, clientId), isNull(botsTable.tenantId)),
    ] as const;

    const bots = await db
      .select({
        id: botsTable.id,
        name: botsTable.name,
        description: botsTable.description,
        isAvailable: botsTable.isAvailable,
      })
      .from(botsTable)
      .where(and(...conditions));

    // When the API key declares an allowedTools capability list, restrict the
    // result to only those bot IDs explicitly permitted.
    const filtered = allowedTools && allowedTools.length > 0
      ? bots.filter((b) => allowedTools.includes(String(b.id)))
      : bots;

    res.json(filtered);
  } catch (err) {
    console.error("[CC] Error listing bots:", err);
    res.status(500).json({ error: "Failed to list bots" });
  }
});

export default router;

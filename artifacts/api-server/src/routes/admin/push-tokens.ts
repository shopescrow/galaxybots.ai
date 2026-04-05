import { Router, type IRouter } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.post("/push-tokens/register", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { token, platform } = req.body as { token: string; platform?: string };

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const validPlatform = platform === "android" ? "android" : platform === "web" ? "web" : "ios";

  const [existing] = await db
    .select()
    .from(pushTokensTable)
    .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));

  if (existing) {
    const [updated] = await db
      .update(pushTokensTable)
      .set({ platform: validPlatform, updatedAt: new Date() })
      .where(eq(pushTokensTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [created] = await db
    .insert(pushTokensTable)
    .values({ userId, token, platform: validPlatform })
    .returning();

  res.status(201).json(created);
});

router.delete("/push-tokens/deregister", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { token } = req.body as { token: string };

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  await db
    .delete(pushTokensTable)
    .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));

  res.json({ success: true });
});

export default router;

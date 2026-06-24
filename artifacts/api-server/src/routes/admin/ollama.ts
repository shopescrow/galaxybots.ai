import { Router, type IRouter } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { db, ollamaConfigTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { setOllamaConfig, getOllamaConfig, checkOllamaHealth, invalidateOllamaHealth } from "../../agent-core/adapters/ollama-adapter";

const router: IRouter = Router();

async function loadConfigFromDb(): Promise<void> {
  try {
    const rows = await db.select().from(ollamaConfigTable).limit(1);
    if (rows.length > 0) {
      const row = rows[0];
      setOllamaConfig({ enabled: row.enabled, model: row.model, host: row.host });
    }
  } catch {
    // Non-fatal — use in-memory defaults
  }
}

router.get("/admin/ollama/config", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    await loadConfigFromDb();
    const config = getOllamaConfig();
    const connected = await checkOllamaHealth();
    res.json({ ...config, connected });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch Ollama config" });
  }
});

router.patch("/admin/ollama/config", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const { enabled, model, host } = req.body as { enabled?: boolean; model?: string; host?: string };
  try {
    const existing = await db.select().from(ollamaConfigTable).limit(1);

    if (existing.length > 0) {
      await db
        .update(ollamaConfigTable)
        .set({
          ...(enabled !== undefined ? { enabled } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(host !== undefined ? { host } : {}),
          updatedAt: new Date(),
        })
        .where(sql`1=1`);
    } else {
      await db.insert(ollamaConfigTable).values({
        enabled: enabled ?? true,
        model: model ?? "llama3.2:3b",
        host: host ?? "localhost:11434",
      });
    }

    await loadConfigFromDb();
    invalidateOllamaHealth();
    const config = getOllamaConfig();
    const connected = await checkOllamaHealth();
    res.json({ ...config, connected });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update Ollama config" });
  }
});

router.post("/admin/ollama/test", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    await loadConfigFromDb();
    invalidateOllamaHealth();
    const connected = await checkOllamaHealth();
    const config = getOllamaConfig();
    res.json({ connected, host: config.host, model: config.model });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Test failed" });
  }
});

export { loadConfigFromDb as loadOllamaConfigFromDb };
export default router;

import { Router, type IRouter } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { getAllModelCosts, upsertModelCost } from "../../services/analytics/llm-usage";

const router: IRouter = Router();

router.get("/admin/model-costs", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    const costs = await getAllModelCosts();
    res.json(costs);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch model costs" });
  }
});

router.put("/admin/model-costs", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const { model, inputCostPerToken, outputCostPerToken, contextWindow } = req.body;
  if (!model || inputCostPerToken === undefined || outputCostPerToken === undefined) {
    res.status(400).json({ error: "model, inputCostPerToken, and outputCostPerToken are required" });
    return;
  }
  try {
    await upsertModelCost(model, Number(inputCostPerToken), Number(outputCostPerToken), Number(contextWindow ?? 128000));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update model cost" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import {
  produceDocumentAsset,
  DOCUMENT_ASSET_KINDS,
  type DocumentAssetKind,
} from "../services/content/document-assets";

const router: IRouter = Router();

/**
 * POST /api/document-assets/generate
 *
 * Generate a document asset (printable, prompt pack, or e-book) end-to-end and
 * register it in the Asset Studio at the in_review stage for human approval.
 * This is the human-triggered counterpart to the bot-facing create_* tools.
 */
router.post("/document-assets/generate", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = String(body["kind"] ?? "") as DocumentAssetKind;
  if (!DOCUMENT_ASSET_KINDS.includes(kind)) {
    res.status(400).json({
      error: `kind must be one of: ${DOCUMENT_ASSET_KINDS.join(", ")}`,
    });
    return;
  }
  const niche = typeof body["niche"] === "string" ? (body["niche"] as string).trim() : "";
  if (!niche) {
    res.status(400).json({ error: "niche is required" });
    return;
  }

  const num = (v: unknown): number | undefined =>
    typeof v === "number" && isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  try {
    const result = await produceDocumentAsset(
      {
        kind,
        niche,
        title: str(body["title"]),
        audience: str(body["audience"]),
        tone: str(body["tone"]),
        pageCount: num(body["pageCount"]),
        promptCount: num(body["promptCount"]),
        targetPlatform: str(body["targetPlatform"]),
        notes: str(body["notes"]),
      },
      {
        clientId,
        changedBy: `user:${req.user!.userId ?? "owner"}`,
      },
    );
    res.json(result);
  } catch (err) {
    console.error("[document-assets] generation failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Generation failed",
    });
  }
});

export function registerDocumentAssetRoutes(parent: IRouter) {
  parent.use(router);
}

export default router;

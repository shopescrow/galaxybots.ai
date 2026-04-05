import { Router } from "express";

export function buildMarketingRoutes(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}/reports/:slug`, async (req, res) => {
    const { slug } = req.params;
    if (!slug || !/^[0-9a-f-]{36}$/.test(slug)) {
      res.status(400).json({ error: "Invalid report slug" });
      return;
    }

    const reportBucketPath = process.env.REPORT_OBJECT_PATH || process.env.PRIVATE_OBJECT_DIR || "";
    if (!reportBucketPath) {
      res.status(503).json({ error: "Report storage not configured" });
      return;
    }

    try {
      const REPLIT_SIDECAR = "http://127.0.0.1:1106";
      const parts = reportBucketPath.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const prefix = parts.slice(1).join("/");
      const objectName = prefix ? `${prefix}/reports/${slug}.md` : `reports/${slug}.md`;

      const signReq = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method: "GET",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!signReq.ok) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const { signed_url: signedUrl } = await signReq.json() as { signed_url: string };
      const objRes = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000) });
      if (!objRes.ok) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const content = await objRes.text();
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(content);
    } catch (err) {
      console.error(`[MCP] Error serving report ${slug}:`, err);
      res.status(503).json({ error: "Report temporarily unavailable" });
    }
  });

  return router;
}

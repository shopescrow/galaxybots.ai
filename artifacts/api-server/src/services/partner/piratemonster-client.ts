import { db, mcpToolCallsTable } from "@workspace/db";

async function recordMcpToolCall(toolName: string, url: string, status: string, latencyMs: number): Promise<void> {
  await db.insert(mcpToolCallsTable).values({
    toolName,
    inputUrl: url,
    responseStatus: status,
    latencyMs,
  }).catch(() => {});
}

export async function callPmGetRecommendations(url: string): Promise<string[] | null> {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) return null;

  const start = Date.now();
  try {
    const response = await fetch(`${apiBase}/v1/recommendations?url=${encodeURIComponent(url)}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    const status = response.ok ? "success" : `http_${response.status}`;
    await recordMcpToolCall("pm_get_recommendations", url, status, latencyMs);
    if (!response.ok) return null;
    const data = await response.json() as { recommendations?: string[] };
    return Array.isArray(data.recommendations) ? data.recommendations : null;
  } catch (err) {
    await recordMcpToolCall("pm_get_recommendations", url, "error", Date.now() - start);
    console.warn("[PM] pm_get_recommendations failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function callPmGetScore(url: string): Promise<number | null> {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) return null;

  const start = Date.now();
  try {
    const response = await fetch(`${apiBase}/v1/scores?url=${encodeURIComponent(url)}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    const status = response.ok ? "success" : `http_${response.status}`;
    await recordMcpToolCall("pm_get_score", url, status, latencyMs);
    if (!response.ok) return null;
    const data = await response.json() as { score?: number; overall_score?: number };
    const score = data.score ?? data.overall_score ?? null;
    return typeof score === "number" ? score : null;
  } catch (err) {
    await recordMcpToolCall("pm_get_score", url, "error", Date.now() - start);
    console.warn("[PM] pm_get_score failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function dispatchScanToPirateMonster(scanRequestId: number, url: string): Promise<{ success: boolean; pmScanId?: string; error?: string }> {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) {
    return { success: false, error: "PirateMonster API credentials not configured" };
  }
  try {
    const response = await fetch(`${apiBase}/v1/scans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-GalaxyBots-Scan-Id": String(scanRequestId),
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PM] Scan dispatch failed for request ${scanRequestId}: HTTP ${response.status} — ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json() as { id?: string; scan_id?: string };
    const pmScanId = data.id ?? data.scan_id ?? undefined;
    return { success: true, pmScanId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PM] Scan dispatch error for request ${scanRequestId}: ${msg}`);
    return { success: false, error: msg };
  }
}

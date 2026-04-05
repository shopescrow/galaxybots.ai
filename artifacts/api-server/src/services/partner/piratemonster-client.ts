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

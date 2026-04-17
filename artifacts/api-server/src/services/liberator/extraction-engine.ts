import { chromium, type Browser, type Page } from "playwright-core";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, extractionJobsTable, extractionPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
const logger = {
  info: (obj: Record<string, unknown>, msg?: string) => console.log(`[liberator] ${msg || ""}`, JSON.stringify(obj)),
  warn: (objOrMsg: Record<string, unknown> | string, msg?: string) => {
    if (typeof objOrMsg === "string") console.warn(`[liberator] ${objOrMsg}`);
    else console.warn(`[liberator] ${msg || ""}`, JSON.stringify(objOrMsg));
  },
  error: (obj: Record<string, unknown>, msg?: string) => console.error(`[liberator] ${msg || ""}`, JSON.stringify(obj)),
};

const CHROMIUM_PATH = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || "";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  browserInstance = await chromium.launch({
    executablePath: CHROMIUM_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return browserInstance;
}

async function captureScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ fullPage: false, type: "jpeg", quality: 80 });
  return buffer.toString("base64");
}

async function extractDataWithVision(
  screenshotBase64: string,
  fields: string[],
  instructions?: string,
  extractionType?: string
): Promise<Record<string, unknown>[]> {
  const fieldList = fields.length > 0 ? fields.join(", ") : "any relevant data fields";

  let systemPrompt = `You are a data extraction specialist. You analyze screenshots of web pages and extract structured data from them.

Extract data rows from the screenshot. Each row should be a JSON object with consistent field keys.
Fields to extract: ${fieldList}
Extraction type: ${extractionType || "custom"}

Rules:
- Return ONLY a valid JSON array of objects
- Each object must have the same keys
- If a field value is not visible, use null
- Extract ALL visible rows/items, not just a sample
- Be precise with text — copy exactly what you see
- For numeric values, extract as numbers not strings
- For dates, use ISO 8601 format when possible
- Each row MUST include a "__meta" object with:
  - "confidence": numeric scores 0.0-1.0 per field key indicating how certain you are that the value is correctly read from the screenshot.
  - "region": pixel bounding box {x,y,w,h} for the WHOLE row (origin top-left of the image).
  - "regions": OPTIONAL per-field bounding boxes keyed by field name, each {x,y,w,h}, when individual cells are clearly delineated.
  Example: {"name":"Acme","email":"a@b.com","__meta":{"confidence":{"name":0.95,"email":0.7},"region":{"x":12,"y":80,"w":600,"h":40},"regions":{"name":{"x":12,"y":80,"w":180,"h":40},"email":{"x":200,"y":80,"w":280,"h":40}}}}.`;

  if (instructions) {
    systemPrompt += `\n\nAdditional instructions: ${instructions}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
          },
          {
            type: "text",
            text: "Extract all data rows from this screenshot. Return ONLY a JSON array. Include __meta.confidence per row.",
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "[]";

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.warn({ content: content.substring(0, 200) }, "No JSON array found in AI response");
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    // If the model omitted confidence, synthesize a default of 0.7 per non-meta field.
    return (parsed as Record<string, unknown>[]).map((row) => {
      const meta = (row.__meta && typeof row.__meta === "object" ? row.__meta : {}) as { confidence?: Record<string, number> };
      if (!meta.confidence) {
        const conf: Record<string, number> = {};
        for (const k of Object.keys(row)) {
          if (k === "__meta") continue;
          conf[k] = 0.7;
        }
        meta.confidence = conf;
      }
      return { ...row, __meta: meta };
    });
  } catch {
    logger.warn("Failed to parse AI extraction response as JSON");
    return [];
  }
}

export async function runExtractionForJob(jobId: number): Promise<void> {
  const [job] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, jobId));

  if (!job) {
    logger.error({ jobId }, "Extraction job not found");
    return;
  }

  await db
    .update(extractionJobsTable)
    .set({ status: "running" })
    .where(eq(extractionJobsTable.id, jobId));

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await getBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.goto(job.sourceUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const existingPages = await db
      .select()
      .from(extractionPagesTable)
      .where(eq(extractionPagesTable.jobId, jobId));

    if (existingPages.length === 0) {
      await db.insert(extractionPagesTable).values({
        jobId,
        pageUrl: job.sourceUrl,
        pageNumber: 1,
        status: "pending",
      });
    }

    await db
      .update(extractionJobsTable)
      .set({ totalPages: 1 })
      .where(eq(extractionJobsTable.id, jobId));

    const screenshotBase64 = await captureScreenshot(page);

    const pagesToProcess = await db
      .select()
      .from(extractionPagesTable)
      .where(eq(extractionPagesTable.jobId, jobId));

    const fieldMapping = (job.fieldMapping as { fields: string[]; instructions?: string } | null) ?? { fields: [] };

    for (const ep of pagesToProcess) {
      try {
        if (ep.pageNumber > 1) {
          await page.goto(ep.pageUrl, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(2000);
        }

        const screenshot = ep.pageNumber === 1 ? screenshotBase64 : await captureScreenshot(page);

        await db
          .update(extractionPagesTable)
          .set({ status: "captured", screenshotBase64: screenshot })
          .where(eq(extractionPagesTable.id, ep.id));

        const rows = await extractDataWithVision(
          screenshot,
          fieldMapping.fields,
          fieldMapping.instructions,
          job.extractionType
        );

        await db
          .update(extractionPagesTable)
          .set({ status: "extracted", extractedRows: rows })
          .where(eq(extractionPagesTable.id, ep.id));

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ pageId: ep.id, error: msg }, "Page extraction failed");
        await db
          .update(extractionPagesTable)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(extractionPagesTable.id, ep.id));
      }
    }

    const allPages = await db
      .select()
      .from(extractionPagesTable)
      .where(eq(extractionPagesTable.jobId, jobId));

    const allRows: Record<string, unknown>[] = [];
    let completedCount = 0;
    for (const p of allPages) {
      if (p.status === "extracted") {
        completedCount++;
        const rows = (p.extractedRows as Record<string, unknown>[]) ?? [];
        allRows.push(...rows);
      } else if (p.status === "failed") {
        completedCount++;
      }
    }

    await db
      .update(extractionJobsTable)
      .set({
        status: "completed",
        pagesCompleted: completedCount,
        rowsExtracted: allRows.length,
        extractedData: allRows,
      })
      .where(eq(extractionJobsTable.id, jobId));

    logger.info({ jobId, rowsExtracted: allRows.length }, "Extraction job completed");

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, error: msg }, "Extraction job failed");
    await db
      .update(extractionJobsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(extractionJobsTable.id, jobId));
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

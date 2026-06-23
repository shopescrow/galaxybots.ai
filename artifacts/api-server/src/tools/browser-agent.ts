import { z } from "zod";
import { registerTool, type ToolContext } from "./registry.js";
import { DbConfigProvider } from "../agent-core/db-adapters.js";
import { DEFAULT_LOOP_CONFIG } from "../agent-core/ports/index.js";

const browserActionSchema = z.object({
  action: z.enum(["navigate", "click", "fill", "extract", "screenshot", "close"]).describe("Browser action to perform"),
  url: z.string().optional().describe("URL to navigate to (required for navigate action)"),
  selector: z.string().optional().describe("CSS selector for click/fill/extract actions"),
  value: z.string().optional().describe("Value to fill into an input (required for fill action)"),
  idempotencyKey: z.string().optional().describe("Required for non-idempotent actions (click, fill) to prevent duplicate execution"),
  extractSchema: z.record(z.string()).optional().describe("Schema for structured content extraction: { fieldName: 'CSS selector or description' }"),
});

const browserResultSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  extracted: z.record(z.unknown()).optional(),
  screenshotBase64: z.string().optional(),
  error: z.string().optional(),
  sandboxed: z.boolean().optional(),
});

const DEFAULT_NETWORK_ALLOWLIST = [
  "*.wikipedia.org",
  "*.github.com",
  "*.stackoverflow.com",
  "*.medium.com",
  "*.docs.google.com",
];

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface BrowserSession {
  browser: import("playwright-core").Browser;
  context: import("playwright-core").BrowserContext;
  page: import("playwright-core").Page;
  createdAt: number;
  lastUsedAt: number;
  allowList: string[];
}

const browserSessions = new Map<string, BrowserSession>();

function sessionKey(context: ToolContext): string {
  return [
    context.conversationId ?? "anon",
    context.sessionId ?? "nosession",
    context.botId ?? "nobot",
    context.clientId ?? "noclient",
  ].join(":");
}

function isDomainAllowed(url: string, allowList: string[]): boolean {
  if (allowList.length === 0) return true;
  try {
    const hostname = new URL(url).hostname;
    return allowList.some((pattern) => {
      if (pattern.startsWith("*.")) {
        const domain = pattern.slice(2);
        return hostname === domain || hostname.endsWith(`.${domain}`);
      }
      return hostname === pattern;
    });
  } catch {
    return false;
  }
}

async function evictExpiredSessions(): Promise<void> {
  const now = Date.now();
  for (const [key, session] of browserSessions.entries()) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      try {
        await session.browser.close();
      } catch {
        // ignore cleanup errors
      }
      browserSessions.delete(key);
    }
  }
}

let playwright: typeof import("playwright-core") | null = null;

async function getPlaywright(): Promise<typeof import("playwright-core")> {
  if (!playwright) {
    playwright = await import("playwright-core");
  }
  return playwright;
}

const configProvider = new DbConfigProvider();

registerTool({
  name: "browser_agent",
  description: "Control a persistent headless browser to navigate web pages, fill forms, click elements, extract structured content, and capture screenshots. Session persists across actions within the same conversation — you must navigate first, then interact with the loaded page. Non-idempotent actions (click, fill) require an idempotencyKey. Use 'close' when done to free resources.",
  inputSchema: browserActionSchema,
  outputSchema: browserResultSchema,
  execute: async (input, context: ToolContext) => {
    const { action, url, selector, value, idempotencyKey, extractSchema } = input;

    await evictExpiredSessions();

    // Load per-bot config to get the network allow-list
    const loopConfig = await configProvider.getLoopConfig(
      context.botId ?? 0,
      context.clientId,
    ).catch(() => DEFAULT_LOOP_CONFIG);

    const allowList = loopConfig.networkAllowList.length > 0
      ? loopConfig.networkAllowList
      : DEFAULT_NETWORK_ALLOWLIST;

    if ((action === "click" || action === "fill") && !idempotencyKey) {
      return {
        success: false,
        action,
        error: `Non-idempotent action "${action}" requires an idempotencyKey to prevent duplicate execution.`,
      };
    }

    if (url && !isDomainAllowed(url, allowList)) {
      return {
        success: false,
        action,
        url,
        error: `URL is not on the network allow-list for this bot. Allowed patterns: ${allowList.join(", ")}`,
      };
    }

    const key = sessionKey(context);
    let session = browserSessions.get(key);

    if (action === "close") {
      if (session) {
        try {
          await session.browser.close();
        } catch {
          // ignore
        }
        browserSessions.delete(key);
      }
      return { success: true, action, content: "Browser session closed" };
    }

    if (action === "navigate") {
      if (!url) {
        return { success: false, action, error: "url is required for navigate action" };
      }

      let pw: typeof import("playwright-core");
      try {
        pw = await getPlaywright();
      } catch {
        return {
          success: false,
          action,
          error: "Browser agent requires playwright-core. Please ensure it is installed.",
        };
      }

      try {
        // Create a fresh session (or reuse if exists)
        if (!session) {
          const browser = await pw.chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          });
          const browserContext = await browser.newContext({
            userAgent: "GalaxyBots-Agent/1.0 (Autonomous AI Browser Agent)",
            viewport: { width: 1280, height: 720 },
            javaScriptEnabled: true,
          });
          const page = await browserContext.newPage();
          page.setDefaultTimeout(15_000);
          session = {
            browser,
            context: browserContext,
            page,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            allowList,
          };
          browserSessions.set(key, session);
        }

        session.lastUsedAt = Date.now();
        await session.page.goto(url, { waitUntil: "domcontentloaded" });

        // Enforce allow-list against the final URL after redirects
        const finalUrl = session.page.url();
        if (!isDomainAllowed(finalUrl, allowList)) {
          await session.browser.close().catch(() => {});
          browserSessions.delete(key);
          return {
            success: false,
            action,
            url: finalUrl,
            error: `Navigation redirected to a URL outside the network allow-list: ${finalUrl}. Session closed. Allowed patterns: ${allowList.join(", ")}`,
          };
        }

        const title = await session.page.title();
        const bodyText = (await session.page.locator("body").innerText().catch(() => "")).slice(0, 3000);

        return {
          success: true,
          action,
          url: finalUrl,
          title,
          content: bodyText,
        };
      } catch (err) {
        // On navigation error, close and remove the broken session
        if (session) {
          await session.browser.close().catch(() => {});
          browserSessions.delete(key);
        }
        return {
          success: false,
          action,
          url,
          error: err instanceof Error ? err.message : "Navigation failed",
        };
      }
    }

    // All non-navigate, non-close actions require an existing session
    if (!session) {
      return {
        success: false,
        action,
        error: `No active browser session for this conversation. Use the "navigate" action first to open a page before using "${action}".`,
      };
    }

    session.lastUsedAt = Date.now();

    // Enforce allow-list against current page URL before every interaction
    const currentUrl = session.page.url();
    if (currentUrl && currentUrl !== "about:blank" && !isDomainAllowed(currentUrl, session.allowList)) {
      await session.browser.close().catch(() => {});
      browserSessions.delete(key);
      return {
        success: false,
        action,
        url: currentUrl,
        error: `Current page URL is outside the network allow-list: ${currentUrl}. Session closed to enforce sandbox policy.`,
      };
    }

    try {
      if (action === "click") {
        if (!selector) {
          return { success: false, action, error: "selector is required for click action" };
        }
        await session.page.click(selector);
        await session.page.waitForTimeout(500);
        return {
          success: true,
          action,
          url: session.page.url(),
          content: `Clicked element matching "${selector}"`,
        };
      }

      if (action === "fill") {
        if (!selector) {
          return { success: false, action, error: "selector is required for fill action" };
        }
        if (value === undefined) {
          return { success: false, action, error: "value is required for fill action" };
        }
        await session.page.fill(selector, value);
        return {
          success: true,
          action,
          url: session.page.url(),
          content: `Filled element "${selector}" with provided value`,
        };
      }

      if (action === "extract") {
        const extracted: Record<string, unknown> = {};
        if (extractSchema) {
          for (const [fieldName, cssSelector] of Object.entries(extractSchema)) {
            try {
              const elements = await session.page.locator(cssSelector).allTextContents();
              extracted[fieldName] = elements.length === 1 ? elements[0] : elements;
            } catch {
              extracted[fieldName] = null;
            }
          }
        } else {
          const bodyText = (await session.page.locator("body").innerText().catch(() => "")).slice(0, 5000);
          extracted["text"] = bodyText;
        }
        return {
          success: true,
          action,
          url: session.page.url(),
          extracted,
        };
      }

      if (action === "screenshot") {
        const screenshotBuffer = await session.page.screenshot({ type: "jpeg", quality: 70 });
        const base64 = Buffer.from(screenshotBuffer).toString("base64");
        return {
          success: true,
          action,
          url: session.page.url(),
          title: await session.page.title(),
          screenshotBase64: `data:image/jpeg;base64,${base64}`,
        };
      }

      return { success: false, action, error: `Unknown action: ${action}` };
    } catch (err) {
      return {
        success: false,
        action,
        url: session.page.url(),
        error: err instanceof Error ? err.message : "Browser action failed",
      };
    }
  },
});

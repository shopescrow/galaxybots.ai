import { z } from "zod";
import * as cheerio from "cheerio";
import { registerTool, type ToolContext } from "../registry";
import { logToolActivity } from "./_shared";

function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    return isPrivateIP(mapped);
  }
  return false;
}

registerTool({
  name: "scrape_webpage",
  description: "Fetch a web page URL and extract its text content. Strips HTML tags and returns clean readable text. Every scrape is logged for compliance.",
  inputSchema: z.object({
    url: z.string().describe("The URL to scrape"),
    maxLength: z.number().optional().describe("Maximum characters to return (default 5000)"),
  }),
  execute: async (input, context: ToolContext) => {
    const maxLen = input.maxLength ?? 5000;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.url);
    } catch {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "invalid_url" } });
      return { success: false, error: "Invalid URL." };
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "invalid_protocol" } });
      return { success: false, error: "Only HTTP and HTTPS URLs are supported." };
    }

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".local") ||
        hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "blocked_hostname" } });
      return { success: false, error: "Scraping internal/private network addresses is not allowed." };
    }

    try {
      const dns = await import("node:dns");
      const { resolve4, resolve6 } = dns.promises;
      const ips: string[] = [];
      try {
        const v4 = await resolve4(hostname);
        ips.push(...v4);
      } catch {}
      try {
        const v6 = await resolve6(hostname);
        ips.push(...v6);
      } catch {}

      if (ips.length === 0) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "dns_failed" } });
        return { success: false, error: "Could not resolve hostname." };
      }

      const privateIp = ips.find(isPrivateIP);
      if (privateIp) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "private_ip", resolvedIp: privateIp } });
        return { success: false, error: "Scraping internal/private network addresses is not allowed." };
      }

      const response = await fetch(input.url, {
        headers: { "User-Agent": "GalaxyBots/1.0 (Web Scraper)" },
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "redirect_blocked", redirectTo: location } });
        return { success: false, error: "Redirects are not followed for security reasons. Target URL redirects to: " + (location || "unknown") };
      }
      if (!response.ok) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { httpStatus: response.status } });
        return { success: false, error: `HTTP ${response.status} from ${input.url}` };
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, noscript, iframe").remove();
      const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxLen);
      const title = $("title").text().trim();

      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { title, contentLength: text.length } });

      return { success: true, url: input.url, title, content: text };
    } catch (err) {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { error: true } });
      return { success: false, error: err instanceof Error ? err.message : "Failed to scrape webpage" };
    }
  },
});

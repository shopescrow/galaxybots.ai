import { z } from "zod";
import dns from "node:dns/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0" || ip === "::") {
    return true;
  }

  const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    return false;
  }

  const lower = ip.toLowerCase();
  if (lower.startsWith("fc00:") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower === "::1" || lower === "::") return true;

  return false;
}

export async function validateUrl(urlStr: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Unsupported protocol: ${parsed.protocol}`;
  }

  const hostname = parsed.hostname;

  if (/\.internal$/i.test(hostname) || /\.local$/i.test(hostname)) {
    return "Blocked hostname: requests to internal/private addresses are not allowed";
  }
  if (/^metadata\.google\.internal$/i.test(hostname)) {
    return "Blocked hostname: requests to cloud metadata services are not allowed";
  }
  if (/^localhost$/i.test(hostname)) {
    return "Blocked hostname: requests to localhost are not allowed";
  }

  const ipv4Direct = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Direct) {
    if (isPrivateIp(hostname)) {
      return "Blocked: requests to private/internal IP addresses are not allowed";
    }
    return null;
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const rawIp = hostname.slice(1, -1);
    if (isPrivateIp(rawIp)) {
      return "Blocked: requests to private/internal IP addresses are not allowed";
    }
    return null;
  }

  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      return `DNS resolution failed: could not resolve hostname "${hostname}"`;
    }

    for (const addr of allAddresses) {
      if (isPrivateIp(addr)) {
        return `Blocked: hostname "${hostname}" resolves to private/internal IP address`;
      }
    }
  } catch {
    return `DNS resolution failed for hostname "${hostname}"`;
  }

  return null;
}

export function registerHttpFetchTool(server: McpServer): void {
  server.tool(
    "http_fetch",
    "Make an outbound HTTP request to an external URL. Supports GET and POST methods with optional headers and body. Internal/private network addresses are blocked for security.",
    {
      url: z.string().url().describe("The URL to fetch (must be an external http/https URL)"),
      method: z.enum(["GET", "POST"]).optional().default("GET").describe("HTTP method (GET or POST)"),
      headers: z.record(z.string()).optional().describe("Optional HTTP headers as key-value pairs"),
      body: z.string().optional().describe("Optional request body (for POST requests)"),
    },
    async ({ url, method, headers, body }) => {
      console.log(`[MCP] http_fetch: ${method} ${url}`);
      try {
        const blockReason = await validateUrl(url);
        if (blockReason) {
          console.log(`[MCP] http_fetch: Blocked - ${blockReason}`);
          return {
            content: [{ type: "text" as const, text: `Request blocked: ${blockReason}` }],
            isError: true,
          };
        }

        const timeout = 30_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method,
          headers: headers || {},
          redirect: "manual",
          signal: controller.signal,
        };

        if (method === "POST" && body) {
          fetchOptions.body = body;
        }

        let res = await fetch(url, fetchOptions);
        let redirectCount = 0;
        const maxRedirects = 5;
        let currentUrl = url;

        while (
          redirectCount < maxRedirects &&
          (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308)
        ) {
          const location = res.headers.get("location");
          if (!location) break;

          const redirectUrl = new URL(location, currentUrl).toString();
          const redirectBlockReason = await validateUrl(redirectUrl);
          if (redirectBlockReason) {
            clearTimeout(timer);
            console.log(`[MCP] http_fetch: Redirect blocked - ${redirectBlockReason}`);
            return {
              content: [{ type: "text" as const, text: `Redirect blocked: ${redirectBlockReason}` }],
              isError: true,
            };
          }

          console.log(`[MCP] http_fetch: Following redirect to ${redirectUrl}`);
          currentUrl = redirectUrl;
          res = await fetch(redirectUrl, { ...fetchOptions, method: "GET" });
          redirectCount++;
        }

        clearTimeout(timer);

        const responseBody = await res.text();

        console.log(`[MCP] http_fetch: ${method} ${url} -> ${res.status}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: res.status,
              statusText: res.statusText,
              headers: Object.fromEntries(res.headers.entries()),
              body: responseBody.length > 10000
                ? responseBody.substring(0, 10000) + "\n...[truncated]"
                : responseBody,
            }, null, 2),
          }],
        };
      } catch (error) {
        console.error("[MCP] http_fetch: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error fetching URL: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

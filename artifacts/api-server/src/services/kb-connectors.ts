import crypto from "crypto";

export interface FetchedDocument {
  externalId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  lastModified?: Date;
}

export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  if (!text || text.length === 0) return chunks;

  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(". ", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChunkSize / 2) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks.filter(c => c.length > 0);
}

export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchGoogleDriveDocuments(config: {
  folderId: string;
  accessToken: string;
}): Promise<FetchedDocument[]> {
  const { folderId, accessToken } = config;
  const documents: FetchedDocument[] = [];

  try {
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime)&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      throw new Error(`Google Drive API error: ${listRes.status} ${await listRes.text()}`);
    }

    const data = await listRes.json() as { files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }> };

    for (const file of data.files || []) {
      try {
        let content = "";
        if (file.mimeType === "application/vnd.google-apps.document") {
          const exportRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (exportRes.ok) content = await exportRes.text();
        } else if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
          const dlRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (dlRes.ok) content = await dlRes.text();
        }

        if (content.trim()) {
          documents.push({
            externalId: file.id,
            title: file.name,
            content,
            sourceUrl: `https://docs.google.com/document/d/${file.id}`,
            lastModified: new Date(file.modifiedTime),
          });
        }
      } catch (err) {
        console.error(`Failed to fetch Google Drive file ${file.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Google Drive connector error:", err);
    throw err;
  }

  return documents;
}

export async function fetchConfluenceDocuments(config: {
  baseUrl: string;
  spaceKey: string;
  email: string;
  apiToken: string;
}): Promise<FetchedDocument[]> {
  const { baseUrl, spaceKey, email, apiToken } = config;
  const documents: FetchedDocument[] = [];
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/rest/api/content?spaceKey=${spaceKey}&expand=body.storage,version&limit=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Confluence API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      results: Array<{
        id: string;
        title: string;
        body: { storage: { value: string } };
        version: { when: string };
        _links: { webui: string };
      }>;
    };

    for (const page of data.results || []) {
      const plainText = stripHtml(page.body?.storage?.value || "");
      if (plainText.trim()) {
        documents.push({
          externalId: page.id,
          title: page.title,
          content: plainText,
          sourceUrl: `${baseUrl.replace(/\/$/, "")}${page._links?.webui || ""}`,
          lastModified: page.version?.when ? new Date(page.version.when) : undefined,
        });
      }
    }
  } catch (err) {
    console.error("Confluence connector error:", err);
    throw err;
  }

  return documents;
}

export async function fetchSharePointDocuments(config: {
  siteId: string;
  driveId: string;
  accessToken: string;
}): Promise<FetchedDocument[]> {
  const { siteId, driveId, accessToken } = config;
  const documents: FetchedDocument[] = [];

  try {
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/children?$select=id,name,file,lastModifiedDateTime,webUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      throw new Error(`SharePoint API error: ${listRes.status} ${await listRes.text()}`);
    }

    const data = await listRes.json() as {
      value: Array<{
        id: string;
        name: string;
        file?: { mimeType: string };
        lastModifiedDateTime: string;
        webUrl: string;
      }>;
    };

    for (const item of data.value || []) {
      if (!item.file) continue;

      try {
        let content = "";
        const mime = item.file.mimeType || "";
        if (mime === "text/plain" || mime === "text/markdown" || item.name.endsWith(".txt") || item.name.endsWith(".md")) {
          const dlRes = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${item.id}/content`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (dlRes.ok) content = await dlRes.text();
        } else if (mime.includes("wordprocessingml") || item.name.endsWith(".docx")) {
          content = `[DOCX file: ${item.name} — text extraction requires additional processing]`;
        }

        if (content.trim()) {
          documents.push({
            externalId: item.id,
            title: item.name,
            content,
            sourceUrl: item.webUrl,
            lastModified: new Date(item.lastModifiedDateTime),
          });
        }
      } catch (err) {
        console.error(`Failed to fetch SharePoint item ${item.id}:`, err);
      }
    }
  } catch (err) {
    console.error("SharePoint connector error:", err);
    throw err;
  }

  return documents;
}

function isPrivateOrReservedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (hostname === "0.0.0.0") return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  const parts = hostname.split(".");
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const octets = parts.map(Number);
    if (octets[0] === 10) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
  }
  return false;
}

export async function fetchWebsiteDocuments(config: {
  rootUrl: string;
  maxDepth?: number;
  maxPages?: number;
}): Promise<FetchedDocument[]> {
  const { rootUrl, maxDepth = 2, maxPages = 50 } = config;
  const documents: FetchedDocument[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];

  const baseUrl = new URL(rootUrl);

  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (isPrivateOrReservedHost(baseUrl.hostname)) {
    throw new Error("Cannot crawl private or reserved network addresses");
  }

  while (queue.length > 0 && documents.length < maxPages) {
    const item = queue.shift();
    if (!item) break;

    const normalizedUrl = item.url.split("#")[0].split("?")[0].replace(/\/$/, "");
    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(item.url, {
        headers: { "User-Agent": "GalaxyBots-KnowledgeBot/1.0" },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;

      const html = await res.text();
      const plainText = stripHtml(html);

      if (plainText.length > 50) {
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        documents.push({
          externalId: normalizedUrl,
          title: titleMatch?.[1] ? stripHtml(titleMatch[1]) : normalizedUrl,
          content: plainText.substring(0, 50000),
          sourceUrl: item.url,
          lastModified: new Date(),
        });
      }

      if (item.depth < maxDepth) {
        const linkRegex = /href=["']([^"']+)["']/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          try {
            const link = new URL(match[1], item.url);
            if (
              link.hostname === baseUrl.hostname &&
              ["http:", "https:"].includes(link.protocol) &&
              !isPrivateOrReservedHost(link.hostname) &&
              !visited.has(link.href.replace(/\/$/, ""))
            ) {
              queue.push({ url: link.href, depth: item.depth + 1 });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(`Failed to crawl ${item.url}:`, err);
    }
  }

  return documents;
}

export async function fetchDocumentsForSource(
  sourceType: string,
  config: Record<string, unknown>
): Promise<FetchedDocument[]> {
  switch (sourceType) {
    case "google_drive":
      return fetchGoogleDriveDocuments(config as Parameters<typeof fetchGoogleDriveDocuments>[0]);
    case "confluence":
      return fetchConfluenceDocuments(config as Parameters<typeof fetchConfluenceDocuments>[0]);
    case "sharepoint":
      return fetchSharePointDocuments(config as Parameters<typeof fetchSharePointDocuments>[0]);
    case "website":
      return fetchWebsiteDocuments(config as Parameters<typeof fetchWebsiteDocuments>[0]);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

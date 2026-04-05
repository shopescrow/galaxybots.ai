import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "create_document",
  description: "Create a new Notion page/document using the client's Notion integration token. Creates a page in the workspace with the given title and content.",
  inputSchema: z.object({
    title: z.string().describe("Document title"),
    content: z.string().describe("Document content (plain text)"),
    parentPageId: z.string().optional().describe("Parent page ID to nest under. If not provided, the first available page in the workspace will be used."),
  }),
  execute: withCredentialRetry("notion", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "notion");
    if (!credential) {
      return { success: false, error: "No Notion credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
    try {
      let parentId = input.parentPageId;
      if (!parentId) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({ filter: { value: "page", property: "object" }, page_size: 1 }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { results: Array<{ id: string }> };
          parentId = searchData.results[0]?.id;
        }
        if (!parentId) {
          return { success: false, error: "No parentPageId provided and no pages found in workspace. Please provide a parentPageId." };
        }
      }
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { page_id: parentId },
          properties: {
            title: { title: [{ text: { content: input.title } }] },
          },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: input.content } }],
              },
            },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Notion API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { id: string; url: string };
      return { success: true, pageId: data.id, url: data.url, title: input.title };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create Notion document" };
    }
  }),
});

registerTool({
  name: "read_document",
  description: "Read a Notion page by ID or search for one by title. Returns the page title and text content.",
  inputSchema: z.object({
    pageId: z.string().optional().describe("Notion page ID to read directly"),
    searchTitle: z.string().optional().describe("Search for a page by title (used if pageId not provided)"),
  }),
  execute: withCredentialRetry("notion", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "notion");
    if (!credential) {
      return { success: false, error: "No Notion credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
    try {
      let targetPageId = input.pageId;
      if (!targetPageId && input.searchTitle) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({ query: input.searchTitle, filter: { value: "page", property: "object" }, page_size: 1 }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { results: Array<{ id: string }> };
          targetPageId = searchData.results[0]?.id;
        }
      }
      if (!targetPageId) {
        return { success: false, error: "Page not found. Provide a pageId or a valid searchTitle." };
      }

      const pageRes = await fetch(`https://api.notion.com/v1/pages/${targetPageId}`, { headers });
      let pageTitle = "";
      if (pageRes.ok) {
        const pageData = await pageRes.json() as { properties?: { title?: { title?: Array<{ plain_text: string }> }; [key: string]: unknown } };
        const titleProp = pageData.properties?.title;
        if (titleProp && "title" in titleProp && Array.isArray(titleProp.title)) {
          pageTitle = titleProp.title.map((t: { plain_text: string }) => t.plain_text).join("");
        }
        if (!pageTitle) {
          for (const prop of Object.values(pageData.properties ?? {})) {
            const p = prop as { type?: string; title?: Array<{ plain_text: string }> };
            if (p.type === "title" && p.title) {
              pageTitle = p.title.map((t) => t.plain_text).join("");
              break;
            }
          }
        }
      }

      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${targetPageId}/children?page_size=100`, { headers });
      if (!blocksRes.ok) {
        return { success: false, error: `Notion API error: ${blocksRes.status}` };
      }
      const blocksData = await blocksRes.json() as { results: Array<{ type: string; [key: string]: unknown }> };
      const textParts: string[] = [];
      for (const block of blocksData.results) {
        const blockContent = (block as Record<string, unknown>)[block.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
        if (blockContent?.rich_text) {
          textParts.push(blockContent.rich_text.map((t) => t.plain_text).join(""));
        }
      }
      return { success: true, pageId: targetPageId, title: pageTitle, content: textParts.join("\n") };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to read Notion document" };
    }
  }),
});

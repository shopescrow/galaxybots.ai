import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, logToolActivity, withCredentialRetry } from "./_shared";

registerTool({
  name: "bingolingo_create_content",
  description: "Generate AI-powered content via BingoLingo. Creates a blog post, LinkedIn article, Twitter/X thread, email newsletter, press release, or case study for the client. Requires the client to have a BingoLingo API key configured in Integrations.",
  inputSchema: z.object({
    contentType: z.enum(["blog", "linkedin", "twitter", "email", "press_release", "case_study"]).describe("Type of content to generate"),
    topic: z.string().describe("The topic or subject for the content"),
    tone: z.enum(["professional", "conversational", "thought_leadership", "educational", "bold"]).optional().describe("Writing tone (default: professional)"),
    keywords: z.array(z.string()).optional().describe("Optional keywords to incorporate into the content"),
  }),
  execute: withCredentialRetry("bingolingo", async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BingoLingo-Key": apiKey,
        },
        body: JSON.stringify({
          contentType: input.contentType,
          topic: input.topic,
          tone: input.tone,
          keywords: input.keywords,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json() as { id: number; title: string };
      await logToolActivity("bingolingo_create_content", context, { metadata: { contentId: content.id, contentType: input.contentType, topic: input.topic } });
      return { success: true, content, message: `${input.contentType} content created as draft: "${content.title}"` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create BingoLingo content" };
    }
  }),
});

registerTool({
  name: "bingolingo_publish",
  description: "Publish a draft piece of content on BingoLingo. Changes the status from draft to published and makes it visible on the client's public content hub.",
  inputSchema: z.object({
    contentId: z.number().describe("The ID of the BingoLingo content to publish"),
  }),
  execute: withCredentialRetry("bingolingo", async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BingoLingo-Key": apiKey,
        },
        body: JSON.stringify({ contentId: input.contentId }),
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json() as { title: string };
      await logToolActivity("bingolingo_publish", context, { metadata: { contentId: input.contentId } });
      return { success: true, content, message: `Content "${content.title}" published successfully` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to publish BingoLingo content" };
    }
  }),
});

registerTool({
  name: "bingolingo_list_content",
  description: "List content pieces from BingoLingo for the client. Filter by status (draft/published/archived) or content type.",
  inputSchema: z.object({
    status: z.enum(["draft", "published", "archived"]).optional().describe("Filter by content status"),
    type: z.enum(["blog", "linkedin", "twitter", "email", "press_release", "case_study"]).optional().describe("Filter by content type"),
  }),
  execute: withCredentialRetry("bingolingo", async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const params = new URLSearchParams();
      if (input.status) params.set("status", input.status);
      if (input.type) params.set("type", input.type);
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/content?${params.toString()}`, {
        headers: { "X-BingoLingo-Key": apiKey },
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json() as Array<unknown>;
      await logToolActivity("bingolingo_list_content", context, { metadata: { count: content.length, filters: input } });
      return { success: true, content, count: content.length };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to list BingoLingo content" };
    }
  }),
});

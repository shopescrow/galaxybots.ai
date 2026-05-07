import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { logToolActivity } from "./_shared";

const SABRINA_SUPABASE_URL = process.env.SABRINA_SUPABASE_URL ?? "https://fnrmbtzxuuzmydocnpux.supabase.co";
const SABRINA_ANON_KEY = process.env.SABRINA_ANON_KEY ?? "";

registerTool({
  name: "browse_sabrina_automations",
  description: "Search the Sabrina Automations public catalog for pre-built automation workflows. Returns matching automations with titles, descriptions, categories, platforms, and template download URLs. No credentials required.",
  inputSchema: z.object({
    keyword: z.string().optional().describe("Text to search for in automation title or description"),
    category: z.string().optional().describe("Filter by category (e.g. 'Marketing', 'Sales', 'Customer Support')"),
    platform: z.string().optional().describe("Filter by platform (e.g. 'n8n', 'make', 'zapier')"),
  }),
  execute: async (input, context: ToolContext) => {
    try {
      const params = new URLSearchParams();
      params.set("select", "id,title,description,categories,platform,tools_used,tutorial_url,template_url");
      params.set("limit", "10");

      if (input.keyword) {
        params.set("or", `(title.ilike.*${input.keyword}*,description.ilike.*${input.keyword}*)`);
      }
      if (input.category) {
        params.set("categories", `cs.{${input.category}}`);
      }
      if (input.platform) {
        params.set("platform", `eq.${input.platform}`);
      }

      const url = `${SABRINA_SUPABASE_URL}/rest/v1/automations?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          apikey: SABRINA_ANON_KEY,
          Authorization: `Bearer ${SABRINA_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errText = await response.text();
        await logToolActivity("browse_sabrina_automations", context, {
          metadata: { keyword: input.keyword, category: input.category, platform: input.platform, httpStatus: response.status, error: true },
        });
        return { success: false, automations: [], error: `Sabrina API error: ${response.status} - ${errText}` };
      }

      const automations = await response.json() as Array<{
        id: string;
        title: string;
        description: string;
        categories: string[];
        platform: string;
        tools_used: string[];
        tutorial_url: string | null;
        template_url: string | null;
      }>;

      await logToolActivity("browse_sabrina_automations", context, {
        metadata: { keyword: input.keyword, category: input.category, platform: input.platform, resultCount: automations.length },
      });

      return { success: true, automations };
    } catch (err) {
      await logToolActivity("browse_sabrina_automations", context, {
        metadata: { keyword: input.keyword, category: input.category, platform: input.platform, error: true },
      });
      return { success: false, automations: [], error: err instanceof Error ? err.message : "Failed to browse Sabrina automations" };
    }
  },
});

registerTool({
  name: "download_sabrina_automation",
  description: "Download and return the JSON workflow file for a specific Sabrina automation. Use the template_url from browse_sabrina_automations results.",
  inputSchema: z.object({
    template_url: z.string().describe("The template_url of the automation to download (from browse_sabrina_automations output)"),
  }),
  execute: async (input, context: ToolContext) => {
    const allowedPrefix = `${SABRINA_SUPABASE_URL}/storage/`;
    if (!input.template_url.startsWith(allowedPrefix)) {
      return { success: false, error: `Invalid template URL. Must start with ${allowedPrefix}` };
    }

    try {
      const response = await fetch(input.template_url, {
        headers: {
          apikey: SABRINA_ANON_KEY,
          Authorization: `Bearer ${SABRINA_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        await logToolActivity("download_sabrina_automation", context, {
          url: input.template_url,
          metadata: { httpStatus: response.status, error: true },
        });
        return { success: false, error: `Failed to download template: HTTP ${response.status}` };
      }

      const content = await response.json();

      await logToolActivity("download_sabrina_automation", context, {
        url: input.template_url,
        metadata: { contentSize: JSON.stringify(content).length },
      });

      return { success: true, template_url: input.template_url, workflow: JSON.stringify(content) };
    } catch (err) {
      await logToolActivity("download_sabrina_automation", context, {
        url: input.template_url,
        metadata: { error: true },
      });
      return { success: false, error: err instanceof Error ? err.message : "Failed to download automation template" };
    }
  },
});

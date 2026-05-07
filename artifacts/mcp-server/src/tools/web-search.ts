import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerWebSearchTool(server: McpServer): void {
  server.tool(
    "web_search",
    "Search the web for information. Uses SerpAPI when SERPAPI_KEY is set, otherwise returns a stub response indicating dev mode.",
    {
      query: z.string().describe("The search query string"),
      numResults: z.number().optional().default(5).describe("Number of results to return (default: 5)"),
    },
    async ({ query, numResults }) => {
      console.log(`[MCP] web_search: query="${query}", numResults=${numResults}`);
      try {
        const serpApiKey = process.env.SERPAPI_KEY;

        if (!serpApiKey) {
          console.log("[MCP] web_search: SERPAPI_KEY not set, returning stub response");
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                mode: "dev-stub",
                message: "SERPAPI_KEY is not set. In production, this would return live search results.",
                query,
                results: [
                  {
                    title: `[Stub] Result for "${query}"`,
                    link: "https://example.com",
                    snippet: `This is a placeholder result for the query "${query}". Set SERPAPI_KEY to enable live search.`,
                  },
                ],
              }, null, 2),
            }],
          };
        }

        const params = new URLSearchParams({
          q: query,
          api_key: serpApiKey,
          engine: "google",
          num: String(numResults),
        });

        const res = await fetch(`https://serpapi.com/search.json?${params}`);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`SerpAPI request failed (${res.status}): ${body}`);
        }

        const data = await res.json() as {
          organic_results?: Array<{ title: string; link: string; snippet: string }>;
        };
        const results = (data.organic_results || []).slice(0, numResults).map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        }));

        console.log(`[MCP] web_search: Found ${results.length} results`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ query, results }, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] web_search: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error performing web search: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const safeClientFields = {
  id: clientsTable.id,
  companyName: clientsTable.companyName,
  contactName: clientsTable.contactName,
  contactEmail: clientsTable.contactEmail,
  plan: clientsTable.plan,
  status: clientsTable.status,
  websiteUrl: clientsTable.websiteUrl,
  industry: clientsTable.industry,
  servicesList: clientsTable.servicesList,
  targetMarket: clientsTable.targetMarket,
  businessContext: clientsTable.businessContext,
  createdAt: clientsTable.createdAt,
};

export function registerClientTools(server: McpServer): void {
  server.tool(
    "list_clients",
    "List all GalaxyBots clients with company name, industry, services, and target market. Requires admin scope.",
    {},
    async () => {
      console.log("[MCP] list_clients: Fetching all clients");
      try {
        const clients = await db.select(safeClientFields).from(clientsTable);

        console.log(`[MCP] list_clients: Found ${clients.length} clients`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(clients, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] list_clients: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error listing clients: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_client",
    "Get a specific client's full business profile by ID. Returns company name, industry, services, target market, website, and business context. Omits sensitive fields.",
    {
      clientId: z.number().describe("The client ID to look up"),
    },
    async ({ clientId }) => {
      console.log(`[MCP] get_client: Looking up client ID: ${clientId}`);
      try {
        const [client] = await db.select(safeClientFields).from(clientsTable).where(eq(clientsTable.id, clientId));

        if (!client) {
          console.log(`[MCP] get_client: Client not found for ID: ${clientId}`);
          return {
            content: [{ type: "text" as const, text: `Client not found for ID: ${clientId}` }],
            isError: true,
          };
        }

        console.log(`[MCP] get_client: Found client: ${client.companyName} (ID: ${client.id})`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(client, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] get_client: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error getting client: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

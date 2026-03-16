import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost } from "../api-client.js";

export function registerMessagingTool(server: McpServer): void {
  server.tool(
    "send_message_to_bot",
    "Send a message to a GalaxyBots bot in a conversation and receive its AI response. If no conversationId is provided, a new conversation is created.",
    {
      botId: z.number().describe("The bot ID to send the message to"),
      message: z.string().describe("The message content to send to the bot"),
      conversationId: z.number().optional().describe("Optional existing conversation ID. If omitted, a new conversation is created."),
    },
    async ({ botId, message, conversationId }) => {
      console.log(`[MCP] send_message_to_bot: botId=${botId}, conversationId=${conversationId || "new"}`);
      try {
        let convId = conversationId;

        if (!convId) {
          const conv = await apiPost<{ id: number }>("/conversations", {
            botId,
            title: "MCP Conversation",
          });
          convId = conv.id;
          console.log(`[MCP] send_message_to_bot: Created new conversation ${convId}`);
        }

        const result = await apiPost<{
          userMessage: { id: number; content: string };
          botResponse: { id: number; content: string; senderName: string };
        }>(`/conversations/${convId}/messages`, {
          content: message,
          senderName: "MCP Client",
        });

        console.log(`[MCP] send_message_to_bot: Bot responded successfully in conversation ${convId}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              conversationId: convId,
              botName: result.botResponse.senderName,
              response: result.botResponse.content,
            }, null, 2),
          }],
        };
      } catch (error) {
        console.error("[MCP] send_message_to_bot: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error sending message: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

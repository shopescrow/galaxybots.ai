import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost, apiPostStream } from "../api-client.js";

export function registerMessagingTool(server: McpServer): void {
  server.tool(
    "send_message_to_bot",
    "Send a message to a GalaxyBots bot in a conversation and receive its AI response. If no conversationId is provided, a new conversation is created. When progressToken is provided, streams token-by-token progress notifications as the bot responds.",
    {
      botId: z.number().describe("The bot ID to send the message to"),
      message: z.string().describe("The message content to send to the bot"),
      conversationId: z.number().optional().describe("Optional existing conversation ID. If omitted, a new conversation is created."),
      progressToken: z.union([z.string(), z.number()]).optional().describe("Optional MCP progress token for streaming token-by-token updates"),
    },
    async ({ botId, message, conversationId, progressToken }, extra) => {
      console.log(`[MCP] send_message_to_bot: botId=${botId}, conversationId=${conversationId || "new"}`);

      const token = progressToken ?? extra._meta?.progressToken;

      const sendProgress = async (msg: string, progress: number, total: number) => {
        if (token !== undefined && extra.sendNotification) {
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken: token, progress, total, message: msg },
            });
          } catch { }
        }
      };

      try {
        let convId = conversationId;

        if (!convId) {
          await sendProgress("Creating conversation", 0, 100);
          const conv = await apiPost<{ id: number }>("/conversations", {
            botId,
            title: "MCP Conversation",
          });
          convId = conv.id;
          console.log(`[MCP] send_message_to_bot: Created new conversation ${convId}`);
        }

        if (token !== undefined) {
          let chunkIndex = 0;
          let accumulatedText = "";

          const finalContent = await apiPostStream(
            `/conversations/${convId}/messages/stream`,
            { content: message, senderName: "MCP Client" },
            async (event) => {
              if (event.type === "token" || event.type === "chunk") {
                const chunk = typeof event.content === "string" ? event.content : "";
                if (chunk) {
                  accumulatedText += chunk;
                  chunkIndex++;
                  await sendProgress(chunk, chunkIndex, 100);
                }
              } else if (event.type === "tool_call") {
                await sendProgress(`Using tool: ${String(event.toolName ?? "tool")}`, chunkIndex, 100);
              } else if (event.type === "done") {
                await sendProgress("Response complete", 100, 100);
              }
            }
          );

          const responseText = finalContent || accumulatedText;
          console.log(`[MCP] send_message_to_bot: Streamed response (${chunkIndex} chunks) in conversation ${convId}`);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                conversationId: convId,
                botId,
                response: responseText,
              }, null, 2),
            }],
          };
        }

        await sendProgress("Sending message", 10, 100);

        const result = await apiPost<{
          userMessage: { id: number; content: string };
          botResponse: { id: number; content: string; senderName: string };
        }>(`/conversations/${convId}/messages`, {
          content: message,
          senderName: "MCP Client",
        });

        await sendProgress("Complete", 100, 100);

        console.log(`[MCP] send_message_to_bot: Bot responded in conversation ${convId}`);
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

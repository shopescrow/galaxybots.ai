import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { resolveSlackChannel } from "./_shared";

registerTool({
  name: "post_slack_message",
  description: "Post a message to a Slack channel using the platform-level Slack Bot Token. Use this to send notifications or updates to team channels.",
  inputSchema: z.object({
    channel: z.string().describe("Slack channel name (without #) or channel ID"),
    text: z.string().describe("Message text to post"),
  }),
  execute: async (input, _context: ToolContext) => {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return { success: false, error: "Slack Bot Token not configured. Set SLACK_BOT_TOKEN environment variable." };
    }
    try {
      const channelId = await resolveSlackChannel(token, input.channel);
      if (!channelId) {
        return { success: false, error: `Could not find Slack channel: ${input.channel}` };
      }
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: channelId, text: input.text }),
      });
      const data = await response.json() as { ok: boolean; error?: string; ts?: string };
      if (!data.ok) {
        return { success: false, error: `Slack API error: ${data.error}` };
      }
      return { success: true, message: `Message posted to #${input.channel}`, timestamp: data.ts };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to post Slack message" };
    }
  },
});

registerTool({
  name: "read_slack_channel",
  description: "Read recent messages from a Slack channel using the platform-level Slack Bot Token.",
  inputSchema: z.object({
    channel: z.string().describe("Slack channel name (without #) or channel ID"),
    count: z.number().optional().describe("Number of recent messages to retrieve (default 10, max 50)"),
  }),
  execute: async (input, _context: ToolContext) => {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return { success: false, messages: [], error: "Slack Bot Token not configured." };
    }
    const limit = Math.min(input.count ?? 10, 50);
    try {
      const channelId = await resolveSlackChannel(token, input.channel);
      if (!channelId) {
        return { success: false, messages: [], error: `Could not find Slack channel: ${input.channel}` };
      }
      const response = await fetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { ok: boolean; error?: string; messages?: Array<{ text: string; user?: string; ts?: string }> };
      if (!data.ok) {
        return { success: false, messages: [], error: `Slack API error: ${data.error}` };
      }
      return {
        success: true,
        messages: (data.messages ?? []).map((m) => ({
          text: m.text,
          user: m.user ?? "unknown",
          timestamp: m.ts,
        })),
      };
    } catch (err) {
      return { success: false, messages: [], error: err instanceof Error ? err.message : "Failed to read Slack channel" };
    }
  },
});

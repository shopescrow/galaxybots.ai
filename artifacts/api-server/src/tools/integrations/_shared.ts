import { db, clientIntegrationsTable, toolActivityLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptCredential } from "../../utils/credential-encryption";
import { createNotification } from "../../services/admin/notifications";
import type { ToolContext } from "../registry";

export async function getClientCredential(clientId: number | undefined, service: string): Promise<string | null> {
  if (!clientId) return null;
  const [row] = await db
    .select()
    .from(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.clientId, clientId),
      eq(clientIntegrationsTable.service, service),
      eq(clientIntegrationsTable.status, "connected")
    ));
  if (!row) return null;
  return decryptCredential(row.credential);
}

export async function resolveSlackChannel(token: string, channelNameOrId: string): Promise<string | null> {
  if (channelNameOrId.startsWith("C") && /^C[A-Z0-9]+$/.test(channelNameOrId)) {
    return channelNameOrId;
  }
  const cleanName = channelNameOrId.replace(/^#/, "");
  try {
    let cursor: string | undefined;
    do {
      const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as {
        ok: boolean;
        channels?: Array<{ id: string; name: string }>;
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) return null;
      const match = data.channels?.find((c) => c.name === cleanName);
      if (match) return match.id;
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    return null;
  }
  return null;
}

export async function logToolActivity(toolName: string, context: ToolContext, extra?: { url?: string; metadata?: unknown }) {
  await db.insert(toolActivityLogTable).values({
    toolName,
    clientId: context.clientId ?? null,
    sessionId: context.sessionId ?? null,
    botName: context.botName ?? null,
    url: extra?.url ?? null,
    metadata: {
      ...(extra?.metadata as Record<string, unknown> ?? {}),
      conversationId: context.conversationId ?? null,
    },
  });
}

async function markNeedsReauth(clientId: number, service: string, errorDetail: string) {
  try {
    const [row] = await db
      .select()
      .from(clientIntegrationsTable)
      .where(and(
        eq(clientIntegrationsTable.clientId, clientId),
        eq(clientIntegrationsTable.service, service)
      ));

    if (!row) return;

    if (row.status === "needs_reauth") return;

    await db
      .update(clientIntegrationsTable)
      .set({ status: "needs_reauth" })
      .where(eq(clientIntegrationsTable.id, row.id));

    await createNotification({
      clientId,
      category: "system",
      severity: "warning",
      title: `${service} integration needs re-authorization`,
      body: `The ${service} integration returned an authentication error and has been marked for re-authorization. Please reconnect it in your Integrations settings. Detail: ${errorDetail}`,
      link: "/settings/integrations",
    });
  } catch (err) {
    console.error(`[withCredentialRetry] Failed to mark ${service} as needs_reauth:`, err);
  }
}

const AUTH_ERROR_PATTERN = /\b(401|403)\b|unauthorized|forbidden|invalid.?token|token.?expired|token.?revoked|access.?denied/i;

function isAuthError(error: string): boolean {
  return AUTH_ERROR_PATTERN.test(error);
}

export function withCredentialRetry<TInput, TOutput>(
  serviceName: string,
  fn: (input: TInput, context: ToolContext) => Promise<TOutput>
): (input: TInput, context: ToolContext) => Promise<TOutput> {
  return async (input: TInput, context: ToolContext): Promise<TOutput> => {
    let result: TOutput;
    try {
      result = await fn(input, context);
    } catch (thrown) {
      const errMsg = thrown instanceof Error ? thrown.message : String(thrown);
      if (isAuthError(errMsg)) {
        if (context.clientId) {
          await markNeedsReauth(context.clientId, serviceName, errMsg);
        }
        return { success: false, error: `${errMsg} — This integration's credentials have expired or been revoked. It has been marked for re-authorization. Please reconnect ${serviceName} in your Integrations settings.` } as TOutput;
      }
      throw thrown;
    }
    const resultObj = result as Record<string, unknown>;
    if (resultObj.success === false && typeof resultObj.error === "string") {
      const error = resultObj.error as string;
      if (isAuthError(error)) {
        if (context.clientId) {
          await markNeedsReauth(context.clientId, serviceName, error);
        }
        resultObj.error = `${error} — This integration's credentials have expired or been revoked. It has been marked for re-authorization. Please reconnect ${serviceName} in your Integrations settings.`;
      }
    }
    return result;
  };
}

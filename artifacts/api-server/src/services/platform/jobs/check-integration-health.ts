import { db } from "@workspace/db";
import { clientIntegrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "../../admin/notifications";

const INTEGRATION_HEALTH_ENDPOINTS: Record<string, { url: string; method?: string; authHeader: (token: string) => Record<string, string> }> = {
  slack: {
    url: "https://slack.com/api/auth.test",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  hubspot: {
    url: "https://api.hubapi.com/crm/v3/objects/contacts?limit=1",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  github: {
    url: "https://api.github.com/user",
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, "User-Agent": "GalaxyBots/1.0" }),
  },
  gmail: {
    url: "https://www.googleapis.com/gmail/v1/users/me/profile",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  google_calendar: {
    url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  google_sheets: {
    url: "https://www.googleapis.com/drive/v3/files?pageSize=1&q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  notion: {
    url: "https://api.notion.com/v1/users/me",
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, "Notion-Version": "2022-06-28" }),
  },
};

let lastIntegrationHealthCheck = 0;
const INTEGRATION_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function checkIntegrationHealth() {
  const now = Date.now();
  if (now - lastIntegrationHealthCheck < INTEGRATION_HEALTH_INTERVAL_MS) return;
  lastIntegrationHealthCheck = now;

  const { decryptCredential } = await import("../../../utils/credential-encryption");

  const integrations = await db
    .select()
    .from(clientIntegrationsTable)
    .where(eq(clientIntegrationsTable.status, "connected"));

  let checked = 0;
  let failed = 0;

  for (const integration of integrations) {
    const endpoint = INTEGRATION_HEALTH_ENDPOINTS[integration.service];
    if (!endpoint) continue;

    checked++;
    try {
      let token: string;
      try {
        token = decryptCredential(integration.credential);
      } catch {
        continue;
      }

      const resp = await fetch(endpoint.url, {
        method: endpoint.method ?? "GET",
        headers: endpoint.authHeader(token),
        signal: AbortSignal.timeout(10000),
      });

      let isAuthFailure = resp.status === 401 || resp.status === 403;

      if (!isAuthFailure && resp.ok && integration.service === "slack") {
        try {
          const body = await resp.json() as { ok?: boolean; error?: string };
          if (body.ok === false && /invalid_auth|token_revoked|token_expired|account_inactive|not_authed/i.test(body.error ?? "")) {
            isAuthFailure = true;
          }
        } catch {}
      }

      if (isAuthFailure) {
        failed++;
        await db
          .update(clientIntegrationsTable)
          .set({ status: "needs_reauth" })
          .where(eq(clientIntegrationsTable.id, integration.id));

        await createNotification({
          clientId: integration.clientId,
          category: "system",
          severity: "warning",
          title: `${integration.service} integration needs re-authorization`,
          body: `Health check detected that your ${integration.service} integration credentials have expired or been revoked. Please reconnect it in your Integrations settings.`,
          link: "/settings/integrations",
        });

        console.log(`[scheduler] Integration health check: ${integration.service} (client ${integration.clientId}) marked as needs_reauth`);
      }
    } catch (err) {
      console.error(`[scheduler] Integration health check error for ${integration.service} (client ${integration.clientId}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[scheduler] Integration health check complete: checked=${checked}, failed=${failed}`);
}

import { Router, type IRouter } from "express";
import { db, clientIntegrationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptCredential } from "../../utils/credential-encryption";
import { authenticate, requireRole } from "../../middleware/auth";
import crypto from "crypto";

const router: IRouter = Router();

const OAUTH_STATE_SECRET = process.env.JWT_SECRET;
if (!OAUTH_STATE_SECRET) {
  console.error("[oauth] FATAL: JWT_SECRET is not set. OAuth CSRF state signing is disabled.");
}
const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  tokenUrl: string;
  scope: string;
  authUrl: string;
}

const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  gmail: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  },
  google_calendar: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  },
  hubspot: {
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scope: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write",
    authUrl: "https://app.hubspot.com/oauth/authorize",
  },
  slack: {
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scope: "channels:read chat:write users:read",
    authUrl: "https://slack.com/oauth/v2/authorize",
  },
  notion: {
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scope: "",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
  },
};

function getAppBaseUrl(req: import("express").Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function signState(payload: object): string | null {
  if (!OAUTH_STATE_SECRET) return null;
  const data = JSON.stringify({ ...payload, iat: Date.now() });
  const buf = Buffer.from(data);
  const hmac = crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(buf).digest("hex");
  return `${buf.toString("base64url")}.${hmac}`;
}

function verifyState(state: string): Record<string, unknown> | null {
  if (!OAUTH_STATE_SECRET) return null;
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payloadB64 = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    if (!payloadB64 || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(Buffer.from(payloadB64, "base64url")).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.iat !== "number" || Date.now() - payload.iat > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

router.get("/oauth/initiate/:service", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { service } = req.params;
  const config = OAUTH_CONFIGS[service];

  if (!config) {
    res.status(400).json({ error: `Unknown OAuth service: ${service}` });
    return;
  }

  const oauthClientId = process.env[config.clientIdEnv];
  if (!oauthClientId) {
    res.status(503).json({
      error: `OAuth not configured for ${service}. Contact your administrator.`,
      configured: false,
    });
    return;
  }

  const userId = req.user!.userId;
  const clientDbId = req.user!.clientId;

  const state = signState({ service, userId, clientDbId });
  if (!state) {
    res.status(503).json({ error: "OAuth state signing is not available. JWT_SECRET is not configured." });
    return;
  }

  const redirectUri = `${getAppBaseUrl(req)}/api/oauth/callback/${service}`;

  const params = new URLSearchParams({
    client_id: oauthClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  if (config.scope) {
    params.set("scope", config.scope);
  }

  if (service === "notion") {
    params.set("owner", "user");
  }

  res.json({ authUrl: `${config.authUrl}?${params.toString()}` });
});

router.get("/oauth/callback/:service", async (req, res): Promise<void> => {
  const { service } = req.params;
  const { code, state, error } = req.query as Record<string, string>;

  const config = OAUTH_CONFIGS[service];

  if (!config) {
    res.status(400).send(`<script>window.opener?.postMessage({type:'oauth_error',service:'unknown',error:'Unknown service'},'*');window.close();</script>`);
    return;
  }

  if (error) {
    res.send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:${JSON.stringify(error)}},'*');window.close();</script>`);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:'Missing code or state'},'*');window.close();</script>`);
    return;
  }

  const stateData = verifyState(state);
  if (!stateData || typeof stateData.userId !== "number" || typeof stateData.clientDbId !== "number" || stateData.service !== service) {
    res.status(400).send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:'Invalid or expired state'},'*');window.close();</script>`);
    return;
  }

  const oauthClientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!oauthClientId || !clientSecret) {
    res.send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:'OAuth not configured'},'*');window.close();</script>`);
    return;
  }

  try {
    const redirectUri = `${getAppBaseUrl(req)}/api/oauth/callback/${service}`;

    let tokenResponse: Response;
    if (service === "notion") {
      const credentials = Buffer.from(`${oauthClientId}:${clientSecret}`).toString("base64");
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
    } else {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: oauthClientId,
        client_secret: clientSecret,
      });
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    }

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`[oauth] Token exchange failed for ${service}:`, errText);
      res.send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:'Token exchange failed'},'*');window.close();</script>`);
      return;
    }

    const tokenData = await tokenResponse.json() as Record<string, string>;

    let credential: string;
    if (service === "slack") {
      credential = JSON.stringify(tokenData);
    } else if (tokenData.access_token) {
      const credObj: Record<string, string> = { access_token: tokenData.access_token };
      if (tokenData.refresh_token) credObj.refresh_token = tokenData.refresh_token;
      credential = JSON.stringify(credObj);
    } else {
      credential = JSON.stringify(tokenData);
    }

    const encrypted = encryptCredential(credential);
    const clientDbId = stateData.clientDbId as number;

    const [existing] = await db
      .select()
      .from(clientIntegrationsTable)
      .where(and(
        eq(clientIntegrationsTable.clientId, clientDbId),
        eq(clientIntegrationsTable.service, service)
      ));

    if (existing) {
      await db
        .update(clientIntegrationsTable)
        .set({ credential: encrypted, status: "connected" })
        .where(eq(clientIntegrationsTable.id, existing.id));
    } else {
      await db
        .insert(clientIntegrationsTable)
        .values({
          clientId: clientDbId,
          service,
          credential: encrypted,
          status: "connected",
        });
    }

    const userId = stateData.userId as number;
    const [user] = await db
      .select({ onboarding: usersTable.onboarding })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (user && user.onboarding && !user.onboarding.integrations) {
      await db
        .update(usersTable)
        .set({ onboarding: { ...user.onboarding, integrations: true } })
        .where(eq(usersTable.id, userId));
    }

    res.send(`<script>window.opener?.postMessage({type:'oauth_success',service:${JSON.stringify(service)}},'*');window.close();</script>`);
  } catch (err) {
    console.error(`[oauth] Callback error for ${service}:`, err);
    res.send(`<script>window.opener?.postMessage({type:'oauth_error',service:${JSON.stringify(service)},error:'Internal error'},'*');window.close();</script>`);
  }
});

export default router;

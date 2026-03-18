import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  db,
  mcpOAuthClientsTable,
  mcpOAuthCodesTable,
  mcpOAuthTokensTable,
  developerApiKeysTable,
} from "@workspace/db";
import { eq, and, gt, isNull, sql } from "drizzle-orm";

const OAUTH_SCOPES = ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"];
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_DAYS = 30;

async function verifyDeveloperKey(keyValue: string): Promise<{ clientId: number; devKeyId: number; tier: string } | null> {
  try {
    const keyHash = crypto.createHash("sha256").update(keyValue).digest("hex");
    const [row] = await db
      .select({ clientId: developerApiKeysTable.clientId, devKeyId: developerApiKeysTable.id, tier: developerApiKeysTable.tier })
      .from(developerApiKeysTable)
      .where(
        and(
          eq(developerApiKeysTable.keyHash, keyHash),
          eq(developerApiKeysTable.status, "active"),
        )
      )
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for OAuth token issuance");
  return secret;
}

interface RsaKeyPair {
  privateKey: string;
  publicKeyPem: string;
  publicKeyJwk: Record<string, unknown>;
  kid: string;
}

let rsaKeyPair: RsaKeyPair | null = null;

function getRsaKeyPair(): RsaKeyPair {
  if (rsaKeyPair) return rsaKeyPair;

  const privateKeyPem = process.env.MCP_OAUTH_PRIVATE_KEY;
  const publicKeyPem = process.env.MCP_OAUTH_PUBLIC_KEY;

  if (privateKeyPem && publicKeyPem) {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const jwk = keyObj.export({ format: "jwk" }) as Record<string, unknown>;
    const kid = crypto.createHash("sha256").update(publicKeyPem).digest("hex").substring(0, 16);
    rsaKeyPair = { privateKey: privateKeyPem, publicKeyPem, publicKeyJwk: jwk, kid };
  } else {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const keyObj = crypto.createPublicKey(publicKey);
    const jwk = keyObj.export({ format: "jwk" }) as Record<string, unknown>;
    const kid = crypto.createHash("sha256").update(publicKey).digest("hex").substring(0, 16);
    rsaKeyPair = { privateKey, publicKeyPem: publicKey, publicKeyJwk: jwk, kid };
    if (process.env.NODE_ENV === "production") {
      console.error("[MCP] WARN: OAuth RSA keys are in-memory only. Set MCP_OAUTH_PRIVATE_KEY / MCP_OAUTH_PUBLIC_KEY for stable JWKS across restarts (required for production MCP clients).");
    } else {
      console.log("[MCP] OAuth RSA key pair generated in-memory (dev only). Set MCP_OAUTH_PRIVATE_KEY / MCP_OAUTH_PUBLIC_KEY env vars for persistence across restarts.");
    }
  }
  return rsaKeyPair;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

function verifyPkceChallenge(verifier: string, challenge: string, method: string): boolean {
  if (method === "S256") {
    const computed = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return computed === challenge;
  }
  if (method === "plain") {
    return verifier === challenge;
  }
  return false;
}

function issueAuthNonce(clientId: number, devKeyId: number, tier: string): string {
  const secret = getJwtSecret();
  return jwt.sign(
    { type: "mcp_auth_nonce", client_id: clientId, dev_key_id: devKeyId, tier },
    secret,
    { expiresIn: 300 }
  );
}

function verifyAuthNonce(nonce: string): { clientId: number; devKeyId: number; tier: string } | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(nonce, secret) as Record<string, unknown>;
    if (payload.type !== "mcp_auth_nonce") return null;
    return {
      clientId: payload.client_id as number,
      devKeyId: payload.dev_key_id as number,
      tier: payload.tier as string,
    };
  } catch {
    return null;
  }
}

export function buildOAuthRouter(basePath: string): express.Router {
  const router = express.Router();

  router.get("/oauth/authorize", async (req, res) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      auth_nonce,
    } = req.query as Record<string, string | undefined>;

    if (response_type !== "code") {
      res.status(400).send("unsupported_response_type");
      return;
    }
    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).send("missing_required_parameters");
      return;
    }

    const [client] = await db
      .select()
      .from(mcpOAuthClientsTable)
      .where(eq(mcpOAuthClientsTable.clientId, client_id))
      .limit(1);

    if (!client) {
      res.status(400).send("invalid_client");
      return;
    }

    if (!client.redirectUris.includes(redirect_uri)) {
      res.status(400).send("redirect_uri_mismatch");
      return;
    }

    const requestedScopes = scope ? scope.split(" ").filter(s => OAUTH_SCOPES.includes(s)) : ["bots:read"];
    const allowedScopes = requestedScopes.filter(s => client.allowedScopes.includes(s));
    const method = code_challenge_method ?? "S256";

    const oauthParams = new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: "code",
      scope: scope ?? "bots:read",
      state: state ?? "",
      code_challenge,
      code_challenge_method: method,
    });

    if (!auth_nonce) {
      const keyEntryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GalaxyBots — Sign In to Authorize</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e5e7eb; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #111118; border: 1px solid #2d2d3a; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; }
    .logo { font-size: 1.5rem; font-weight: 800; background: linear-gradient(to right, #818cf8, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    h1 { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
    .desc { color: #9ca3af; font-size: 0.85rem; margin-bottom: 20px; }
    label { display: block; font-size: 0.8rem; color: #9ca3af; margin-bottom: 6px; }
    input[type=password] { width: 100%; padding: 10px 12px; background: #1a1a28; border: 1px solid #2d2d3a; border-radius: 8px; color: #e5e7eb; font-size: 0.9rem; font-family: monospace; outline: none; }
    input[type=password]:focus { border-color: #818cf8; }
    .btn { width: 100%; margin-top: 14px; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; background: #818cf8; color: #fff; }
    .btn:hover { background: #6366f1; }
    .hint { margin-top: 12px; font-size: 0.78rem; color: #6b7280; text-align: center; }
    a { color: #818cf8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">GalaxyBots</div>
    <h1>Sign in to authorize <span style="color:#818cf8">${escapeHtml(client.clientName)}</span></h1>
    <p class="desc">Enter your GalaxyBots Developer API key to continue. You can find it in the <a href="/developers?tab=my-keys" target="_blank">Developer Portal → My Keys</a>.</p>
    <form method="POST" action="${basePath}/oauth/authorize/identify">
      ${Array.from(oauthParams.entries()).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`).join("\n      ")}
      <label for="developer_key">Developer API Key</label>
      <input type="password" id="developer_key" name="developer_key" placeholder="gb_dev_..." autocomplete="off" />
      <button type="submit" class="btn">Continue</button>
    </form>
    <p class="hint">Your key is used only to verify your identity. It is not stored.</p>
  </div>
</body>
</html>`;
      res.setHeader("Content-Type", "text/html");
      res.send(keyEntryHtml);
      return;
    }

    const nonceData = verifyAuthNonce(auth_nonce);
    if (!nonceData) {
      const retryUrl = `${basePath}/oauth/authorize?${oauthParams.toString()}`;
      res.status(401).setHeader("Content-Type", "text/html").send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Session Expired</title>
<style>body{font-family:system-ui;background:#0a0a0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#111118;border:1px solid #2d2d3a;border-radius:16px;padding:32px;max-width:420px;width:100%;}
a{color:#818cf8;}</style></head>
<body><div class="card"><p style="color:#f87171;font-weight:600">Authorization session expired or invalid. Please try again.</p>
<p style="margin-top:12px;font-size:0.85rem;color:#9ca3af"><a href="${escapeHtml(retryUrl)}">Start over</a></p></div></body></html>`);
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GalaxyBots — Authorize</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e5e7eb; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #111118; border: 1px solid #2d2d3a; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 4px; }
    .app-name { color: #818cf8; font-weight: 600; }
    .desc { color: #9ca3af; font-size: 0.85rem; margin-top: 8px; }
    .auth-badge { display: flex; align-items: center; gap: 6px; margin: 12px 0; padding: 8px 12px; background: #0f2e1a; border: 1px solid #166534; border-radius: 8px; font-size: 0.8rem; color: #86efac; }
    .scopes { margin: 20px 0; padding: 12px; background: #1a1a28; border-radius: 8px; border: 1px solid #2d2d3a; }
    .scopes h3 { font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .scope-item { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 4px 0; }
    .scope-dot { width: 6px; height: 6px; background: #818cf8; border-radius: 50%; flex-shrink: 0; }
    .actions { display: flex; gap: 10px; margin-top: 24px; }
    .btn { flex: 1; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; }
    .btn-deny { background: #1f2937; color: #9ca3af; border: 1px solid #374151; }
    .btn-approve { background: #818cf8; color: #fff; }
    .btn-deny:hover { background: #374151; }
    .btn-approve:hover { background: #6366f1; }
    .logo { font-size: 1.5rem; font-weight: 800; background: linear-gradient(to right, #818cf8, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">GalaxyBots</div>
    <h1><span class="app-name">${escapeHtml(client.clientName)}</span> wants access</h1>
    <div class="auth-badge">✓ Authenticated as client #${nonceData.clientId}</div>
    <p class="desc">This application is requesting permission to access your GalaxyBots account.</p>
    <div class="scopes">
      <h3>Requested permissions</h3>
      ${allowedScopes.map(s => `<div class="scope-item"><span class="scope-dot"></span><span>${escapeHtml(s)}</span></div>`).join("")}
    </div>
    <form method="POST" action="${basePath}/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}" />
      <input type="hidden" name="scope" value="${escapeHtml(allowedScopes.join(" "))}" />
      <input type="hidden" name="state" value="${escapeHtml(state ?? "")}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(method)}" />
      <input type="hidden" name="auth_nonce" value="${escapeHtml(auth_nonce)}" />
      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn btn-approve">Approve</button>
      </div>
    </form>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  router.post("/oauth/authorize/identify", express.urlencoded({ extended: false }), async (req, res) => {
    const {
      developer_key,
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = req.body as Record<string, string | undefined>;

    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).send("missing_required_parameters");
      return;
    }

    const oauthParams = new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: response_type ?? "code",
      scope: scope ?? "bots:read",
      state: state ?? "",
      code_challenge,
      code_challenge_method: code_challenge_method ?? "S256",
    });

    if (!developer_key) {
      res.redirect(`${basePath}/oauth/authorize?${oauthParams.toString()}`);
      return;
    }

    const devUser = await verifyDeveloperKey(developer_key);
    if (!devUser) {
      const method = code_challenge_method ?? "S256";
      res.status(401).setHeader("Content-Type", "text/html").send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invalid Key</title>
<style>body{font-family:system-ui;background:#0a0a0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#111118;border:1px solid #2d2d3a;border-radius:16px;padding:32px;max-width:420px;width:100%;}
a{color:#818cf8;}</style></head>
<body><div class="card"><p style="color:#f87171;font-weight:600;margin-bottom:12px">Invalid or inactive developer API key.</p>
<form method="POST" action="${basePath}/oauth/authorize/identify" style="margin-top:16px">
  ${Array.from(oauthParams.entries()).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`).join("\n  ")}
  <label style="display:block;font-size:0.8rem;color:#9ca3af;margin-bottom:6px">Try again with your Developer API Key</label>
  <input type="password" name="developer_key" placeholder="gb_dev_..." autocomplete="off" style="width:100%;padding:10px 12px;background:#1a1a28;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:0.9rem;font-family:monospace;outline:none" />
  <button type="submit" style="width:100%;margin-top:12px;padding:10px;border-radius:8px;border:none;cursor:pointer;font-size:0.9rem;font-weight:600;background:#818cf8;color:#fff">Continue</button>
</form>
</div></body></html>`);
      return;
    }

    const nonce = issueAuthNonce(devUser.clientId, devUser.devKeyId, devUser.tier);
    oauthParams.set("auth_nonce", nonce);
    res.redirect(`${basePath}/oauth/authorize?${oauthParams.toString()}`);
  });

  router.post("/oauth/authorize", express.urlencoded({ extended: false }), async (req, res) => {
    const {
      action,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      auth_nonce,
    } = req.body as Record<string, string | undefined>;

    if (!client_id || !redirect_uri) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const nonceData = auth_nonce ? verifyAuthNonce(auth_nonce) : null;
    if (!nonceData) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing or expired authorization session — please restart the authorization flow" });
      return;
    }

    const [client] = await db
      .select()
      .from(mcpOAuthClientsTable)
      .where(eq(mcpOAuthClientsTable.clientId, client_id))
      .limit(1);

    if (!client || !client.redirectUris.includes(redirect_uri)) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }

    if (client.clientIdOwner === null || client.clientIdOwner === undefined) {
      res.status(403).json({ error: "access_denied", error_description: "This OAuth client has no registered owner. Contact GalaxyBots support to assign an owner before authorization can proceed." });
      return;
    }

    if (client.clientIdOwner !== nonceData.clientId) {
      res.status(403).json({ error: "access_denied", error_description: "Authenticated developer is not the owner of this OAuth client" });
      return;
    }

    const redirectUrl = new URL(redirect_uri);

    if (action === "deny") {
      redirectUrl.searchParams.set("error", "access_denied");
      if (state) redirectUrl.searchParams.set("state", state);
      res.redirect(redirectUrl.toString());
      return;
    }

    if (action !== "approve") {
      res.status(400).json({ error: "invalid_action" });
      return;
    }

    const requestedScopes = scope ? scope.split(" ").filter(s => OAUTH_SCOPES.includes(s)) : ["bots:read"];
    const scopes = requestedScopes.filter(s => client.allowedScopes.includes(s));
    const code = generateSecureToken(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(mcpOAuthCodesTable).values({
      code,
      oauthClientId: client_id,
      codeChallenge: code_challenge ?? "",
      codeChallengeMethod: code_challenge_method ?? "S256",
      redirectUri: redirect_uri,
      scopes,
      expiresAt,
      authorizingClientId: nonceData.clientId,
      authorizingDevKeyId: nonceData.devKeyId,
    });

    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    res.redirect(redirectUrl.toString());
  });

  router.post("/oauth/token", express.json(), express.urlencoded({ extended: false }), async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const body = req.body as Record<string, string | undefined>;
    const { grant_type, code, redirect_uri, code_verifier, client_id, refresh_token } = body;

    if (grant_type === "authorization_code") {
      if (!code || !redirect_uri || !code_verifier || !client_id) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
        return;
      }

      const now = new Date();
      const [authCode] = await db
        .select()
        .from(mcpOAuthCodesTable)
        .where(
          and(
            eq(mcpOAuthCodesTable.code, code),
            eq(mcpOAuthCodesTable.oauthClientId, client_id),
            gt(mcpOAuthCodesTable.expiresAt, now),
            isNull(mcpOAuthCodesTable.usedAt),
          )
        )
        .limit(1);

      if (!authCode) {
        res.status(400).json({ error: "invalid_grant", error_description: "Authorization code is invalid, expired, or already used" });
        return;
      }

      if (authCode.redirectUri !== redirect_uri) {
        res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
        return;
      }

      if (!verifyPkceChallenge(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE code_verifier does not match code_challenge" });
        return;
      }

      await db
        .update(mcpOAuthCodesTable)
        .set({ usedAt: now })
        .where(eq(mcpOAuthCodesTable.id, authCode.id));

      const [client] = await db
        .select()
        .from(mcpOAuthClientsTable)
        .where(eq(mcpOAuthClientsTable.clientId, client_id))
        .limit(1);

      if (!client) {
        res.status(400).json({ error: "invalid_client" });
        return;
      }

      let rateLimitTier = "standard";
      if (authCode.authorizingDevKeyId) {
        const [devKey] = await db
          .select({ tier: developerApiKeysTable.tier })
          .from(developerApiKeysTable)
          .where(eq(developerApiKeysTable.id, authCode.authorizingDevKeyId))
          .limit(1);
        if (devKey?.tier) rateLimitTier = devKey.tier;
      } else if (authCode.authorizingClientId) {
        const [devKey] = await db
          .select({ tier: developerApiKeysTable.tier })
          .from(developerApiKeysTable)
          .where(
            and(
              eq(developerApiKeysTable.clientId, authCode.authorizingClientId),
              eq(developerApiKeysTable.status, "active"),
            )
          )
          .limit(1);
        if (devKey?.tier) rateLimitTier = devKey.tier;
      }

      const scopes = authCode.scopes;
      const rsaKeys = getRsaKeyPair();

      const accessToken = jwt.sign(
        {
          sub: client_id,
          client_name: client.clientName,
          scopes,
          platform_api_key_id: client.platformApiKeyId ?? null,
          rate_limit_tier: rateLimitTier,
          token_type: "mcp_oauth",
        },
        rsaKeys.privateKey,
        { algorithm: "RS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS, keyid: rsaKeys.kid }
      );

      const refreshToken = generateSecureToken(40);
      const accessTokenHash = hashToken(accessToken);
      const refreshTokenHash = hashToken(refreshToken);
      const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
      const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(mcpOAuthTokensTable).values({
        accessTokenHash,
        refreshTokenHash,
        oauthClientId: client_id,
        scopes,
        expiresAt: accessExpiresAt,
        refreshExpiresAt,
      });

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: refreshToken,
        scope: scopes.join(" "),
      });
      return;
    }

    if (grant_type === "refresh_token") {
      if (!refresh_token || !client_id) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }

      const refreshTokenHash = hashToken(refresh_token);
      const now = new Date();

      const [tokenRow] = await db
        .select()
        .from(mcpOAuthTokensTable)
        .where(
          and(
            eq(mcpOAuthTokensTable.refreshTokenHash, refreshTokenHash),
            eq(mcpOAuthTokensTable.oauthClientId, client_id),
            sql`${mcpOAuthTokensTable.refreshExpiresAt} > ${now}`,
            isNull(mcpOAuthTokensTable.revokedAt),
          )
        )
        .limit(1);

      if (!tokenRow) {
        res.status(400).json({ error: "invalid_grant", error_description: "Refresh token is invalid, expired, or revoked" });
        return;
      }

      const [client] = await db
        .select()
        .from(mcpOAuthClientsTable)
        .where(eq(mcpOAuthClientsTable.clientId, client_id))
        .limit(1);

      if (!client) {
        res.status(400).json({ error: "invalid_client" });
        return;
      }

      await db
        .update(mcpOAuthTokensTable)
        .set({ revokedAt: now })
        .where(eq(mcpOAuthTokensTable.id, tokenRow.id));

      let refreshRateLimitTier = "standard";
      if (client.clientIdOwner) {
        const [devKey] = await db
          .select({ tier: developerApiKeysTable.tier })
          .from(developerApiKeysTable)
          .where(
            and(
              eq(developerApiKeysTable.clientId, client.clientIdOwner),
              eq(developerApiKeysTable.status, "active"),
            )
          )
          .limit(1);
        if (devKey?.tier) refreshRateLimitTier = devKey.tier;
      }

      const scopes = tokenRow.scopes;
      const rsaKeys = getRsaKeyPair();

      const newAccessToken = jwt.sign(
        {
          sub: client_id,
          client_name: client.clientName,
          scopes,
          platform_api_key_id: client.platformApiKeyId ?? null,
          rate_limit_tier: refreshRateLimitTier,
          token_type: "mcp_oauth",
        },
        rsaKeys.privateKey,
        { algorithm: "RS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS, keyid: rsaKeys.kid }
      );

      const newRefreshToken = generateSecureToken(40);
      const newAccessTokenHash = hashToken(newAccessToken);
      const newRefreshTokenHash = hashToken(newRefreshToken);
      const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
      const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(mcpOAuthTokensTable).values({
        accessTokenHash: newAccessTokenHash,
        refreshTokenHash: newRefreshTokenHash,
        oauthClientId: client_id,
        scopes,
        expiresAt: accessExpiresAt,
        refreshExpiresAt,
      });

      res.json({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: newRefreshToken,
        scope: scopes.join(" "),
      });
      return;
    }

    res.status(400).json({ error: "unsupported_grant_type" });
  });

  router.post("/oauth/revoke", express.json(), express.urlencoded({ extended: false }), async (req, res) => {
    const body = req.body as Record<string, string | undefined>;
    const { token, token_type_hint } = body;

    if (!token) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    try {
      if (token_type_hint === "refresh_token") {
        await db
          .update(mcpOAuthTokensTable)
          .set({ revokedAt: now })
          .where(eq(mcpOAuthTokensTable.refreshTokenHash, tokenHash));
      } else {
        await db
          .update(mcpOAuthTokensTable)
          .set({ revokedAt: now })
          .where(eq(mcpOAuthTokensTable.accessTokenHash, tokenHash));
      }
    } catch {
    }

    res.json({ revoked: true });
  });

  router.get("/oauth/jwks", (_req, res) => {
    const rsaKeys = getRsaKeyPair();
    res.json({
      keys: [
        {
          ...rsaKeys.publicKeyJwk,
          kid: rsaKeys.kid,
          use: "sig",
          alg: "RS256",
        },
      ],
    });
  });

  return router;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function verifyOAuthToken(token: string): Promise<{
  oauthClientId: string;
  scopes: string[];
  platformApiKeyId: number | null;
  rateLimitTier: string;
} | null> {
  try {
    const rsaKeys = getRsaKeyPair();
    const payload = jwt.verify(token, rsaKeys.publicKeyPem, { algorithms: ["RS256"] }) as Record<string, unknown>;

    if (payload.token_type !== "mcp_oauth") return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const [tokenRow] = await db
      .select()
      .from(mcpOAuthTokensTable)
      .where(
        and(
          eq(mcpOAuthTokensTable.accessTokenHash, tokenHash),
          gt(mcpOAuthTokensTable.expiresAt, now),
          isNull(mcpOAuthTokensTable.revokedAt),
        )
      )
      .limit(1);

    if (!tokenRow) return null;

    return {
      oauthClientId: payload.sub as string,
      scopes: payload.scopes as string[],
      platformApiKeyId: payload.platform_api_key_id as number | null,
      rateLimitTier: (payload.rate_limit_tier as string) ?? "standard",
    };
  } catch {
    return null;
  }
}

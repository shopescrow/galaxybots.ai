import { Router, type IRouter } from "express";
import crypto from "crypto";
import { SAML } from "@node-saml/node-saml";
import {
  db,
  ssoConfigsTable,
  usersTable,
  clientsTable,
  platformAuditLogTable,
  permissionProfileTemplatesTable,
  botToolPermissionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { signToken, authenticate, setRevocationChecker } from "../middleware/auth";
import { encryptCredential, decryptCredential } from "../utils/credential-encryption";
import { validateExternalUrl } from "../utils/url-validation";

const router: IRouter = Router();

const ssoStateStore = new Map<string, { clientId: number; codeVerifier?: string; nonce?: string; createdAt: number }>();
const ssoCompletionCodes = new Map<string, { token: string; maxAge: number; createdAt: number }>();
const revokedSessions = new Map<string, number>();

setRevocationChecker((email: string, iat: number): boolean => {
  const revokedAt = revokedSessions.get(email.toLowerCase());
  if (revokedAt && iat <= revokedAt) return true;
  return false;
});

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ssoStateStore) {
    if (now - val.createdAt > 10 * 60 * 1000) ssoStateStore.delete(key);
  }
  for (const [key, val] of ssoCompletionCodes) {
    if (now - val.createdAt > 2 * 60 * 1000) ssoCompletionCodes.delete(key);
  }
  const cutoff = Math.floor(now / 1000) - 24 * 60 * 60;
  for (const [email, revokedAt] of revokedSessions) {
    if (revokedAt < cutoff) revokedSessions.delete(email);
  }
}, 60 * 1000);

function logSsoEvent(
  action: string,
  clientId: number | null,
  userId: number | null,
  metadata: Record<string, unknown>,
  ipAddress?: string,
) {
  return db.insert(platformAuditLogTable).values({
    clientId,
    userId,
    action,
    resource: "sso",
    metadata,
    ipAddress,
  });
}

interface JwkKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

async function fetchSamlMetadata(metadataUrl: string): Promise<{ ssoUrl: string; entityId: string; cert: string } | null> {
  if (!validateExternalUrl(metadataUrl)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(metadataUrl, { signal: controller.signal, redirect: "error" });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const xml = await res.text();

    const redirectMatch = xml.match(/SingleSignOnService[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"[^>]*Location="([^"]+)"/);
    const fallbackMatch = xml.match(/SingleSignOnService[^>]*Location="([^"]+)"/);
    const ssoUrl = redirectMatch?.[1] || fallbackMatch?.[1] || "";

    const entityIdMatch = xml.match(/entityID="([^"]+)"/);
    const entityId = entityIdMatch?.[1] || "";

    const certMatch = xml.match(/<(?:ds:)?X509Certificate>([^<]+)<\/(?:ds:)?X509Certificate>/);
    const cert = certMatch?.[1]?.replace(/\s/g, "") || "";

    if (!ssoUrl) return null;
    return { ssoUrl, entityId, cert };
  } catch {
    return null;
  }
}

async function fetchOidcJwks(issuerUrl: string): Promise<JwkKey[]> {
  if (!validateExternalUrl(issuerUrl)) return [];

  try {
    const discoveryUrl = issuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 10000);
    const discoveryRes = await fetch(discoveryUrl, { signal: controller1.signal, redirect: "error" });
    clearTimeout(t1);
    const discovery = (await discoveryRes.json()) as { jwks_uri?: string };
    if (!discovery.jwks_uri || !validateExternalUrl(discovery.jwks_uri)) return [];
    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), 10000);
    const jwksRes = await fetch(discovery.jwks_uri, { signal: controller2.signal, redirect: "error" });
    clearTimeout(t2);
    const jwks = (await jwksRes.json()) as { keys: JwkKey[] };
    return jwks.keys || [];
  } catch {
    return [];
  }
}

function verifyJwtSignatureWithJwks(idToken: string, keys: JwkKey[]): boolean {
  if (keys.length === 0) return false;

  try {
    const [headerB64] = idToken.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as { kid?: string; alg?: string };
    const kid = header.kid;
    const alg = header.alg;

    if (alg !== "RS256") return false;

    let key = keys.find((k) => k.kid === kid);
    if (!key) key = keys[0];

    if (!key.n || !key.e) return false;

    const pubKey = crypto.createPublicKey({
      key: {
        kty: key.kty || "RSA",
        n: key.n,
        e: key.e,
      },
      format: "jwk",
    });

    const [headerPart, payloadPart, signaturePart] = idToken.split(".");
    const data = `${headerPart}.${payloadPart}`;
    const signature = Buffer.from(signaturePart, "base64url");

    return crypto.createVerify("RSA-SHA256").update(data).verify(pubKey, signature);
  } catch {
    return false;
  }
}

export function revokeUserSessions(email: string): void {
  revokedSessions.set(email.toLowerCase(), Math.floor(Date.now() / 1000));
}

router.get(
  "/sso/check-domain",
  async (req, res): Promise<void> => {
    const { email } = req.query;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.json({ ssoEnabled: false });
      return;
    }

    const domain = email.split("@")[1].toLowerCase();
    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.domainHint, domain),
          eq(ssoConfigsTable.enabled, true),
        ),
      );

    if (!config) {
      res.json({ ssoEnabled: false });
      return;
    }

    res.json({
      ssoEnabled: true,
      providerType: config.providerType,
      forceSso: config.forceSso,
      clientId: config.clientId,
    });
  },
);

router.get(
  "/sso/saml/login/:clientId",
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }

    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.clientId, clientId),
          eq(ssoConfigsTable.providerType, "saml"),
          eq(ssoConfigsTable.enabled, true),
        ),
      );

    if (!config) {
      res.status(404).json({ error: "SAML SSO not configured for this organization" });
      return;
    }

    let idpSsoUrl = config.idpSsoUrl;
    let idpCert = config.idpCert ? decryptCredential(config.idpCert) : "";
    let idpEntityId = config.idpEntityId;

    if (config.idpMetadataUrl && !idpSsoUrl) {
      const metadata = await fetchSamlMetadata(config.idpMetadataUrl);
      if (!metadata) {
        res.status(502).json({ error: "Failed to fetch IdP metadata" });
        return;
      }
      idpSsoUrl = metadata.ssoUrl;
      idpCert = metadata.cert;
      idpEntityId = metadata.entityId;
    }

    if (!idpSsoUrl) {
      res.status(404).json({ error: "SAML SSO URL not configured. Provide an IdP SSO URL or metadata URL." });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const state = crypto.randomBytes(32).toString("hex");
    ssoStateStore.set(state, { clientId, createdAt: Date.now() });

    const saml = new SAML({
      callbackUrl: `${baseUrl}/api/sso/saml/acs`,
      entryPoint: idpSsoUrl,
      issuer: baseUrl,
      cert: idpCert,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      audience: baseUrl,
      ...(idpEntityId ? { idpIssuer: idpEntityId } : {}),
    });

    try {
      const loginUrl = await saml.getAuthorizeUrlAsync(state, req.get("host") || "", {});
      await logSsoEvent("sso_login_initiated", clientId, null, { provider: "saml" }, req.ip);
      res.json({ redirectUrl: loginUrl, state });
    } catch {
      res.status(500).json({ error: "Failed to generate SAML login URL" });
    }
  },
);

router.post(
  "/sso/saml/acs",
  async (req, res): Promise<void> => {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      res.status(400).json({ error: "Missing SAMLResponse" });
      return;
    }

    const stateEntry = RelayState ? ssoStateStore.get(RelayState) : null;
    if (!stateEntry) {
      res.status(400).json({ error: "Invalid or expired SSO state" });
      return;
    }
    ssoStateStore.delete(RelayState);

    const clientId = stateEntry.clientId;

    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.clientId, clientId),
          eq(ssoConfigsTable.providerType, "saml"),
          eq(ssoConfigsTable.enabled, true),
        ),
      );

    if (!config) {
      res.status(404).json({ error: "SAML SSO not configured" });
      return;
    }

    let idpSsoUrl = config.idpSsoUrl;
    let idpCert = config.idpCert ? decryptCredential(config.idpCert) : "";
    let idpEntityId = config.idpEntityId;

    if (config.idpMetadataUrl) {
      const metadata = await fetchSamlMetadata(config.idpMetadataUrl);
      if (metadata) {
        idpSsoUrl = idpSsoUrl || metadata.ssoUrl;
        idpCert = idpCert || metadata.cert;
        idpEntityId = idpEntityId || metadata.entityId;
      }
    }

    const baseUrl = `https://${req.get("host")}`;

    const saml = new SAML({
      callbackUrl: `${baseUrl}/api/sso/saml/acs`,
      entryPoint: idpSsoUrl || "",
      issuer: baseUrl,
      cert: idpCert,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      audience: baseUrl,
      ...(idpEntityId ? { idpIssuer: idpEntityId } : {}),
    });

    let profile: { nameID?: string; email?: string; displayName?: string; sessionNotOnOrAfter?: string; [key: string]: unknown } | null;
    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse });
      profile = result.profile;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      await logSsoEvent("sso_login_failed", clientId, null, { error: message, provider: "saml" }, req.ip);
      res.status(403).json({ error: "SAML assertion validation failed: " + message });
      return;
    }

    if (!profile) {
      res.status(403).json({ error: "No profile returned from SAML assertion" });
      return;
    }

    const email = (profile.email || profile.nameID || "").toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Could not extract valid email from SAML assertion" });
      return;
    }

    const domain = email.split("@")[1];
    if (domain !== config.domainHint) {
      res.status(403).json({ error: "Email domain does not match SSO configuration" });
      return;
    }

    const displayName = (profile.displayName as string) || email.split("@")[0];

    let user: Awaited<ReturnType<typeof jitProvision>>["user"];
    let isNewUser: boolean;
    try {
      const result = await jitProvision(email, displayName, clientId, config.jitDefaultRole, "saml", config.jitDefaultPermissionProfileId ?? undefined);
      user = result.user;
      isNewUser = result.isNewUser;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Provisioning failed";
      res.status(403).json({ error: message });
      return;
    }

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId));

    let sessionTtlMs: number;
    let jwtExpiry: string;

    if (profile.sessionNotOnOrAfter) {
      const sessionEnd = new Date(profile.sessionNotOnOrAfter as string).getTime();
      const remaining = sessionEnd - Date.now();
      if (remaining > 0) {
        sessionTtlMs = remaining;
        jwtExpiry = `${Math.ceil(remaining / 1000)}s`;
      } else {
        sessionTtlMs = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        jwtExpiry = config.forceSso ? "8h" : "7d";
      }
    } else {
      sessionTtlMs = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      jwtExpiry = config.forceSso ? "8h" : "7d";
    }

    const token = signToken({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      plan: client?.plan,
      bypassPayment: user.bypassPayment,
    }, jwtExpiry);

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "saml", email, isNewUser },
      req.ip,
    );

    const completionCode = crypto.randomBytes(32).toString("hex");
    ssoCompletionCodes.set(completionCode, { token, maxAge: sessionTtlMs, createdAt: Date.now() });

    const frontendBase = `https://${req.get("host")}`;
    const basePath = process.env.BASE_PATH || "/galaxybots";
    res.redirect(`${frontendBase}${basePath}/sso/callback?code=${completionCode}`);
  },
);

router.get(
  "/sso/saml/metadata",
  (req, res): void => {
    const baseUrl = `https://${req.get("host")}`;
    const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${baseUrl}"
  validUntil="${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${baseUrl}/api/sso/saml/acs" index="0" isDefault="true"/>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${baseUrl}/api/sso/saml/slo"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

    res.set("Content-Type", "application/xml");
    res.send(metadata);
  },
);

router.get(
  "/sso/oidc/login/:clientId",
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }

    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.clientId, clientId),
          eq(ssoConfigsTable.providerType, "oidc"),
          eq(ssoConfigsTable.enabled, true),
        ),
      );

    if (!config || !config.oidcIssuerUrl || !config.oidcClientId) {
      res.status(404).json({ error: "OIDC SSO not configured for this organization" });
      return;
    }

    const state = crypto.randomBytes(32).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    ssoStateStore.set(state, { clientId, codeVerifier, nonce, createdAt: Date.now() });

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    let authorizationEndpoint: string;
    try {
      const discoveryUrl = config.oidcIssuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
      const discoveryRes = await fetch(discoveryUrl);
      const discovery = (await discoveryRes.json()) as { authorization_endpoint: string };
      authorizationEndpoint = discovery.authorization_endpoint;
    } catch {
      authorizationEndpoint = `${config.oidcIssuerUrl}/authorize`;
    }

    const params = new URLSearchParams({
      client_id: config.oidcClientId,
      response_type: "code",
      scope: "openid email profile",
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const redirectUrl = `${authorizationEndpoint}?${params}`;

    await logSsoEvent("sso_login_initiated", clientId, null, { provider: "oidc" }, req.ip);

    res.json({ redirectUrl, state });
  },
);

router.get(
  "/sso/oidc/callback",
  async (req, res): Promise<void> => {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    const stateEntry = ssoStateStore.get(state);
    if (!stateEntry) {
      res.status(400).json({ error: "Invalid or expired SSO state. Please try again." });
      return;
    }
    ssoStateStore.delete(state);

    const clientId = stateEntry.clientId;
    const codeVerifier = stateEntry.codeVerifier;
    const expectedNonce = stateEntry.nonce;

    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.clientId, clientId),
          eq(ssoConfigsTable.providerType, "oidc"),
          eq(ssoConfigsTable.enabled, true),
        ),
      );

    if (!config || !config.oidcIssuerUrl || !config.oidcClientId) {
      res.status(404).json({ error: "OIDC configuration not found" });
      return;
    }

    if (!validateExternalUrl(config.oidcIssuerUrl)) {
      res.status(400).json({ error: "OIDC issuer URL is not a valid external HTTPS URL" });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    let tokenEndpoint: string;
    let userinfoEndpoint: string;
    try {
      const discoveryUrl = config.oidcIssuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const discoveryRes = await fetch(discoveryUrl, { signal: controller.signal, redirect: "error" });
      clearTimeout(timeout);
      const discovery = (await discoveryRes.json()) as {
        token_endpoint: string;
        userinfo_endpoint: string;
      };
      tokenEndpoint = discovery.token_endpoint;
      userinfoEndpoint = discovery.userinfo_endpoint;
      if (!validateExternalUrl(tokenEndpoint) || !validateExternalUrl(userinfoEndpoint)) {
        res.status(400).json({ error: "OIDC endpoints resolved to invalid URLs" });
        return;
      }
    } catch {
      tokenEndpoint = `${config.oidcIssuerUrl}/token`;
      userinfoEndpoint = `${config.oidcIssuerUrl}/userinfo`;
    }

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.oidcClientId,
    });
    if (codeVerifier) {
      tokenParams.set("code_verifier", codeVerifier);
    }
    if (config.oidcClientSecret) {
      tokenParams.set("client_secret", decryptCredential(config.oidcClientSecret));
    }

    let email: string;
    let displayName: string;
    let idpSessionExpiry: number | null = null;
    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        id_token?: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        await logSsoEvent("sso_login_failed", clientId, null, { error: "No access token", provider: "oidc" }, req.ip);
        res.status(400).json({ error: "Failed to obtain access token from identity provider" });
        return;
      }

      if (tokenData.id_token) {
        const jwksKeys = await fetchOidcJwks(config.oidcIssuerUrl!);
        if (!verifyJwtSignatureWithJwks(tokenData.id_token, jwksKeys)) {
          await logSsoEvent("sso_login_failed", clientId, null, { error: "id_token signature invalid or JWKS unavailable", provider: "oidc" }, req.ip);
          res.status(400).json({ error: "OIDC id_token signature verification failed" });
          return;
        }

        try {
          const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".")[1], "base64url").toString());
          if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
            res.status(400).json({ error: "OIDC nonce mismatch — possible replay attack" });
            return;
          }
          const expectedIssuer = config.oidcIssuerUrl!.replace(/\/$/, "");
          if (payload.iss && payload.iss.replace(/\/$/, "") !== expectedIssuer) {
            res.status(400).json({ error: "OIDC issuer mismatch" });
            return;
          }
          const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
          if (payload.aud && !aud.includes(config.oidcClientId)) {
            res.status(400).json({ error: "OIDC audience mismatch" });
            return;
          }
          if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            res.status(400).json({ error: "OIDC id_token expired" });
            return;
          }
          if (payload.exp) {
            idpSessionExpiry = payload.exp * 1000;
          }
        } catch {
          res.status(400).json({ error: "Failed to parse OIDC id_token" });
          return;
        }
      }

      if (tokenData.expires_in && !idpSessionExpiry) {
        idpSessionExpiry = Date.now() + tokenData.expires_in * 1000;
      }

      const userinfoRes = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userinfo = (await userinfoRes.json()) as {
        email: string;
        name?: string;
        preferred_username?: string;
      };

      email = userinfo.email?.toLowerCase();
      displayName = userinfo.name || userinfo.preferred_username || email.split("@")[0];
    } catch {
      await logSsoEvent("sso_login_failed", clientId, null, { error: "Token exchange failed", provider: "oidc" }, req.ip);
      res.status(500).json({ error: "Failed to exchange OIDC authorization code" });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "Email not provided by OIDC provider" });
      return;
    }

    const domain = email.split("@")[1];
    if (domain !== config.domainHint) {
      res.status(403).json({ error: "Email domain does not match SSO configuration" });
      return;
    }

    let user: Awaited<ReturnType<typeof jitProvision>>["user"];
    let isNewUser: boolean;
    try {
      const result = await jitProvision(email, displayName, clientId, config.jitDefaultRole, "oidc", config.jitDefaultPermissionProfileId ?? undefined);
      user = result.user;
      isNewUser = result.isNewUser;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Provisioning failed";
      res.status(403).json({ error: message });
      return;
    }

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId));

    let sessionTtlMs: number;
    let jwtExpiry: string;

    if (idpSessionExpiry) {
      const remaining = idpSessionExpiry - Date.now();
      if (remaining > 0) {
        sessionTtlMs = remaining;
        jwtExpiry = `${Math.ceil(remaining / 1000)}s`;
      } else {
        sessionTtlMs = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        jwtExpiry = config.forceSso ? "8h" : "7d";
      }
    } else {
      sessionTtlMs = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      jwtExpiry = config.forceSso ? "8h" : "7d";
    }

    const token = signToken({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      plan: client?.plan,
      bypassPayment: user.bypassPayment,
    }, jwtExpiry);

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "oidc", email, isNewUser },
      req.ip,
    );

    const completionCode = crypto.randomBytes(32).toString("hex");
    ssoCompletionCodes.set(completionCode, { token, maxAge: sessionTtlMs, createdAt: Date.now() });

    const frontendBase = `https://${req.get("host")}`;
    const basePath = process.env.BASE_PATH || "/galaxybots";
    res.redirect(`${frontendBase}${basePath}/sso/callback?code=${completionCode}`);
  },
);

router.post(
  "/sso/exchange",
  async (req, res): Promise<void> => {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Missing completion code" });
      return;
    }

    const entry = ssoCompletionCodes.get(code);
    if (!entry) {
      res.status(400).json({ error: "Invalid or expired completion code" });
      return;
    }
    ssoCompletionCodes.delete(code);

    res.cookie("token", entry.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: entry.maxAge,
    });

    res.json({ token: entry.token });
  },
);

router.post(
  "/sso/logout",
  authenticate,
  async (req, res): Promise<void> => {
    await logSsoEvent("sso_logout", req.user!.clientId, req.user!.userId, {}, req.ip);
    revokeUserSessions(req.user!.email);
    res.clearCookie("token", { path: "/" });
    res.json({ success: true });
  },
);

router.post(
  "/sso/saml/slo",
  async (req, res): Promise<void> => {
    const { SAMLRequest, SAMLResponse } = req.body;

    if (!SAMLRequest && !SAMLResponse) {
      res.status(400).json({ error: "Missing SAML SLO request or response" });
      return;
    }

    const payload = SAMLRequest || SAMLResponse;
    let decoded: string;
    try {
      decoded = Buffer.from(payload, "base64").toString("utf-8");
    } catch {
      res.status(400).json({ error: "Invalid SLO payload encoding" });
      return;
    }

    const issuerMatch = decoded.match(/<(?:saml:)?Issuer[^>]*>([^<]+)<\/(?:saml:)?Issuer>/);
    if (!issuerMatch || !issuerMatch[1]) {
      res.status(400).json({ error: "No Issuer found in SLO request" });
      return;
    }

    const issuerEntityId = issuerMatch[1].trim();

    const configs = await db.select().from(ssoConfigsTable).where(eq(ssoConfigsTable.enabled, true));
    const config = configs.find((c) => c.idpEntityId === issuerEntityId);

    if (!config) {
      res.status(400).json({ error: "Unknown IdP issuer — SLO rejected" });
      return;
    }

    let idpCert = config.idpCert ? decryptCredential(config.idpCert) : "";
    if (config.idpMetadataUrl && !idpCert) {
      const metadata = await fetchSamlMetadata(config.idpMetadataUrl);
      if (metadata) idpCert = metadata.cert;
    }

    if (!idpCert) {
      res.status(400).json({ error: "No IdP certificate available — cannot verify SLO signature" });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const saml = new SAML({
      callbackUrl: `${baseUrl}/api/sso/saml/acs`,
      entryPoint: config.idpSsoUrl || "",
      issuer: baseUrl,
      cert: idpCert,
      wantLogoutResponseSigned: true,
    });

    let logoutProfile: { profile: { nameID?: string } | null; loggedOut: boolean };
    try {
      const sloBody: Record<string, string> = {};
      if (SAMLRequest) sloBody.SAMLRequest = SAMLRequest;
      if (SAMLResponse) sloBody.SAMLResponse = SAMLResponse;
      logoutProfile = await saml.validatePostResponseAsync(sloBody);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      await logSsoEvent("sso_slo_signature_invalid", config.clientId, null, { error: message, issuer: issuerEntityId }, req.ip);
      res.status(400).json({ error: "SLO signature validation failed" });
      return;
    }

    if (!logoutProfile.loggedOut) {
      res.status(400).json({ error: "SLO payload did not indicate logout" });
      return;
    }

    const email = (logoutProfile.profile?.nameID || "").toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "No valid NameID in verified SLO payload" });
      return;
    }

    revokeUserSessions(email);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (user) {
      await logSsoEvent("sso_backchannel_logout", user.clientId, user.id, { email, sessionRevoked: true }, req.ip);
    }

    res.status(200).send();
  },
);

async function jitProvision(
  email: string,
  displayName: string,
  clientId: number,
  defaultRole: string,
  provider: string,
  permissionProfileId?: number,
): Promise<{ user: { id: number; email: string; clientId: number; role: string; bypassPayment: boolean }; isNewUser: boolean }> {
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existingUser) {
    if (!existingUser.isActive) {
      throw new Error("User account is deactivated");
    }
    if (existingUser.clientId !== clientId) {
      throw new Error("Email is associated with a different organization");
    }
    return {
      user: {
        id: existingUser.id,
        email: existingUser.email,
        clientId: existingUser.clientId,
        role: existingUser.role,
        bypassPayment: existingUser.bypassPayment,
      },
      isNewUser: false,
    };
  }

  const placeholderHash = "$2a$12$SSO_PLACEHOLDER_HASH_DO_NOT_USE_FOR_PASSWORD_LOGIN";

  const [newUser] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: placeholderHash,
      clientId,
      role: defaultRole,
      displayName,
      ssoProvider: provider,
    })
    .returning();

  if (permissionProfileId) {
    const [profile] = await db
      .select()
      .from(permissionProfileTemplatesTable)
      .where(
        and(
          eq(permissionProfileTemplatesTable.id, permissionProfileId),
          eq(permissionProfileTemplatesTable.clientId, clientId),
        ),
      );

    if (profile && Array.isArray(profile.permissions)) {
      const existingPerms = await db
        .select()
        .from(botToolPermissionsTable)
        .where(eq(botToolPermissionsTable.clientId, clientId));

      const existingBotIds = [...new Set(existingPerms.map((p) => p.botId))];

      for (const botId of existingBotIds) {
        for (const perm of profile.permissions as Array<{ toolName: string; allowed: boolean; requiresApproval?: boolean }>) {
          await db
            .insert(botToolPermissionsTable)
            .values({
              clientId,
              botId,
              toolName: perm.toolName,
              allowed: perm.allowed,
              requiresApproval: perm.requiresApproval ?? false,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      clientId: newUser.clientId,
      role: newUser.role,
      bypassPayment: newUser.bypassPayment,
    },
    isNewUser: true,
  };
}

export default router;

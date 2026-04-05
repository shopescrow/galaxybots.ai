import { Router, type IRouter } from "express";
import crypto from "crypto";
import { SAML } from "@node-saml/node-saml";
import { db, ssoConfigsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, setRevocationChecker } from "../../middleware/auth";
import { decryptCredential } from "../../utils/credential-encryption";
import { validateExternalUrl } from "../../utils/url-validation";
import {
  setSsoState,
  consumeSsoState,
  setSsoCompletionCode,
  consumeSsoCompletionCode,
} from "../../services/auth/sso-state-store";
import {
  fetchSamlMetadata,
  buildSamlInstance,
  resolveSamlConfig,
  generateSamlMetadataXml,
  jitProvision,
  logSsoEvent,
  issueToken,
  computeSessionExpiry,
} from "../../services/auth/saml";
import {
  fetchOidcJwks,
  verifyJwtSignatureWithJwks,
  generatePkceChallenge,
  discoverOidcEndpoints,
} from "../../services/auth/oidc";

const router: IRouter = Router();

const revokedSessions = new Map<string, number>();

setRevocationChecker((email: string, iat: number): boolean => {
  const revokedAt = revokedSessions.get(email.toLowerCase());
  if (revokedAt && iat <= revokedAt) return true;
  return false;
});

setInterval(() => {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  for (const [email, revokedAt] of revokedSessions) {
    if (revokedAt < cutoff) revokedSessions.delete(email);
  }
}, 60 * 1000);

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
    await setSsoState(state, { clientId, createdAt: Date.now() });

    const saml = buildSamlInstance(baseUrl, idpSsoUrl, idpCert, idpEntityId || undefined);

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

    const stateEntry = RelayState ? await consumeSsoState(RelayState) : null;
    if (!stateEntry) {
      res.status(400).json({ error: "Invalid or expired SSO state" });
      return;
    }

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

    const { idpSsoUrl, idpCert, idpEntityId } = await resolveSamlConfig(config);
    const baseUrl = `https://${req.get("host")}`;
    const saml = buildSamlInstance(baseUrl, idpSsoUrl || "", idpCert, idpEntityId || undefined);

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

    let idpSessionExpiry: number | null = null;
    if (profile.sessionNotOnOrAfter) {
      const sessionEnd = new Date(profile.sessionNotOnOrAfter as string).getTime();
      if (sessionEnd > Date.now()) {
        idpSessionExpiry = sessionEnd;
      }
    }

    const { token, sessionTtlMs } = await issueToken(user, config, idpSessionExpiry);

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "saml", email, isNewUser },
      req.ip,
    );

    const completionCode = crypto.randomBytes(32).toString("hex");
    await setSsoCompletionCode(completionCode, { token, maxAge: sessionTtlMs, createdAt: Date.now() });

    const frontendBase = `https://${req.get("host")}`;
    const basePath = process.env.BASE_PATH || "/galaxybots";
    res.redirect(`${frontendBase}${basePath}/sso/callback?code=${completionCode}`);
  },
);

router.get(
  "/sso/saml/metadata",
  (req, res): void => {
    const baseUrl = `https://${req.get("host")}`;
    res.set("Content-Type", "application/xml");
    res.send(generateSamlMetadataXml(baseUrl));
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

    const { state, nonce, codeVerifier, codeChallenge } = generatePkceChallenge();
    await setSsoState(state, { clientId, codeVerifier, nonce, createdAt: Date.now() });

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    const { authorizationEndpoint } = await discoverOidcEndpoints(config.oidcIssuerUrl);

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

    const stateEntry = await consumeSsoState(state);
    if (!stateEntry) {
      res.status(400).json({ error: "Invalid or expired SSO state. Please try again." });
      return;
    }

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

    const { tokenEndpoint, userinfoEndpoint } = await discoverOidcEndpoints(config.oidcIssuerUrl);

    if (!validateExternalUrl(tokenEndpoint) || !validateExternalUrl(userinfoEndpoint)) {
      if (tokenEndpoint.startsWith(config.oidcIssuerUrl) || userinfoEndpoint.startsWith(config.oidcIssuerUrl)) {
        // fallback endpoints are fine
      } else {
        res.status(400).json({ error: "OIDC endpoints resolved to invalid URLs" });
        return;
      }
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

    const { token, sessionTtlMs } = await issueToken(user, config, idpSessionExpiry);

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "oidc", email, isNewUser },
      req.ip,
    );

    const completionCode = crypto.randomBytes(32).toString("hex");
    await setSsoCompletionCode(completionCode, { token, maxAge: sessionTtlMs, createdAt: Date.now() });

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

    const entry = await consumeSsoCompletionCode(code);
    if (!entry) {
      res.status(400).json({ error: "Invalid or expired completion code" });
      return;
    }

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
      idpCert,
      wantAuthnResponseSigned: true,
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

export default router;

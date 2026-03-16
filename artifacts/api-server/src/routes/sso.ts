import { Router, type IRouter } from "express";
import crypto from "crypto";
import { SAML } from "@node-saml/node-saml";
import {
  db,
  ssoConfigsTable,
  usersTable,
  clientsTable,
  platformAuditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { signToken, authenticate } from "../middleware/auth";
import { encryptCredential, decryptCredential } from "../utils/credential-encryption";

const router: IRouter = Router();

const ssoStateStore = new Map<string, { clientId: number; codeVerifier?: string; nonce?: string; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ssoStateStore) {
    if (now - val.createdAt > 10 * 60 * 1000) ssoStateStore.delete(key);
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

    if (!config || !config.idpSsoUrl) {
      res.status(404).json({ error: "SAML SSO not configured for this organization" });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const state = crypto.randomBytes(32).toString("hex");
    ssoStateStore.set(state, { clientId, createdAt: Date.now() });

    const idpCert = config.idpCert ? decryptCredential(config.idpCert) : "";

    const saml = new SAML({
      callbackUrl: `${baseUrl}/api/sso/saml/acs`,
      entryPoint: config.idpSsoUrl,
      issuer: baseUrl,
      cert: idpCert,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      audience: baseUrl,
    });

    try {
      const loginUrl = await saml.getAuthorizeUrlAsync(state, req.get("host") || "", {});
      await logSsoEvent("sso_login_initiated", clientId, null, { provider: "saml" }, req.ip);
      res.json({ redirectUrl: loginUrl, state });
    } catch (err: any) {
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

    if (!config || !config.idpSsoUrl) {
      res.status(404).json({ error: "SAML SSO not configured" });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const idpCert = config.idpCert ? decryptCredential(config.idpCert) : "";

    const saml = new SAML({
      callbackUrl: `${baseUrl}/api/sso/saml/acs`,
      entryPoint: config.idpSsoUrl,
      issuer: baseUrl,
      cert: idpCert,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      audience: baseUrl,
      ...(config.idpEntityId ? { idpIssuer: config.idpEntityId } : {}),
    });

    let profile: { nameID?: string; email?: string; displayName?: string; [key: string]: unknown } | null;
    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse });
      profile = result.profile;
    } catch (err: any) {
      await logSsoEvent("sso_login_failed", clientId, null, { error: err.message, provider: "saml" }, req.ip);
      res.status(403).json({ error: "SAML assertion validation failed: " + (err.message || "unknown error") });
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
      const result = await jitProvision(email, displayName, clientId, config.jitDefaultRole, "saml");
      user = result.user;
      isNewUser = result.isNewUser;
    } catch (err: any) {
      res.status(403).json({ error: err.message });
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

    const sessionMaxAge = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

    const token = signToken({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      plan: client?.plan,
      bypassPayment: user.bypassPayment,
    });

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "saml", email, isNewUser },
      req.ip,
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionMaxAge,
    });

    const frontendBase = `https://${req.get("host")}`;
    res.redirect(`${frontendBase}/galaxybots/sso/callback?success=true&token=${encodeURIComponent(token)}`);
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

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    let tokenEndpoint: string;
    let userinfoEndpoint: string;
    try {
      const discoveryUrl = config.oidcIssuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
      const discoveryRes = await fetch(discoveryUrl);
      const discovery = (await discoveryRes.json()) as {
        token_endpoint: string;
        userinfo_endpoint: string;
      };
      tokenEndpoint = discovery.token_endpoint;
      userinfoEndpoint = discovery.userinfo_endpoint;
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
    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        id_token?: string;
      };

      if (!tokenData.access_token) {
        await logSsoEvent("sso_login_failed", clientId, null, { error: "No access token", provider: "oidc" }, req.ip);
        res.status(400).json({ error: "Failed to obtain access token from identity provider" });
        return;
      }

      if (tokenData.id_token && expectedNonce) {
        try {
          const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".")[1], "base64url").toString());
          if (payload.nonce && payload.nonce !== expectedNonce) {
            res.status(400).json({ error: "OIDC nonce mismatch — possible replay attack" });
            return;
          }
        } catch {
          // nonce check best-effort if id_token parsing fails
        }
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
      const result = await jitProvision(email, displayName, clientId, config.jitDefaultRole, "oidc");
      user = result.user;
      isNewUser = result.isNewUser;
    } catch (err: any) {
      res.status(403).json({ error: err.message });
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

    const sessionMaxAge = config.forceSso ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

    const token = signToken({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      plan: client?.plan,
      bypassPayment: user.bypassPayment,
    });

    await logSsoEvent(
      isNewUser ? "sso_jit_provision" : "sso_login",
      clientId,
      user.id,
      { provider: "oidc", email, isNewUser },
      req.ip,
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionMaxAge,
    });

    const frontendBase = `https://${req.get("host")}`;
    res.redirect(`${frontendBase}/galaxybots/sso/callback?success=true&token=${encodeURIComponent(token)}`);
  },
);

router.post(
  "/sso/logout",
  authenticate,
  async (req, res): Promise<void> => {
    await logSsoEvent("sso_logout", req.user!.clientId, req.user!.userId, {}, req.ip);
    res.clearCookie("token");
    res.json({ success: true });
  },
);

async function jitProvision(
  email: string,
  displayName: string,
  clientId: number,
  defaultRole: string,
  provider: string,
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

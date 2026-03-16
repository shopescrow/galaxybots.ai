import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  ssoConfigsTable,
  usersTable,
  clientsTable,
  platformAuditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { signToken, authenticate, requireRole } from "../middleware/auth";

const router: IRouter = Router();

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

    const state = crypto.randomBytes(32).toString("hex");
    const baseUrl = `https://${req.get("host")}`;
    const acsUrl = `${baseUrl}/api/sso/saml/acs`;

    const samlRequest = Buffer.from(
      `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
      `ID="_${crypto.randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}" ` +
      `Destination="${config.idpSsoUrl}" AssertionConsumerServiceURL="${acsUrl}" ` +
      `ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">` +
      `<saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${baseUrl}</saml:Issuer>` +
      `</samlp:AuthnRequest>`,
    ).toString("base64");

    const redirectUrl = `${config.idpSsoUrl}?SAMLRequest=${encodeURIComponent(samlRequest)}&RelayState=${state}`;

    await logSsoEvent("sso_login_initiated", clientId, null, { provider: "saml" }, req.ip);

    res.json({ redirectUrl, state });
  },
);

router.post(
  "/sso/saml/acs",
  async (req, res): Promise<void> => {
    const { SAMLResponse } = req.body;

    if (!SAMLResponse) {
      res.status(400).json({ error: "Missing SAMLResponse" });
      return;
    }

    let decoded: string;
    try {
      decoded = Buffer.from(SAMLResponse, "base64").toString("utf-8");
    } catch {
      res.status(400).json({ error: "Invalid SAMLResponse encoding" });
      return;
    }

    const emailMatch = decoded.match(/<(?:saml:)?NameID[^>]*>([^<]+)<\/(?:saml:)?NameID>/);
    const nameMatch = decoded.match(
      /<(?:saml:)?Attribute\s+Name="(?:displayName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/name)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([^<]+)/,
    );

    if (!emailMatch || !emailMatch[1]) {
      res.status(400).json({ error: "Could not extract email from SAML assertion" });
      return;
    }

    const email = emailMatch[1].toLowerCase();
    const displayName = nameMatch?.[1] || email.split("@")[0];
    const domain = email.split("@")[1];

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
      res.status(403).json({ error: "No SSO configuration found for this domain" });
      return;
    }

    const { user, isNewUser } = await jitProvision(email, displayName, config.clientId, config.jitDefaultRole, "saml");

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId));

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
      config.clientId,
      user.id,
      { provider: "saml", email, isNewUser },
      req.ip,
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    const discoveryUrl = config.oidcIssuerUrl.endsWith("/")
      ? `${config.oidcIssuerUrl}.well-known/openid-configuration`
      : `${config.oidcIssuerUrl}/.well-known/openid-configuration`;

    let authorizationEndpoint: string;
    try {
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
      state: `${clientId}:${state}`,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const redirectUrl = `${authorizationEndpoint}?${params}`;

    await logSsoEvent("sso_login_initiated", clientId, null, { provider: "oidc" }, req.ip);

    res.json({
      redirectUrl,
      state,
      codeVerifier,
    });
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

    const [clientIdStr] = state.split(":");
    const clientId = Number(clientIdStr);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Invalid state" });
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
      res.status(404).json({ error: "OIDC configuration not found" });
      return;
    }

    const baseUrl = `https://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/sso/oidc/callback`;

    const discoveryUrl = config.oidcIssuerUrl.endsWith("/")
      ? `${config.oidcIssuerUrl}.well-known/openid-configuration`
      : `${config.oidcIssuerUrl}/.well-known/openid-configuration`;

    let tokenEndpoint: string;
    let userinfoEndpoint: string;
    try {
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
    if (config.oidcClientSecret) {
      tokenParams.set("client_secret", config.oidcClientSecret);
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
        res.status(400).json({ error: "Failed to obtain access token" });
        return;
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
      res.status(500).json({ error: "Failed to exchange OIDC code" });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "Email not provided by OIDC provider" });
      return;
    }

    const { user, isNewUser } = await jitProvision(email, displayName, clientId, config.jitDefaultRole, "oidc");

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId));

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
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

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
import { signToken } from "../../middleware/auth";
import { decryptCredential } from "../../utils/credential-encryption";
import { validateExternalUrl } from "../../utils/url-validation";

export async function fetchSamlMetadata(metadataUrl: string): Promise<{ ssoUrl: string; entityId: string; cert: string } | null> {
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

export function buildSamlInstance(baseUrl: string, idpSsoUrl: string, idpCert: string, idpEntityId?: string) {
  return new SAML({
    callbackUrl: `${baseUrl}/api/sso/saml/acs`,
    entryPoint: idpSsoUrl,
    issuer: baseUrl,
    idpCert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    audience: baseUrl,
    ...(idpEntityId ? { idpIssuer: idpEntityId } : {}),
  });
}

export async function resolveSamlConfig(config: typeof ssoConfigsTable.$inferSelect) {
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

  return { idpSsoUrl, idpCert, idpEntityId };
}

export function generateSamlMetadataXml(baseUrl: string): string {
  return `<?xml version="1.0"?>
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
}

export function computeSessionExpiry(config: typeof ssoConfigsTable.$inferSelect, idpSessionExpiry?: number | null) {
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

  return { sessionTtlMs, jwtExpiry };
}

export async function jitProvision(
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

export function logSsoEvent(
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

export async function issueToken(
  user: { id: number; email: string; clientId: number; role: string; bypassPayment: boolean },
  config: typeof ssoConfigsTable.$inferSelect,
  idpSessionExpiry?: number | null,
) {
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, user.clientId));

  const { sessionTtlMs, jwtExpiry } = computeSessionExpiry(config, idpSessionExpiry);

  const token = signToken({
    userId: user.id,
    clientId: user.clientId,
    role: user.role,
    email: user.email,
    plan: client?.plan,
    bypassPayment: user.bypassPayment,
  }, jwtExpiry);

  return { token, sessionTtlMs };
}

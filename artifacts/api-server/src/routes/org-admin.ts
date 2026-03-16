import { Router, type IRouter } from "express";
import crypto from "crypto";
import { validateExternalUrl } from "../utils/url-validation";
import { invalidateActiveStatusCache } from "../middleware/auth";
import {
  db,
  ssoConfigsTable,
  usersTable,
  platformAuditLogTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/auth";
import { encryptCredential } from "../utils/credential-encryption";

const router: IRouter = Router();

router.get(
  "/org/members",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const members = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        role: usersTable.role,
        ssoProvider: usersTable.ssoProvider,
        isActive: usersTable.isActive,
        lastLoginAt: usersTable.lastLoginAt,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.clientId, req.user!.clientId))
      .orderBy(desc(usersTable.createdAt));

    res.json(members);
  },
);

router.patch(
  "/org/members/:id",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const memberId = Number(req.params.id);
    if (isNaN(memberId)) {
      res.status(400).json({ error: "Invalid member ID" });
      return;
    }

    const [member] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, memberId),
          eq(usersTable.clientId, req.user!.clientId),
        ),
      );

    if (!member) {
      res.status(404).json({ error: "Member not found in your organization" });
      return;
    }

    if (member.id === req.user!.userId) {
      res.status(400).json({ error: "Cannot modify your own account from org admin" });
      return;
    }

    const { role, isActive } = req.body;
    const updates: Record<string, unknown> = {};

    if (role !== undefined) {
      const validRoles = ["viewer", "admin", "owner"];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: "Invalid role. Must be viewer, admin, or owner" });
        return;
      }
      updates.role = role;
    }

    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid updates provided" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, memberId))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        role: usersTable.role,
        isActive: usersTable.isActive,
      });

    if (isActive === false && updated?.email) {
      invalidateActiveStatusCache(memberId);
      const { revokeUserSessions } = await import("./sso");
      revokeUserSessions(updated.email);
    }

    await db.insert(platformAuditLogTable).values({
      clientId: req.user!.clientId,
      userId: req.user!.userId,
      action: "org_member_updated",
      resource: "user",
      resourceId: String(memberId),
      metadata: { updates, targetEmail: member.email },
      ipAddress: req.ip,
    });

    res.json(updated);
  },
);

router.get(
  "/org/sso-config",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(eq(ssoConfigsTable.clientId, req.user!.clientId));

    if (!config) {
      res.json(null);
      return;
    }

    res.json({
      id: config.id,
      providerType: config.providerType,
      idpMetadataUrl: config.idpMetadataUrl,
      idpEntityId: config.idpEntityId,
      idpSsoUrl: config.idpSsoUrl,
      oidcClientId: config.oidcClientId,
      oidcIssuerUrl: config.oidcIssuerUrl,
      domainHint: config.domainHint,
      jitDefaultRole: config.jitDefaultRole,
      forceSso: config.forceSso,
      enabled: config.enabled,
      hasScimToken: !!config.scimToken,
      scimGroupRoleMapping: config.scimGroupRoleMapping,
      jitDefaultPermissionProfileId: config.jitDefaultPermissionProfileId,
    });
  },
);

router.put(
  "/org/sso-config",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const {
      providerType,
      idpMetadataUrl,
      idpEntityId,
      idpSsoUrl,
      idpCert,
      oidcClientId,
      oidcClientSecret,
      oidcIssuerUrl,
      domainHint,
      jitDefaultRole,
      forceSso,
      enabled,
      scimGroupRoleMapping,
      jitDefaultPermissionProfileId,
    } = req.body;

    if (!providerType || !domainHint) {
      res.status(400).json({ error: "providerType and domainHint are required" });
      return;
    }

    if (!["saml", "oidc"].includes(providerType)) {
      res.status(400).json({ error: "providerType must be 'saml' or 'oidc'" });
      return;
    }

    if (providerType === "saml" && !idpSsoUrl && !idpMetadataUrl) {
      res.status(400).json({ error: "Either idpSsoUrl or idpMetadataUrl is required for SAML" });
      return;
    }

    if (providerType === "oidc" && (!oidcClientId || !oidcIssuerUrl)) {
      res.status(400).json({ error: "oidcClientId and oidcIssuerUrl are required for OIDC" });
      return;
    }

    if (oidcIssuerUrl && !validateExternalUrl(oidcIssuerUrl)) {
      res.status(400).json({ error: "OIDC issuer URL must be a valid external HTTPS URL" });
      return;
    }

    if (idpMetadataUrl && !validateExternalUrl(idpMetadataUrl)) {
      res.status(400).json({ error: "IdP metadata URL must be a valid external HTTPS URL" });
      return;
    }

    const [existing] = await db
      .select()
      .from(ssoConfigsTable)
      .where(eq(ssoConfigsTable.clientId, req.user!.clientId));

    const values: Record<string, unknown> = {
      clientId: req.user!.clientId,
      providerType,
      idpMetadataUrl: idpMetadataUrl || null,
      idpEntityId: idpEntityId || null,
      idpSsoUrl: idpSsoUrl || null,
      idpCert: idpCert ? encryptCredential(idpCert) : (existing?.idpCert ?? null),
      oidcClientId: oidcClientId || null,
      oidcClientSecret: oidcClientSecret ? encryptCredential(oidcClientSecret) : (existing?.oidcClientSecret ?? null),
      oidcIssuerUrl: oidcIssuerUrl || null,
      domainHint: domainHint.toLowerCase(),
      jitDefaultRole: jitDefaultRole || "viewer",
      forceSso: forceSso ?? false,
      scimGroupRoleMapping: scimGroupRoleMapping || null,
      jitDefaultPermissionProfileId: jitDefaultPermissionProfileId || null,
      enabled: enabled ?? true,
    };

    let config;
    if (existing) {
      [config] = await db
        .update(ssoConfigsTable)
        .set(values)
        .where(eq(ssoConfigsTable.clientId, req.user!.clientId))
        .returning();
    } else {
      [config] = await db
        .insert(ssoConfigsTable)
        .values(values)
        .returning();
    }

    await db.insert(platformAuditLogTable).values({
      clientId: req.user!.clientId,
      userId: req.user!.userId,
      action: "sso_config_updated",
      resource: "sso_config",
      resourceId: String(config.id),
      metadata: { providerType, domainHint, forceSso },
      ipAddress: req.ip,
    });

    res.json({
      id: config.id,
      providerType: config.providerType,
      domainHint: config.domainHint,
      jitDefaultRole: config.jitDefaultRole,
      forceSso: config.forceSso,
      enabled: config.enabled,
      hasScimToken: !!config.scimToken,
    });
  },
);

router.post(
  "/org/scim-token",
  authenticate,
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const [config] = await db
      .select()
      .from(ssoConfigsTable)
      .where(eq(ssoConfigsTable.clientId, req.user!.clientId));

    if (!config) {
      res.status(400).json({ error: "Configure SSO first before generating a SCIM token" });
      return;
    }

    const token = `scim_${crypto.randomBytes(32).toString("hex")}`;
    const encryptedToken = encryptCredential(token);

    await db
      .update(ssoConfigsTable)
      .set({ scimToken: encryptedToken })
      .where(eq(ssoConfigsTable.id, config.id));

    await db.insert(platformAuditLogTable).values({
      clientId: req.user!.clientId,
      userId: req.user!.userId,
      action: "scim_token_generated",
      resource: "sso_config",
      resourceId: String(config.id),
      ipAddress: req.ip,
    });

    res.json({ token });
  },
);

export default router;

import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const ssoConfigsTable = pgTable("sso_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }).unique(),
  providerType: text("provider_type").notNull(),
  idpMetadataUrl: text("idp_metadata_url"),
  idpEntityId: text("idp_entity_id"),
  idpSsoUrl: text("idp_sso_url"),
  idpCert: text("idp_cert"),
  oidcClientId: text("oidc_client_id"),
  oidcClientSecret: text("oidc_client_secret"),
  oidcIssuerUrl: text("oidc_issuer_url"),
  domainHint: text("domain_hint").notNull(),
  jitDefaultRole: text("jit_default_role").notNull().default("viewer"),
  forceSso: boolean("force_sso").notNull().default(false),
  scimToken: text("scim_token"),
  scimGroupRoleMapping: jsonb("scim_group_role_mapping"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SsoConfig = typeof ssoConfigsTable.$inferSelect;

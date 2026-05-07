import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";
import { clientsTable } from "./clients";

export const mcpOAuthClientsTable = pgTable("mcp_oauth_clients", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientName: text("client_name").notNull(),
  clientSecretHash: text("client_secret_hash"),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
  allowedScopes: jsonb("allowed_scopes").$type<string[]>().notNull().default(["bots:read"]),
  platformApiKeyId: integer("platform_api_key_id").references(() => platformApiKeysTable.id, { onDelete: "set null" }),
  clientIdOwner: integer("client_id_owner").references(() => clientsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mcp_oauth_clients_client_id_idx").on(table.clientId),
  index("mcp_oauth_clients_client_id_owner_idx").on(table.clientIdOwner),
]);

export const mcpOAuthCodesTable = pgTable("mcp_oauth_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  oauthClientId: text("oauth_client_id").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  authorizingClientId: integer("authorizing_client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  authorizingDevKeyId: integer("authorizing_dev_key_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mcp_oauth_codes_code_idx").on(table.code),
  index("mcp_oauth_codes_client_id_idx").on(table.oauthClientId),
]);

export const mcpOAuthTokensTable = pgTable("mcp_oauth_tokens", {
  id: serial("id").primaryKey(),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  refreshTokenHash: text("refresh_token_hash").unique(),
  oauthClientId: text("oauth_client_id").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mcp_oauth_tokens_access_token_hash_idx").on(table.accessTokenHash),
  index("mcp_oauth_tokens_refresh_token_hash_idx").on(table.refreshTokenHash),
  index("mcp_oauth_tokens_client_id_idx").on(table.oauthClientId),
]);

export type McpOAuthClient = typeof mcpOAuthClientsTable.$inferSelect;
export type McpOAuthCode = typeof mcpOAuthCodesTable.$inferSelect;
export type McpOAuthToken = typeof mcpOAuthTokensTable.$inferSelect;

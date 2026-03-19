import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { mcpServersTable } from "./mcp-servers";

export const mcpDirectorySubmissionsTable = pgTable("mcp_directory_submissions", {
  id: serial("id").primaryKey(),
  mcpServerId: integer("mcp_server_id").notNull().references(() => mcpServersTable.id, { onDelete: "cascade" }),
  directorySlug: text("directory_slug").notNull(),
  status: text("status").notNull().default("not_started"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  listingUrl: text("listing_url"),
  optimizedDescription: text("optimized_description"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.mcpServerId, table.directorySlug),
]);

export type McpDirectorySubmission = typeof mcpDirectorySubmissionsTable.$inferSelect;
export type NewMcpDirectorySubmission = typeof mcpDirectorySubmissionsTable.$inferInsert;

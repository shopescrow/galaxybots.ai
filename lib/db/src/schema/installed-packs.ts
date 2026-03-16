import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const installedPacksTable = pgTable("installed_packs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique("installed_packs_client_pack_unique").on(table.clientId, table.packId),
]);

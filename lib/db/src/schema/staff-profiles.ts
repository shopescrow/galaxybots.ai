import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

export const AVATAR_PLACEHOLDER_VALUES = ["male", "female", "neutral"] as const;
export type AvatarPlaceholder = typeof AVATAR_PLACEHOLDER_VALUES[number];

export const staffProfilesTable = pgTable("staff_profiles", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  employeeId: text("employee_id"),
  jobTitle: text("job_title").notNull(),
  avatarUrl: text("avatar_url"),
  avatarPlaceholder: text("avatar_placeholder").$type<AvatarPlaceholder>(),
  selfNote: text("self_note"),
  adminNote: text("admin_note"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("staff_profiles_client_id_idx").on(table.clientId),
]);

export const insertStaffProfileSchema = createInsertSchema(staffProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type StaffProfile = typeof staffProfilesTable.$inferSelect;
export type InsertStaffProfile = z.infer<typeof insertStaffProfileSchema>;

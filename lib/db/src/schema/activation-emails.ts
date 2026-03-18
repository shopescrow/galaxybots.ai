import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const activationEmailsTable = pgTable("activation_emails", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emailType: text("email_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
}, (t) => ({
  uniqueUserEmailType: uniqueIndex("activation_emails_user_email_type_unique").on(t.userId, t.emailType),
}));

export type ActivationEmail = typeof activationEmailsTable.$inferSelect;

import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformAnomaliesTable = pgTable(
  "platform_anomalies",
  {
    id: serial("id").primaryKey(),
    patternId: integer("pattern_id"),
    anomalyType: text("anomaly_type").notNull(),
    description: text("description").notNull(),
    clientsAffected: integer("clients_affected").notNull().default(0),
    detectedEffectSize: real("detected_effect_size"),
    expectedEffectSize: real("expected_effect_size"),
    deviationStdDevs: real("deviation_std_devs"),
    quarantineStatus: text("quarantine_status").notNull().default("quarantined"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notifiedOracleAt: timestamp("notified_oracle_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("platform_anomalies_pattern_id_idx").on(table.patternId),
    index("platform_anomalies_quarantine_status_idx").on(table.quarantineStatus),
    index("platform_anomalies_anomaly_type_idx").on(table.anomalyType),
    index("platform_anomalies_created_at_idx").on(table.createdAt),
  ],
);

export const insertPlatformAnomalySchema = createInsertSchema(
  platformAnomaliesTable,
).omit({ id: true, createdAt: true });

export type PlatformAnomaly = typeof platformAnomaliesTable.$inferSelect;
export type InsertPlatformAnomaly = z.infer<typeof insertPlatformAnomalySchema>;

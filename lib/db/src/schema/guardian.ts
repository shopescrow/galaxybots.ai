import { pgTable, text, serial, timestamp, integer, real, jsonb, vector, uniqueIndex, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guardianStateTable = pgTable(
  "guardian_state",
  {
    id: serial("id").primaryKey(),
    singletonKey: smallint("singleton_key").notNull().default(1),
    mode: text("mode").notNull().default("active"),
    lastSwarmCycleAt: timestamp("last_swarm_cycle_at", { withTimezone: true }),
    pausedByUserId: integer("paused_by_user_id"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("guardian_state_singleton_key_idx").on(table.singletonKey)],
);

export const guardianIncidentsTable = pgTable("guardian_incidents", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: integer("severity").notNull().default(0),
  blastRadius: integer("blast_radius").notNull().default(0),
  recurrenceRate: real("recurrence_rate").notNull().default(0),
  status: text("status").notNull().default("open"),
  affectedComponent: text("affected_component"),
  errorFingerprint: text("error_fingerprint"),
  sourcePayload: jsonb("source_payload"),
  kiloProAuditTag: text("kilopro_audit_tag"),
  embedding: vector("embedding", { dimensions: 1536 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guardianWorkersTable = pgTable("guardian_workers", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => guardianIncidentsTable.id, { onDelete: "cascade" }),
  beeType: text("bee_type").notNull(),
  status: text("status").notNull().default("dispatched"),
  finding: text("finding"),
  proposedFix: text("proposed_fix"),
  rootCause: text("root_cause"),
  confidenceScore: real("confidence_score"),
  rawResponse: jsonb("raw_response"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const guardianPostmortemsTable = pgTable("guardian_postmortems", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => guardianIncidentsTable.id, { onDelete: "cascade" }),
  triggerEvent: text("trigger_event").notNull(),
  detectionTime: text("detection_time"),
  blastRadiusSummary: text("blast_radius_summary"),
  timeline: text("timeline").notNull(),
  rootCause: text("root_cause").notNull(),
  appliedRemedy: text("applied_remedy").notNull(),
  preventionRecommendation: text("prevention_recommendation").notNull(),
  kiloProCompatible: text("kilopro_compatible").notNull().default("yes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guardianPatrolsTable = pgTable("guardian_patrols", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  triggerPattern: text("trigger_pattern").notNull(),
  schedulerJobName: text("scheduler_job_name"),
  recurrenceCount: integer("recurrence_count").notNull().default(0),
  isActive: text("is_active").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
});

export const insertGuardianIncidentSchema = createInsertSchema(guardianIncidentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGuardianWorkerSchema = createInsertSchema(guardianWorkersTable).omit({ id: true, dispatchedAt: true });
export const insertGuardianPostmortemSchema = createInsertSchema(guardianPostmortemsTable).omit({ id: true, createdAt: true });
export const insertGuardianPatrolSchema = createInsertSchema(guardianPatrolsTable).omit({ id: true, createdAt: true });

export type GuardianState = typeof guardianStateTable.$inferSelect;
export type GuardianIncident = typeof guardianIncidentsTable.$inferSelect;
export type GuardianWorker = typeof guardianWorkersTable.$inferSelect;
export type GuardianPostmortem = typeof guardianPostmortemsTable.$inferSelect;
export type GuardianPatrol = typeof guardianPatrolsTable.$inferSelect;
export type InsertGuardianIncident = z.infer<typeof insertGuardianIncidentSchema>;

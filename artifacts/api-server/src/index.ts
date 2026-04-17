import app from "./app";
import { setShuttingDown } from "./app";
import { startScheduler, stopScheduler } from "./services/platform/scheduler";
import { backfillExistingBotPermissions } from "./services/platform/governance";
import { startWebhookDeliveryWorker, stopWebhookDeliveryWorker } from "./services/platform/webhook-delivery";
import { ProspectingWorker } from "./services/prospecting/prospecting-worker";
import { closeAllSSEClients } from "./services/platform/sse";
import { getAllTools } from "./tools";
import { seedDefaultOutreachTemplates } from "./services/prospecting/seed-outreach-templates";
import { seedDefaultPartners } from "./services/admin/seed-partners";
import { seedMissionTemplates } from "./services/missions/seed-mission-templates";
import { seedPlaybooks } from "./services/missions/seed-playbooks";
import { seedApiVersioningChangelog } from "./services/platform/seed-changelog";
import { pool, db, partnerRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const EXPECTED_TABLES = [
  "aeo_recommendation_cache",
  "aeo_scan_requests",
  "aeo_scores",
  "aeo_webhooks",
  "analytics_api_keys",
  "background_reports",
  "bingolingo_api_keys",
  "bingolingo_clients",
  "bingolingo_content",
  "blog_posts",
  "boardroom_messages",
  "bot_assignments",
  "bot_audit_log",
  "bot_memories",
  "bot_tool_permissions",
  "bots",
  "brand_voice_configs",
  "call_improvement_runs",
  "call_logs",
  "client_bots",
  "client_compliance_requirements",
  "client_cost_caps",
  "client_health_events",
  "client_health_notes",
  "client_health_scores",
  "client_integrations",
  "client_stakeholders",
  "clients",
  "competitor_urls",
  "conversations",
  "documents",
  "guest_sessions",
  "installed_packs",
  "journal_entries",
  "kb_source_chunks",
  "kb_source_documents",
  "knowledge_base_chunks",
  "knowledge_base_documents",
  "knowledge_base_sources",
  "llm_usage_log",
  "marketplace_installs",
  "marketplace_templates",
  "mcp_tool_calls",
  "messages",
  "notifications",
  "accessorial_addons",
  "accessorial_subscriptions",
  "account_subscriptions",
  "partner_applications",
  "partner_registrations",
  "partner_tier_review_log",
  "partners",
  "subscription_plans",
  "usage_events",
  "pending_approvals",
  "permission_profile_templates",
  "pipeline_run_steps",
  "pipeline_runs",
  "pipeline_steps",
  "pipeline_triggers",
  "pipelines",
  "platform_api_keys",
  "platform_audit_log",
  "platform_compliance",
  "proposals",
  "prospect_outreach_log",
  "prospect_outreach_templates",
  "prospects",
  "receptionist_configs",
  "roi_shareable_reports",
  "session_outcomes",
  "sso_configs",
  "task_session_bots",
  "task_session_messages",
  "task_sessions",
  "tool_activity_log",
  "trigger_events",
  "user_preferences",
  "users",
  "webhook_deliveries",
  "world_state",
  "intelligence_briefs",
  "briefing_settings",
  "mission_templates",
  "mcp_servers",
  "mcp_directory_submissions",
  "extraction_jobs",
  "extraction_pages",
  "crm_blueprints",
  "crm_records",
];

async function ensureCrmTables() {
  // Idempotent DDL for Task #112 CRM tables. Mirrors lib/db/migrations/0027_add_crm_blueprints.sql.
  // Safe to run on every startup; no-op if tables already exist.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "crm_blueprints" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "description" text,
        "source_job_id" integer REFERENCES "extraction_jobs"("id") ON DELETE SET NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "definition" jsonb NOT NULL DEFAULT '{"entities":[]}'::jsonb,
        "record_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "crm_records" (
        "id" serial PRIMARY KEY,
        "crm_id" integer NOT NULL REFERENCES "crm_blueprints"("id") ON DELETE CASCADE,
        "entity_type" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_crm_records_crm_entity" ON "crm_records"("crm_id", "entity_type");
      CREATE INDEX IF NOT EXISTS "idx_crm_blueprints_source_job" ON "crm_blueprints"("source_job_id");
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] ensureCrmTables failed: ${msg}`);
  }
}

async function validateDatabaseTables() {
  try {
    const { rows } = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const existing = new Set(rows.map((r: { tablename: string }) => r.tablename));
    const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));

    console.log(`[startup] Database table check: ${existing.size} tables found, ${EXPECTED_TABLES.length} expected.`);

    if (missing.length > 0) {
      console.warn(
        `[startup] WARNING: ${missing.length} expected table(s) missing: ${missing.join(", ")}. ` +
        `Run 'pnpm --filter @workspace/db push' to create missing tables.`
      );
    } else {
      console.log("[startup] All expected database tables are present.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] Database table validation failed: ${msg}`);
  }
}

if (process.env.NODE_ENV === "production" && !process.env.CREDENTIAL_ENCRYPTION_KEY) {
  throw new Error(
    "CREDENTIAL_ENCRYPTION_KEY must be set in production. " +
    "Generate a 32+ character random string and set it as an environment variable."
  );
}

if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
  console.warn(
    "[startup] WARNING: CREDENTIAL_ENCRYPTION_KEY is not set. " +
    "Falling back to DATABASE_URL for credential encryption. This is insecure and not allowed in production."
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensurePirateMonsterPartnerRegistered() {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const inboundSecret = process.env["PIRATEMONSTER_INBOUND_SECRET"] || "";
  const apiBaseUrl = process.env["PIRATEMONSTER_API_BASE_URL"] || "";

  if (!apiKey || !inboundSecret || !apiBaseUrl) {
    console.log("[startup] PirateMonster credentials incomplete — skipping partner auto-registration");
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.partnerRef, "piratemonster"))
      .limit(1);

    if (existing) {
      if (existing.plan !== "enterprise" || existing.status !== "active") {
        await db
          .update(partnerRegistrationsTable)
          .set({ plan: "enterprise", status: "active" })
          .where(eq(partnerRegistrationsTable.partnerRef, "piratemonster"));
        console.log("[startup] PirateMonster partner registration updated to enterprise/active");
      } else {
        console.log("[startup] PirateMonster partner registration already confirmed (enterprise/active)");
      }
      return;
    }

    await db.insert(partnerRegistrationsTable).values({
      partnerRef: "piratemonster",
      clientId: 0,
      companyName: "PirateMonster.com",
      contactName: "PirateMonster Platform",
      contactEmail: "platform@piratemonster.com",
      plan: "enterprise",
      source: "platform_integration",
      status: "active",
    });
    console.log("[startup] PirateMonster partner auto-registered as enterprise partner");
  } catch (err) {
    console.error("[startup] PirateMonster partner auto-registration failed:", err);
  }
}

// The drain timeout covers HTTP in-flight request completion via server.close().
// Worker intervals are cleared immediately (no new ticks), but any already-executing
// async work (e.g., active webhook deliveries, prospect enrichments) will complete
// naturally as the event loop drains before process.exit().
const DRAIN_TIMEOUT_MS = 15_000;
let isShuttingDown = false;

async function gracefulShutdown(signal: string, server: ReturnType<typeof app.listen>) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[shutdown] Received ${signal}, starting graceful shutdown...`);
  setShuttingDown(true);

  stopScheduler();
  console.log("[shutdown] Scheduler stopped (new ticks halted)");

  ProspectingWorker.stop();
  console.log("[shutdown] Prospecting worker stopped (new polls halted)");

  stopWebhookDeliveryWorker();
  console.log("[shutdown] Webhook delivery worker stopped (new ticks halted)");

  closeAllSSEClients();
  console.log("[shutdown] SSE clients closed");

  await new Promise<void>((resolve) => {
    const drainTimer = setTimeout(() => {
      console.log("[shutdown] Drain timeout reached, forcing close");
      resolve();
    }, DRAIN_TIMEOUT_MS);

    server.close(() => {
      clearTimeout(drainTimer);
      console.log("[shutdown] HTTP server closed (all in-flight requests completed)");
      resolve();
    });
  });

  try {
    await pool.end();
    console.log("[shutdown] Database pool closed");
  } catch (err) {
    console.error("[shutdown] Error closing database pool:", err);
  }

  console.log("[shutdown] Graceful shutdown complete");
  process.exit(0);
}

const server = app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await ensureCrmTables();
  await validateDatabaseTables();
  await ensurePirateMonsterPartnerRegistered();
  await startScheduler();
  startWebhookDeliveryWorker();
  ProspectingWorker.start();
  seedDefaultOutreachTemplates().catch((err) => {
    console.error("[seed] Outreach template seeding failed:", err);
  });
  seedDefaultPartners().catch((err) => {
    console.error("[seed] Partner seeding failed:", err);
  });
  seedMissionTemplates().catch((err) => {
    console.error("[seed] Mission template seeding failed:", err);
  });
  seedPlaybooks().catch((err) => {
    console.error("[seed] Playbook seeding failed:", err);
  });
  backfillExistingBotPermissions(getAllTools).catch((err) => {
    console.error("[governance] Permission backfill failed:", err);
  });
  seedApiVersioningChangelog().catch((err) => {
    console.error("[seed] API versioning changelog seeding failed:", err);
  });
});

process.on("SIGTERM", () => gracefulShutdown("SIGTERM", server));
process.on("SIGINT", () => gracefulShutdown("SIGINT", server));

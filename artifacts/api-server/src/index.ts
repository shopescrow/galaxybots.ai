import app from "./app";
import { startScheduler } from "./services/scheduler";
import { backfillExistingBotPermissions } from "./services/governance";
import { startWebhookDeliveryWorker } from "./services/webhook-delivery";
import { ProspectingWorker } from "./services/prospecting-worker";
import { getAllTools } from "./tools";
import { seedDefaultOutreachTemplates } from "./services/seed-outreach-templates";
import { seedDefaultPartners } from "./services/seed-partners";
import { seedMissionTemplates } from "./services/seed-mission-templates";
import { pool } from "@workspace/db";

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
];

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

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await validateDatabaseTables();
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
  backfillExistingBotPermissions(getAllTools).catch((err) => {
    console.error("[governance] Permission backfill failed:", err);
  });
});

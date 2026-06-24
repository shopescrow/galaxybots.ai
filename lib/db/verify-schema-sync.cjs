const { Pool } = require("pg");

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
  "gaa_action_ledger",
  "gaa_audit_events",
  "gaa_constitution",
  "gaa_escalations",
  "gaa_goals",
  "gaa_journal",
  "gaa_memory",
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
  "partner_registrations",
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
];

async function verify() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const existing = new Set(rows.map((r) => r.tablename));

    const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));
    if (missing.length > 0) {
      console.error("MISSING tables:", missing.join(", "));
      process.exit(1);
    }

    console.log(`All ${EXPECTED_TABLES.length} expected tables exist.`);
  } finally {
    await pool.end();
  }
}

verify();

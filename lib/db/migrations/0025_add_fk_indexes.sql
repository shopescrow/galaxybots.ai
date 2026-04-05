CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_bots_client_id ON client_bots (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_bots_bot_id ON client_bots (bot_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_client_id ON conversations (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_bot_id ON conversations (bot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_status ON conversations (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_created_at ON conversations (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at ON messages (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_sessions_client_id ON task_sessions (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_sessions_status ON task_sessions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_sessions_created_at ON task_sessions (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_session_bots_session_id ON task_session_bots (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_session_bots_bot_id ON task_session_bots (bot_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_session_messages_session_id ON task_session_messages (session_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_client_id ON users (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_website_url ON clients (website_url);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_status ON clients (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_created_at ON clients (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries (webhook_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_client_id ON notifications (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_audit_log_bot_id ON bot_audit_log (bot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_audit_log_client_id ON bot_audit_log (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_usage_log_client_id ON llm_usage_log (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_usage_log_bot_id ON llm_usage_log (bot_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_client_id ON documents (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_outcomes_session_id ON session_outcomes (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_outcomes_client_id ON session_outcomes (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospects_job_id ON prospects (job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospects_client_id ON prospects (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospects_status ON prospects (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospecting_jobs_client_id ON prospecting_jobs (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospecting_jobs_status ON prospecting_jobs (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_runs_pipeline_id ON pipeline_runs (pipeline_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_run_steps_run_id ON pipeline_run_steps (run_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installed_packs_client_id ON installed_packs (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_integrations_client_id ON client_integrations (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_health_scores_client_id ON client_health_scores (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_health_events_client_id ON client_health_events (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_approvals_client_id ON pending_approvals (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_approvals_status ON pending_approvals (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_tool_calls_client_id ON mcp_tool_calls (client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_tool_calls_bot_id ON mcp_tool_calls (bot_id);

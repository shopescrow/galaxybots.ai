DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mcp_lead_source') THEN
    CREATE TYPE mcp_lead_source AS ENUM ('request_demo', 'roi_signal', 'pricing_signal');
  END IF;
END$$;

ALTER TABLE mcp_leads
  ALTER COLUMN source TYPE mcp_lead_source USING source::mcp_lead_source;

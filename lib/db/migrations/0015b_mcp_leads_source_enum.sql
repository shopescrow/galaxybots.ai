DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mcp_lead_source') THEN
    CREATE TYPE mcp_lead_source AS ENUM ('request_demo', 'roi_signal', 'pricing_signal', 'launch_page');
  ELSE
    BEGIN
      ALTER TYPE mcp_lead_source ADD VALUE IF NOT EXISTS 'launch_page';
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END$$;

ALTER TABLE mcp_leads
  ALTER COLUMN source DROP DEFAULT;

ALTER TABLE mcp_leads
  ALTER COLUMN source TYPE mcp_lead_source USING source::mcp_lead_source;

ALTER TABLE mcp_leads
  ALTER COLUMN source SET DEFAULT 'launch_page';

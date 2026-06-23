import pg from "pg";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
  ALTER TABLE goal_conflicts ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS goal_conflicts_client_id_idx ON goal_conflicts(client_id);

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'goal_conflicts_goal_a_id_fkey'
    ) THEN
      ALTER TABLE goal_conflicts
        ADD CONSTRAINT goal_conflicts_goal_a_id_fkey
        FOREIGN KEY (goal_a_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'goal_conflicts_goal_b_id_fkey'
    ) THEN
      ALTER TABLE goal_conflicts
        ADD CONSTRAINT goal_conflicts_goal_b_id_fkey
        FOREIGN KEY (goal_b_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'uncertainty_schedules_goal_id_fkey'
    ) THEN
      ALTER TABLE uncertainty_schedules
        ADD CONSTRAINT uncertainty_schedules_goal_id_fkey
        FOREIGN KEY (goal_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;
  END $$;

  ALTER TABLE bot_loop_config ADD COLUMN IF NOT EXISTS auto_approve_goal_impact_threshold INTEGER NOT NULL DEFAULT 40;
`;

try {
  await pool.query(sql);
  console.log("Phase 3 v2 migration applied successfully.");
} catch (e) {
  console.error("Migration error:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}

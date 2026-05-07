CREATE TABLE IF NOT EXISTS guest_sessions (
  id SERIAL PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  task_session_id INTEGER REFERENCES task_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mission_completed BOOLEAN NOT NULL DEFAULT false,
  roi_data TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_ip_hash ON guest_sessions(ip_hash);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_session_token ON guest_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires_at ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_status ON guest_sessions(status);

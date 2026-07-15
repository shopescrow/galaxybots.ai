-- room_participants: tracks who is currently in a live task session room
CREATE TABLE IF NOT EXISTS room_participants (
  id           SERIAL PRIMARY KEY,
  task_session_id INTEGER NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_id    INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'observer' CHECK (role IN ('observer', 'participant')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_participants_session_user
  ON room_participants (task_session_id, user_id);

CREATE INDEX IF NOT EXISTS idx_room_participants_session_seen
  ON room_participants (task_session_id, last_seen_at);

-- Add sender_role to task_session_messages to distinguish human vs agent messages
ALTER TABLE task_session_messages
  ADD COLUMN IF NOT EXISTS sender_role TEXT NOT NULL DEFAULT 'agent'
    CHECK (sender_role IN ('agent', 'human'));

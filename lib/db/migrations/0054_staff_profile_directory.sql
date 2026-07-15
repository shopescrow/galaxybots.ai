-- Migration: Staff Profile Directory
-- Creates the staff_profiles table for HR to register team members
-- with public self-notes and private admin-only notes.

CREATE TABLE IF NOT EXISTS staff_profiles (
  id                 SERIAL PRIMARY KEY,
  client_id          INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  employee_id        TEXT,
  job_title          TEXT NOT NULL,
  avatar_url         TEXT,
  avatar_placeholder TEXT CHECK (avatar_placeholder IN ('male', 'female', 'neutral')),
  self_note          TEXT,
  admin_note         TEXT,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_profiles_client_id_idx ON staff_profiles (client_id);

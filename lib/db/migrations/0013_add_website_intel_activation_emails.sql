ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_intel jsonb;

CREATE TABLE IF NOT EXISTS activation_emails (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  opened_at timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS activation_emails_user_email_type_unique ON activation_emails(user_id, email_type);

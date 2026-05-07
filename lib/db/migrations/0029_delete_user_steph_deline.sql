-- One-time data cleanup: remove the user steph.deline@outlook.com.
-- Idempotent — DELETE matches zero rows on environments where the
-- user is already absent (e.g. dev), so safe to replay.
--
-- Note: this only removes the user row. The associated client row
-- (NoCompany.AI, client_id=2 on prod at the time of writing) is
-- intentionally left in place to avoid cascading deletes across the
-- many tables that FK into clients. If the company should also be
-- removed, do that as a separate, explicit step.
DELETE FROM "users" WHERE lower("email") = lower('steph.deline@outlook.com');

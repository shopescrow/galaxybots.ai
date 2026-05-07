-- One-time data cleanup: remove the orphan "NoCompany.AI" client that
-- belonged solely to steph.deline@outlook.com (deleted in migration
-- 0029). Without this, the company row sits with no users able to
-- access it, plus ~1,107 rows of historical health-score data and
-- ~929 notifications hanging off it.
--
-- Identification is by email (looked up from the historical user row
-- if still present, otherwise by company_name + zero-user check) so
-- the migration is safe to replay and won't accidentally delete a
-- different client if ids ever shift.
--
-- The order matters:
--   1. Delete client_health_scores (NO ACTION FK — would block the
--      cascade otherwise).
--   2. Delete the client itself (CASCADE handles everything else,
--      including any leftover user rows; SET NULL FKs leave their
--      rows in place with NULL client_id).
--
-- Idempotent — selecting the target via a CTE returns zero rows once
-- the cleanup has been applied, so subsequent runs are no-ops.

WITH target AS (
  SELECT id FROM "clients"
  WHERE lower("company_name") = lower('NoCompany.AI')
    AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."client_id" = "clients"."id")
)
DELETE FROM "client_health_scores"
WHERE "client_id" IN (SELECT id FROM target);

DELETE FROM "clients"
WHERE lower("company_name") = lower('NoCompany.AI')
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."client_id" = "clients"."id");

-- Enforce append-only semantics on galaxy_audit_ledger at the DB level.
-- Prevents any UPDATE or DELETE, ensuring the immutable audit trail cannot be
-- tampered with even by application-level ORM code.

CREATE OR REPLACE FUNCTION prevent_audit_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'galaxy_audit_ledger is append-only: % operations are not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ledger_no_update ON galaxy_audit_ledger;
CREATE TRIGGER trg_audit_ledger_no_update
  BEFORE UPDATE ON galaxy_audit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_ledger_mutation();

DROP TRIGGER IF EXISTS trg_audit_ledger_no_delete ON galaxy_audit_ledger;
CREATE TRIGGER trg_audit_ledger_no_delete
  BEFORE DELETE ON galaxy_audit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_ledger_mutation();

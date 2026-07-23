PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_plans (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL UNIQUE REFERENCES decision_passports(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  created_at TEXT NOT NULL,
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json))
);

CREATE TABLE IF NOT EXISTS execution_receipts (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES execution_plans(id),
  task_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json))
);

CREATE TABLE IF NOT EXISTS execution_reconciliations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES execution_plans(id),
  passport_id TEXT NOT NULL REFERENCES decision_passports(id),
  recorded_at TEXT NOT NULL,
  reconciliation_json TEXT NOT NULL CHECK (json_valid(reconciliation_json))
);

CREATE INDEX IF NOT EXISTS idx_execution_plans_household_time
  ON execution_plans(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_receipts_plan_time
  ON execution_receipts(plan_id, recorded_at ASC);
CREATE INDEX IF NOT EXISTS idx_execution_reconciliations_plan_time
  ON execution_reconciliations(plan_id, recorded_at ASC);

CREATE TRIGGER IF NOT EXISTS execution_plans_no_update
BEFORE UPDATE ON execution_plans
BEGIN
  SELECT RAISE(ABORT, 'execution plans are immutable');
END;

CREATE TRIGGER IF NOT EXISTS execution_plans_no_delete
BEFORE DELETE ON execution_plans
BEGIN
  SELECT RAISE(ABORT, 'execution plans are immutable');
END;

CREATE TRIGGER IF NOT EXISTS execution_receipts_no_update
BEFORE UPDATE ON execution_receipts
BEGIN
  SELECT RAISE(ABORT, 'execution receipts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS execution_receipts_no_delete
BEFORE DELETE ON execution_receipts
BEGIN
  SELECT RAISE(ABORT, 'execution receipts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS execution_reconciliations_no_update
BEFORE UPDATE ON execution_reconciliations
BEGIN
  SELECT RAISE(ABORT, 'execution reconciliations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS execution_reconciliations_no_delete
BEFORE DELETE ON execution_reconciliations
BEGIN
  SELECT RAISE(ABORT, 'execution reconciliations are immutable');
END;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  advisor_name TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  first_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 0),
  retirement_age INTEGER NOT NULL CHECK (retirement_age >= age)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  account_type TEXT NOT NULL,
  name TEXT NOT NULL,
  balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
  managed INTEGER NOT NULL CHECK (managed IN (0, 1)),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json))
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  market_value_cents INTEGER NOT NULL CHECK (market_value_cents >= 0),
  cost_basis_cents INTEGER NOT NULL CHECK (cost_basis_cents >= 0),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json))
);

CREATE TABLE IF NOT EXISTS liabilities (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  liability_type TEXT NOT NULL,
  name TEXT NOT NULL,
  balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
  annual_rate REAL NOT NULL,
  monthly_payment_cents INTEGER NOT NULL,
  remaining_months INTEGER NOT NULL,
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json))
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  property_type TEXT NOT NULL,
  label TEXT NOT NULL,
  market_value_cents INTEGER NOT NULL,
  mortgage_balance_cents INTEGER NOT NULL,
  location TEXT NOT NULL,
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json))
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  goal_type TEXT NOT NULL,
  label TEXT NOT NULL,
  target_amount_cents INTEGER NOT NULL,
  target_date TEXT NOT NULL,
  priority INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_facts (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households(id),
  category TEXT NOT NULL,
  field_path TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT REFERENCES source_facts(id)
);

CREATE TABLE IF NOT EXISTS financial_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_at TEXT NOT NULL,
  assumptions_json TEXT NOT NULL CHECK (json_valid(assumptions_json)),
  scenarios_json TEXT NOT NULL CHECK (json_valid(scenarios_json)),
  conflicts_json TEXT NOT NULL CHECK (json_valid(conflicts_json))
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  run_id TEXT NOT NULL REFERENCES scenario_runs(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  compliance_json TEXT NOT NULL CHECK (json_valid(compliance_json))
);

CREATE TABLE IF NOT EXISTS human_reviews (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  attestation INTEGER NOT NULL CHECK (attestation IN (0, 1)),
  reviewed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_observations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  series_id TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  UNIQUE(source, series_id, observation_date)
);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL REFERENCES households(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  previous_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_events_household_time
  ON financial_events(household_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenarios_household_time
  ON scenario_runs(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_household_time
  ON recommendations(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_household_sequence
  ON audit_events(household_id, sequence_number DESC);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

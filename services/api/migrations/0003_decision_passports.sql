ALTER TABLE scenario_runs ADD COLUMN decision_capital_cents INTEGER;
ALTER TABLE scenario_runs ADD COLUMN constitution_json TEXT CHECK (constitution_json IS NULL OR json_valid(constitution_json));
ALTER TABLE scenario_runs ADD COLUMN analysis_json TEXT CHECK (analysis_json IS NULL OR json_valid(analysis_json));

CREATE TABLE IF NOT EXISTS client_constitutions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  version INTEGER NOT NULL CHECK (version > 0),
  effective_at TEXT NOT NULL,
  constitution_json TEXT NOT NULL CHECK (json_valid(constitution_json)),
  UNIQUE(household_id, version)
);

CREATE TABLE IF NOT EXISTS decision_passports (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL UNIQUE REFERENCES recommendations(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  run_id TEXT NOT NULL REFERENCES scenario_runs(id),
  issued_at TEXT NOT NULL,
  passport_json TEXT NOT NULL CHECK (json_valid(passport_json)),
  content_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VALID', 'REVIEW_REQUIRED', 'INVALIDATED')),
  last_checked_at TEXT,
  invalidated_at TEXT,
  invalidation_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(invalidation_reasons_json))
);

CREATE TABLE IF NOT EXISTS passport_validity_checks (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES decision_passports(id),
  checked_at TEXT NOT NULL,
  status_before TEXT NOT NULL,
  status_after TEXT NOT NULL,
  results_json TEXT NOT NULL CHECK (json_valid(results_json)),
  reasons_json TEXT NOT NULL CHECK (json_valid(reasons_json))
);

CREATE INDEX IF NOT EXISTS idx_constitutions_household_version
  ON client_constitutions(household_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_passports_household_issued
  ON decision_passports(household_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_passports_status
  ON decision_passports(status, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_passport_checks_time
  ON passport_validity_checks(passport_id, checked_at DESC);

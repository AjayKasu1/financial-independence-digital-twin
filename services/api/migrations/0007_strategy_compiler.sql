PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS strategy_compilations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  opportunity_id TEXT NOT NULL,
  trigger_event_id TEXT,
  compiler_version TEXT NOT NULL,
  compiled_at TEXT NOT NULL,
  compilation_json TEXT NOT NULL CHECK (json_valid(compilation_json))
);

CREATE INDEX IF NOT EXISTS idx_strategy_compilations_household_time
  ON strategy_compilations(household_id, compiled_at DESC);

ALTER TABLE scenario_runs ADD COLUMN compilation_id TEXT REFERENCES strategy_compilations(id);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_compilation
  ON scenario_runs(compilation_id);

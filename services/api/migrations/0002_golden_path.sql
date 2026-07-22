ALTER TABLE scenario_runs ADD COLUMN trigger_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scenarios_trigger_event
  ON scenario_runs(trigger_event_id);

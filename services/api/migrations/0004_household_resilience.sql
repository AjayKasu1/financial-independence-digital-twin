ALTER TABLE scenario_runs ADD COLUMN resilience_json TEXT
  CHECK (resilience_json IS NULL OR json_valid(resilience_json));

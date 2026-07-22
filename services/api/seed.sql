-- The Worker inserts the versioned synthetic Patel household on first request.
-- This marker makes local setup explicit while keeping one canonical TypeScript seed object.
CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO app_metadata (key, value)
VALUES ('demo_seed', 'household-patel-demo@2026-07-22');

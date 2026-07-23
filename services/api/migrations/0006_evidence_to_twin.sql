PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evidence_documents (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('EXTRACTED', 'CONFIRMED', 'REJECTED')),
  effective_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  confirmed_at TEXT,
  reviewer_id TEXT,
  content_hash TEXT NOT NULL,
  source_text TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json))
);

CREATE TABLE IF NOT EXISTS evidence_extractions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES evidence_documents(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  field_path TEXT NOT NULL,
  label TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  value_type TEXT NOT NULL,
  unit TEXT,
  source_excerpt TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'CONFIRMED', 'REJECTED')),
  affects_json TEXT NOT NULL CHECK (json_valid(affects_json))
);

CREATE INDEX IF NOT EXISTS idx_evidence_documents_household_time
  ON evidence_documents(household_id, ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_extractions_document
  ON evidence_extractions(document_id);

export const CREATE_EVALREC_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL,
  viewport_json TEXT NOT NULL,
  normalization_rules_json TEXT NOT NULL
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  sequence INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  graphql_operation TEXT,
  capture_phase TEXT NOT NULL,
  request_headers_json TEXT NOT NULL,
  request_body_hash TEXT,
  status INTEGER NOT NULL,
  response_headers_json TEXT NOT NULL,
  response_body_hash TEXT,
  timing_json TEXT NOT NULL
);

CREATE INDEX requests_fingerprint_idx ON requests(fingerprint);
CREATE INDEX requests_session_sequence_idx ON requests(session_id, sequence);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  sequence INTEGER NOT NULL,
  timestamp_ms REAL NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE storage_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  phase TEXT NOT NULL,
  url TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  cookies_json TEXT NOT NULL,
  local_storage_json TEXT NOT NULL,
  session_storage_json TEXT NOT NULL,
  indexed_db_json TEXT NOT NULL
);
`;

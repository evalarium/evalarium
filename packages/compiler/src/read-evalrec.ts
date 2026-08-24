import path from 'node:path';

import {
  EVALREC_SCHEMA_VERSION,
  EvalrecDataSchema,
  InputEventSchema,
  RecordedRequestSchema,
  SessionSchema,
  StorageSnapshotSchema,
  type EvalrecData,
} from '@evalarium/core';
import Database from 'better-sqlite3';

interface MetadataRow {
  readonly value: string;
}

interface SessionRow {
  readonly id: string;
  readonly target_url: string;
  readonly started_at: number;
  readonly user_agent: string;
  readonly viewport_json: string;
  readonly normalization_rules_json: string;
}

interface RequestRow {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly fingerprint: string;
  readonly method: string;
  readonly url: string;
  readonly normalized_url: string;
  readonly graphql_operation: string | null;
  readonly capture_phase: string;
  readonly request_headers_json: string;
  readonly request_body_hash: string | null;
  readonly status: number;
  readonly response_headers_json: string;
  readonly response_body_hash: string | null;
  readonly timing_json: string;
}

interface EventRow {
  readonly payload_json: string;
}

interface StorageRow {
  readonly id: string;
  readonly session_id: string;
  readonly phase: string;
  readonly url: string;
  readonly captured_at: number;
  readonly cookies_json: string;
  readonly local_storage_json: string;
  readonly session_storage_json: string;
  readonly indexed_db_json: string;
}

const parseJson = (value: string): unknown => JSON.parse(value) as unknown;

export const readEvalrec = (recordingPath: string): EvalrecData => {
  const database = new Database(path.join(recordingPath, 'manifest.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const metadata = database
      .prepare("SELECT value FROM metadata WHERE key = 'schema_version'")
      .get() as MetadataRow | undefined;
    if (metadata?.value !== String(EVALREC_SCHEMA_VERSION)) {
      throw new Error(
        `Unsupported .evalrec schema version: ${metadata?.value ?? 'missing'}.`,
      );
    }
    const sessionRow = database
      .prepare('SELECT * FROM sessions LIMIT 1')
      .get() as SessionRow | undefined;
    if (sessionRow === undefined) {
      throw new Error('The .evalrec contains no session.');
    }
    const session = SessionSchema.parse({
      id: sessionRow.id,
      targetUrl: sessionRow.target_url,
      startedAt: sessionRow.started_at,
      userAgent: sessionRow.user_agent,
      viewport: parseJson(sessionRow.viewport_json),
      normalizationRules: parseJson(sessionRow.normalization_rules_json),
    });
    const requestRows = database
      .prepare('SELECT * FROM requests ORDER BY sequence, id')
      .all() as RequestRow[];
    const requests = requestRows.map((row) =>
      RecordedRequestSchema.parse({
        id: row.id,
        sessionId: row.session_id,
        sequence: row.sequence,
        fingerprint: row.fingerprint,
        method: row.method,
        url: row.url,
        normalizedUrl: row.normalized_url,
        graphqlOperation: row.graphql_operation,
        capturePhase: row.capture_phase,
        requestHeaders: parseJson(row.request_headers_json),
        requestBodyHash: row.request_body_hash,
        status: row.status,
        responseHeaders: parseJson(row.response_headers_json),
        responseBodyHash: row.response_body_hash,
        timing: parseJson(row.timing_json),
      }),
    );
    const eventRows = database
      .prepare('SELECT payload_json FROM events ORDER BY sequence, id')
      .all() as EventRow[];
    const events = eventRows.map((row) =>
      InputEventSchema.parse(parseJson(row.payload_json)),
    );
    const storageRows = database
      .prepare('SELECT * FROM storage_snapshots ORDER BY captured_at, id')
      .all() as StorageRow[];
    const storageSnapshots = storageRows.map((row) =>
      StorageSnapshotSchema.parse({
        id: row.id,
        sessionId: row.session_id,
        phase: row.phase,
        url: row.url,
        capturedAt: row.captured_at,
        cookies: parseJson(row.cookies_json),
        localStorage: parseJson(row.local_storage_json),
        sessionStorage: parseJson(row.session_storage_json),
        indexedDb: parseJson(row.indexed_db_json),
      }),
    );
    return EvalrecDataSchema.parse({
      schemaVersion: EVALREC_SCHEMA_VERSION,
      session,
      requests,
      events,
      storageSnapshots,
    });
  } finally {
    database.close();
  }
};

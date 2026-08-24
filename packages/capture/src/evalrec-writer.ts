import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EVALREC_SCHEMA_VERSION,
  InputEventSchema,
  RecordedRequestSchema,
  SessionSchema,
  StorageSnapshotSchema,
  sha256,
  stableStringify,
  type InputEvent,
  type RecordedRequest,
  type RecordingSink,
  type Session,
  type StorageSnapshot,
} from '@evalarium/core';
import Database from 'better-sqlite3';

import { CREATE_EVALREC_SCHEMA_SQL } from './sqlite-schema.js';

const WRITER_STATE = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

type WriterState = (typeof WRITER_STATE)[keyof typeof WRITER_STATE];

class EvalrecWriter implements RecordingSink {
  readonly #database: Database.Database;
  readonly #blobsDirectory: string;
  #state: WriterState = WRITER_STATE.OPEN;

  constructor(database: Database.Database, blobsDirectory: string) {
    this.#database = database;
    this.#blobsDirectory = blobsDirectory;
  }

  async writeSession(session: Session): Promise<void> {
    this.#assertOpen();
    const value = SessionSchema.parse(session);
    this.#database
      .prepare(
        `INSERT INTO sessions
          (id, target_url, started_at, user_agent, viewport_json, normalization_rules_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.targetUrl,
        value.startedAt,
        value.userAgent,
        stableStringify(value.viewport),
        stableStringify(value.normalizationRules),
      );
  }

  async writeRequest(
    request: RecordedRequest,
    requestBody: Uint8Array,
    responseBody: Uint8Array,
  ): Promise<void> {
    this.#assertOpen();
    const value = RecordedRequestSchema.parse(request);
    await this.#writeExpectedBlob(value.requestBodyHash, requestBody);
    await this.#writeExpectedBlob(value.responseBodyHash, responseBody);
    this.#database
      .prepare(
        `INSERT INTO requests
          (id, session_id, sequence, fingerprint, method, url, normalized_url,
           graphql_operation, capture_phase, request_headers_json,
           request_body_hash, status, response_headers_json,
           response_body_hash, timing_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.sessionId,
        value.sequence,
        value.fingerprint,
        value.method,
        value.url,
        value.normalizedUrl,
        value.graphqlOperation,
        value.capturePhase,
        stableStringify(value.requestHeaders),
        value.requestBodyHash,
        value.status,
        stableStringify(value.responseHeaders),
        value.responseBodyHash,
        stableStringify(value.timing),
      );
  }

  async writeEvent(event: InputEvent): Promise<void> {
    this.#assertOpen();
    const value = InputEventSchema.parse(event);
    this.#database
      .prepare(
        `INSERT INTO events
          (id, session_id, sequence, timestamp_ms, kind, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.sessionId,
        value.sequence,
        value.timestampMs,
        value.kind,
        stableStringify(value),
      );
  }

  async writeStorageSnapshot(snapshot: StorageSnapshot): Promise<void> {
    this.#assertOpen();
    const value = StorageSnapshotSchema.parse(snapshot);
    this.#database
      .prepare(
        `INSERT INTO storage_snapshots
          (id, session_id, phase, url, captured_at, cookies_json,
           local_storage_json, session_storage_json, indexed_db_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.sessionId,
        value.phase,
        value.url,
        value.capturedAt,
        stableStringify(value.cookies),
        stableStringify(value.localStorage),
        stableStringify(value.sessionStorage),
        stableStringify(value.indexedDb),
      );
  }

  async close(): Promise<void> {
    if (this.#state === WRITER_STATE.CLOSED) {
      return;
    }
    this.#state = WRITER_STATE.CLOSED;
    this.#database.pragma('wal_checkpoint(TRUNCATE)');
    this.#database.close();
  }

  #assertOpen(): void {
    if (this.#state !== WRITER_STATE.OPEN) {
      throw new Error('The evalrec writer is closed.');
    }
  }

  async #writeExpectedBlob(
    hash: string | null,
    body: Uint8Array,
  ): Promise<void> {
    if (body.byteLength === 0) {
      if (hash !== null) {
        throw new Error(`Expected an empty body for hash ${hash}.`);
      }
      return;
    }
    const actualHash = sha256(body);
    if (hash !== actualHash) {
      throw new Error(
        `Body hash mismatch: expected ${hash ?? 'null'}, received ${actualHash}.`,
      );
    }
    const destination = path.join(this.#blobsDirectory, actualHash);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, body, { flag: 'wx' });
      await rename(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

export const createEvalrecWriter = async (
  recordingPath: string,
): Promise<RecordingSink> => {
  await mkdir(recordingPath);
  const blobsDirectory = path.join(recordingPath, 'blobs');
  await mkdir(blobsDirectory);
  const database = new Database(path.join(recordingPath, 'manifest.sqlite'));
  database.exec(CREATE_EVALREC_SCHEMA_SQL);
  database
    .prepare('INSERT INTO metadata (key, value) VALUES (?, ?)')
    .run('schema_version', String(EVALREC_SCHEMA_VERSION));
  return new EvalrecWriter(database, blobsDirectory);
};

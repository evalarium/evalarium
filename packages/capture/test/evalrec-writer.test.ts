import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_NORMALIZATION_RULES,
  sha256,
  type RecordedRequest,
  type Session,
} from '@evalarium/core';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createEvalrecWriter } from '../src/index.js';

describe('createEvalrecWriter', () => {
  it('writes relational metadata and deduplicated blobs', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'evalarium-writer-'));
    const recordingPath = path.join(parent, 'demo.evalrec');
    const writer = await createEvalrecWriter(recordingPath);
    const session: Session = {
      id: 'session-1',
      targetUrl: 'https://shop.test/',
      startedAt: 1,
      userAgent: 'test',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      normalizationRules: DEFAULT_NORMALIZATION_RULES,
    };
    await writer.writeSession(session);
    const body = new TextEncoder().encode('same-body');
    const bodyHash = sha256(body);
    const request: RecordedRequest = {
      id: 'request-1',
      sessionId: session.id,
      sequence: 0,
      fingerprint: sha256('fingerprint'),
      method: 'GET',
      url: 'https://shop.test/',
      normalizedUrl: 'https://shop.test/',
      graphqlOperation: null,
      capturePhase: 'replay',
      requestHeaders: {},
      requestBodyHash: bodyHash,
      status: 200,
      responseHeaders: {},
      responseBodyHash: bodyHash,
      timing: { startedAt: 1, headersAt: 2, completedAt: 3 },
    };
    await writer.writeRequest(request, body, body);
    await writer.close();

    const database = new Database(path.join(recordingPath, 'manifest.sqlite'), {
      readonly: true,
    });
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM requests')
      .get() as {
      count: number;
    };
    database.close();
    expect(row.count).toBe(1);
    await expect(
      readFile(path.join(recordingPath, 'blobs', bodyHash)),
    ).resolves.toEqual(Buffer.from(body));
  });
});

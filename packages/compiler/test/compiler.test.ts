import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createEvalrecWriter } from '@evalarium/capture';
import {
  DEFAULT_NORMALIZATION_RULES,
  STORAGE_SNAPSHOT_PHASE,
  type Session,
} from '@evalarium/core';
import { describe, expect, it } from 'vitest';

import { compileRecording, readFrozenBundle } from '../src/index.js';

describe('compileRecording', () => {
  it('emits a validated frozen bundle', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'evalarium-compiler-'));
    const recordingPath = path.join(parent, 'demo.evalrec');
    const bundlePath = path.join(parent, 'demo.evalbundle');
    const writer = await createEvalrecWriter(recordingPath);
    const session: Session = {
      id: 'session-1',
      targetUrl: 'https://shop.test/',
      startedAt: 100,
      userAgent: 'test',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      normalizationRules: DEFAULT_NORMALIZATION_RULES,
    };
    await writer.writeSession(session);
    await writer.writeStorageSnapshot({
      id: 'snapshot-1',
      sessionId: session.id,
      phase: STORAGE_SNAPSHOT_PHASE.INITIAL,
      url: 'https://shop.test/',
      capturedAt: 100,
      cookies: [],
      localStorage: [],
      sessionStorage: [],
      indexedDb: null,
    });
    await writer.close();

    const result = await compileRecording(recordingPath, bundlePath);
    const bundle = await readFrozenBundle(bundlePath);

    expect(bundle.manifest.environmentId).toBe(result.manifest.environmentId);
    expect(bundle.manifest.fixtures[0]?.name).toBe('default');
    await expect(
      readFile(path.join(bundlePath, 'shim.js'), 'utf8'),
    ).resolves.toContain('__evalarium');
  });
});

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NORMALIZATION_RULES,
  EVALREC_SCHEMA_VERSION,
  EvalrecDataSchema,
} from '../src/index.js';

describe('EvalrecDataSchema', () => {
  it('validates a minimal recording', () => {
    const result = EvalrecDataSchema.safeParse({
      schemaVersion: EVALREC_SCHEMA_VERSION,
      session: {
        id: 'session-1',
        targetUrl: 'https://shop.test/',
        startedAt: 1,
        userAgent: 'test',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        normalizationRules: DEFAULT_NORMALIZATION_RULES,
      },
      requests: [],
      events: [],
      storageSnapshots: [],
    });

    expect(result.success).toBe(true);
  });
});

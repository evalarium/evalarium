import { describe, expect, it } from 'vitest';

import { formatCoverage } from '../src/coverage-output.js';

describe('formatCoverage', () => {
  it('prints the on-trail ratio and fallbacks', () => {
    expect(
      formatCoverage({
        totalRequests: 4,
        exactHits: 4,
        fallbacks: 0,
        misses: 0,
        stubs: 0,
        exactRate: 1,
      }),
    ).toBe('Replay coverage 100% on-trail (4/4 exact, 0 fallbacks)');
  });
});

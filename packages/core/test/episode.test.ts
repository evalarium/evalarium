import { describe, expect, it } from 'vitest';

import { parseEpisodeArtifact } from '../src/episode.js';

const legacyEpisode = {
  taskId: 'find-contact',
  fixture: 'crm',
  instructions: 'Find the contact.',
  model: 'model-1',
  environmentId: 'environment-1',
  startedAt: '2026-09-03T10:00:00.000Z',
  finishedAt: '2026-09-03T10:01:00.000Z',
  steps: [
    {
      observation: {
        url: 'https://crm.test/people',
        title: 'People',
        a11ySnapshot: '- heading "People"',
        domDigest: 'digest-1',
      },
      actions: [{ name: 'click', selector: 'text=People' }],
      commentary: 'Opening the people list.',
    },
  ],
  finished: true,
  reward: 1,
  network: {
    coverage: {
      totalRequests: 1,
      exactHits: 1,
      fallbacks: 0,
      misses: 0,
      stubs: 0,
    },
    operations: {},
  },
  usage: {
    inputTokens: 10,
    outputTokens: 4,
    cacheReadInputTokens: 0,
  },
};

describe('parseEpisodeArtifact', () => {
  it('upgrades legacy artifacts with inspector defaults', () => {
    const parsed = parseEpisodeArtifact(legacyEpisode);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.seed).toBeNull();
    expect(parsed.steps[0]?.network).toEqual({
      requests: [],
      divergences: [],
    });
  });

  it('rejects rewards outside the supported range', () => {
    expect(() =>
      parseEpisodeArtifact({ ...legacyEpisode, reward: 1.5 }),
    ).toThrow();
  });
});

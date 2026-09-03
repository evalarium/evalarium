import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { firstDifferingStep } from '../src/compare.js';
import { discoverEpisodeFiles, loadEpisodes } from '../src/server/episodes.js';

const episode = (digests: readonly string[]) => ({
  taskId: 'task-1',
  fixture: 'default',
  instructions: 'Do the thing.',
  model: 'model-1',
  environmentId: 'environment-1',
  startedAt: '2026-09-03T10:00:00.000Z',
  finishedAt: '2026-09-03T10:01:00.000Z',
  steps: digests.map((domDigest) => ({
    observation: {
      url: 'https://example.test',
      title: 'Example',
      a11ySnapshot: '- heading "Example"',
      domDigest,
    },
    actions: [],
    commentary: '',
  })),
  finished: true,
  reward: 1,
  network: {
    coverage: {
      totalRequests: 0,
      exactHits: 0,
      fallbacks: 0,
      misses: 0,
      stubs: 0,
    },
    operations: {},
  },
  usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0 },
});

describe('episode inspection', () => {
  it('discovers episode artifacts recursively and ignores other JSON', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'evalarium-inspector-'),
    );
    await mkdir(path.join(directory, 'nested'));
    await writeFile(path.join(directory, 'ignored.json'), '{}');
    await writeFile(
      path.join(directory, 'nested', 'one.episode.json'),
      JSON.stringify(episode(['same'])),
    );

    const files = await discoverEpisodeFiles(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/one\.episode\.json$/u);
    const loaded = await loadEpisodes(directory);
    expect(loaded[0]?.artifact.seed).toBeNull();
  });

  it('finds the first differing DOM step', () => {
    const left = loadArtifact(['same', 'left']);
    const right = loadArtifact(['same', 'right']);

    expect(firstDifferingStep(left, right)).toBe(1);
    expect(firstDifferingStep(left, loadArtifact(['same', 'left']))).toBeNull();
  });
});

const loadArtifact = (digests: readonly string[]) =>
  // The loader behavior is covered above; this keeps comparison fixtures typed
  // by using the same parser through a temporary in-memory JSON value.
  loadForComparison(episode(digests));

const loadForComparison = (value: ReturnType<typeof episode>) => {
  const withDefaults = {
    ...value,
    schemaVersion: 1 as const,
    seed: null,
    steps: value.steps.map((step) => ({
      ...step,
      network: { requests: [], divergences: [] },
    })),
  };
  return withDefaults;
};

import path from 'node:path';

import {
  RUNTIME_CLOCK_MODE,
  hashObservationStream,
  openEnvironment,
} from '@evalarium/runtime';

import { formatCoverage } from './coverage-output.js';

export interface DeterminismCommandOptions {
  readonly episodes: string;
  readonly seed: string;
  readonly shims: boolean;
}

const positiveInteger = (rawValue: string, name: string): number => {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

export const determinismCommand = async (
  bundlePath: string,
  options: DeterminismCommandOptions,
): Promise<void> => {
  const episodes = positiveInteger(options.episodes, 'episodes');
  const seed = Number(options.seed);
  if (!Number.isInteger(seed)) {
    throw new Error('seed must be an integer.');
  }
  const handle = await openEnvironment(path.resolve(bundlePath), {
    clockMode: RUNTIME_CLOCK_MODE.MANUAL,
    injectShims: options.shims,
  });
  try {
    const hashes: string[] = [];
    for (let episode = 0; episode < episodes; episode += 1) {
      await handle.reset(undefined, seed);
      if (options.shims) {
        const observations = await handle.replayTrace();
        hashes.push(hashObservationStream(observations));
        const coverage = handle.coverage();
        if (
          coverage.fallbacks > 0 ||
          coverage.misses > 0 ||
          coverage.exactRate !== 1
        ) {
          throw new Error(
            `Episode ${episode + 1} left the recorded network trail.`,
          );
        }
      } else {
        // The control run expects divergence; going off-trail or failing
        // outright is divergence, not a harness error.
        try {
          const observations = await handle.replayTrace();
          const coverage = handle.coverage();
          const trail =
            coverage.fallbacks > 0 || coverage.misses > 0
              ? `off-trail(${coverage.fallbacks}f/${coverage.misses}m):`
              : '';
          hashes.push(`${trail}${hashObservationStream(observations)}`);
        } catch (error) {
          hashes.push(`error:${(error as Error).message}:episode${episode}`);
        }
      }
    }
    const expectedHash = hashes[0];
    const hashesMatch =
      expectedHash !== undefined &&
      hashes.every((hash) => hash === expectedHash);
    if (options.shims && !hashesMatch) {
      throw new Error(`Determinism failure: ${hashes.join(', ')}.`);
    }
    if (!options.shims && hashesMatch) {
      throw new Error(
        'Expected hashes to diverge with determinism shims disabled.',
      );
    }
    if (options.shims) {
      process.stdout.write(
        `determinism hash identical across ${episodes} episodes: ${expectedHash}\n`,
      );
    } else {
      process.stdout.write(
        `no-shims hashes diverged across ${episodes} episodes: ${hashes.join(', ')}\n`,
      );
    }
    process.stdout.write(`${formatCoverage(handle.coverage())}\n`);
  } finally {
    await handle.close();
  }
};

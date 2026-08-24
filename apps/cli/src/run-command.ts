import path from 'node:path';

import { RUNTIME_CLOCK_MODE, openEnvironment } from '@evalarium/runtime';

import { formatCoverage } from './coverage-output.js';

export interface RunCommandOptions {
  readonly fixture?: string;
}

export const runCommand = async (
  bundlePath: string,
  options: RunCommandOptions,
): Promise<void> => {
  const handle = await openEnvironment(path.resolve(bundlePath), {
    clockMode: RUNTIME_CLOCK_MODE.MANUAL,
  });
  try {
    if (options.fixture !== undefined) {
      await handle.reset(options.fixture);
    }
    const observations = await handle.replayTrace();
    const finalObservation = observations.at(-1) ?? (await handle.observe());
    process.stdout.write(`${JSON.stringify(finalObservation)}\n`);
    process.stdout.write(`${formatCoverage(handle.coverage())}\n`);
    const divergences = handle.divergences();
    for (const divergence of divergences) {
      process.stdout.write(
        `Divergence: ${divergence.method} ${divergence.url} ` +
          `(op=${divergence.graphqlOperation ?? '-'}) -> nearest ` +
          `${divergence.closestGraphqlOperation ?? divergence.closestNormalizedUrl ?? 'none'} ` +
          `distance=${divergence.closestMatchDistance ?? 'n/a'}\n`,
      );
    }
  } finally {
    await handle.close();
  }
};

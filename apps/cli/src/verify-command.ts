import path from 'node:path';

import { RUNTIME_CLOCK_MODE, openEnvironment } from '@evalarium/runtime';
import { loadTasks, runTask } from '@evalarium/verify';

import { formatCoverage } from './coverage-output.js';

export interface VerifyCommandOptions {
  readonly tasks: string;
}

export const verifyCommand = async (
  bundlePath: string,
  options: VerifyCommandOptions,
): Promise<void> => {
  const tasks = await loadTasks(options.tasks);
  const handle = await openEnvironment(path.resolve(bundlePath), {
    clockMode: RUNTIME_CLOCK_MODE.MANUAL,
  });
  try {
    let passed = 0;
    for (const task of tasks) {
      const result = await runTask(task, handle);
      if (result.passed) {
        passed += 1;
      }
      process.stdout.write(
        `${result.passed ? 'PASS' : 'FAIL'} ${result.id} reward=${result.reward.toFixed(3)}\n`,
      );
    }
    process.stdout.write(`${passed}/${tasks.length} tasks passed\n`);
    process.stdout.write(`${formatCoverage(handle.coverage())}\n`);
    if (passed !== tasks.length) {
      throw new Error(`${tasks.length - passed} verification task(s) failed.`);
    }
  } finally {
    await handle.close();
  }
};

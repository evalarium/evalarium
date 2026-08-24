import { TaskSpecSchema } from '@evalarium/core';
import type { EnvironmentHandle } from '@evalarium/runtime';

import { createVerifyContext } from './assertions.js';
import type { TaskDefinition, TaskResult, VerifyContext } from './types.js';

export interface DefineTaskInput {
  readonly id: string;
  readonly fixture: string;
  readonly instructions: string;
  readonly verify: (context: VerifyContext) => number | Promise<number>;
}

export const defineTask = (input: DefineTaskInput): TaskDefinition => {
  const spec = TaskSpecSchema.parse(input);
  return Object.freeze({
    ...spec,
    kind: 'evalarium-task' as const,
    verify: input.verify,
  });
};

export const isTaskDefinition = (value: unknown): value is TaskDefinition => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.kind === 'evalarium-task' &&
    typeof record.verify === 'function' &&
    TaskSpecSchema.safeParse(record).success
  );
};

export const validateReward = (reward: number): number => {
  if (!Number.isFinite(reward) || reward < 0 || reward > 1) {
    throw new RangeError(
      `Task reward must be between 0 and 1; received ${reward}.`,
    );
  }
  return reward;
};

export const runTask = async (
  task: TaskDefinition,
  handle: EnvironmentHandle,
): Promise<TaskResult> => {
  await handle.reset(task.fixture);
  await handle.replayTrace();
  const reward = validateReward(await task.verify(createVerifyContext(handle)));
  return { id: task.id, reward, passed: reward === 1 };
};

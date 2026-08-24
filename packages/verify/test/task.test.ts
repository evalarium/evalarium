import { describe, expect, it } from 'vitest';

import { defineTask, isTaskDefinition, validateReward } from '../src/index.js';

describe('defineTask', () => {
  it('brands a valid task definition', () => {
    const task = defineTask({
      id: 'price',
      fixture: 'default',
      instructions: 'Find a price.',
      verify: () => 1,
    });

    expect(isTaskDefinition(task)).toBe(true);
  });

  it('rejects rewards outside the contract', () => {
    expect(() => validateReward(1.1)).toThrow(RangeError);
  });
});

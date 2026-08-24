import { describe, expect, it } from 'vitest';

import { VirtualScheduler } from '../src/scheduler.js';
import { CLOCK_MODE } from '../src/types.js';

describe('VirtualScheduler', () => {
  it('runs manual timers in due-time and id order', () => {
    const calls: string[] = [];
    const scheduler = new VirtualScheduler(
      { clockStartMs: 1_000, mode: CLOCK_MODE.MANUAL },
      {
        realNow: () => 0,
        nativeSetTimeout: () => 0,
        nativeClearTimeout: () => undefined,
      },
    );

    scheduler.schedule(() => calls.push('second'), 20, null);
    scheduler.schedule(() => calls.push('first'), 10, null);
    scheduler.advance(20);

    expect(calls).toEqual(['first', 'second']);
    expect(scheduler.now()).toBe(1_020);
  });
});

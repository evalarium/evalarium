import type { InputEvent } from '@evalarium/core';
import type { Page } from 'playwright-core';

import {
  RUNTIME_CLOCK_MODE,
  type Observation,
  type RuntimeClockMode,
} from './types.js';

interface ClockWindow extends Window {
  readonly __evalarium?: {
    readonly clock: {
      advance(milliseconds: number): number;
    };
  };
}

const nodeDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const settleReplay = async (page: Page): Promise<void> => {
  await nodeDelay(100);
  await page.evaluate(() => Promise.resolve());
};

const advanceClock = async (
  page: Page,
  milliseconds: number,
): Promise<void> => {
  await page.evaluate((advanceBy) => {
    const clockWindow = window as ClockWindow;
    clockWindow.__evalarium?.clock.advance(advanceBy);
  }, milliseconds);
};

// Advances virtual time on a FIXED schedule with short real-time gaps so
// network responses can land and timer- or rAF-driven rendering drains.
// The schedule must not adapt to real I/O timing: the page can derive DOM
// content from the virtual clock, so a variable number of steps would
// diverge across episodes.
const pumpClock = async (
  page: Page,
  steps: number,
  stepMs: number,
): Promise<void> => {
  for (let step = 0; step < steps; step += 1) {
    await nodeDelay(60);
    await advanceClock(page, stepMs);
  }
};

// Real-time-only settle: waits for in-flight images without touching the
// virtual clock, then flushes any post-load render with a fixed advance.
const settleObservation = async (page: Page): Promise<void> => {
  await page
    .waitForFunction(
      () => [...document.images].every((image) => image.complete),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await pumpClock(page, 2, 100);
};

const applyEvent = async (page: Page, event: InputEvent): Promise<void> => {
  if (event.kind === 'navigate') {
    if (page.url() === event.url) {
      // The preceding replayed input already routed the SPA here; a full
      // document load would leave the recorded network trail.
      return;
    }
    await page.goto(event.url, { waitUntil: 'load' });
    return;
  }
  const locator = page.locator(event.selector).first();
  if (event.kind === 'type') {
    await locator.fill(event.value);
    return;
  }
  await locator.click({ button: event.button });
};

// The boot settle that precedes the first observation of an episode; also
// used by the environment's warm-up boot so a discarded first load renders
// exactly as far as a measured one.
export const settleBoot = async (
  page: Page,
  clockMode: RuntimeClockMode,
): Promise<void> => {
  if (clockMode === RUNTIME_CLOCK_MODE.MANUAL) {
    await pumpClock(page, 30, 100);
    await settleObservation(page);
  }
};

export interface PlayTraceOptions {
  readonly clockMode: RuntimeClockMode;
  readonly events: readonly InputEvent[];
  readonly page: Page;
  readonly observe: () => Promise<Observation>;
}

export const playTrace = async (
  options: PlayTraceOptions,
): Promise<readonly Observation[]> => {
  await settleBoot(options.page, options.clockMode);
  const observations = [await options.observe()];
  let previousTimestampMs = 0;
  for (const event of options.events) {
    if (options.clockMode === RUNTIME_CLOCK_MODE.MANUAL) {
      const delta = Math.max(0, event.timestampMs - previousTimestampMs);
      await advanceClock(options.page, delta);
    }
    await applyEvent(options.page, event);
    await settleReplay(options.page);
    if (options.clockMode === RUNTIME_CLOCK_MODE.MANUAL) {
      await pumpClock(options.page, 10, 100);
      await settleObservation(options.page);
    }
    observations.push(await options.observe());
    previousTimestampMs = event.timestampMs;
  }
  return observations;
};

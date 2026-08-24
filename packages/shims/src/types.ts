import type { SeedDefaults } from '@evalarium/core';

export const CLOCK_MODE = {
  AUTO: 'auto',
  MANUAL: 'manual',
} as const;

export type ClockMode = (typeof CLOCK_MODE)[keyof typeof CLOCK_MODE];

export interface EvalariumShimConfig extends SeedDefaults {
  readonly clockMode: ClockMode;
}

export interface EvalariumClockControl {
  readonly mode: ClockMode;
  now(): number;
  advance(milliseconds: number): number;
}

export interface EvalariumControlSurface {
  readonly version: 1;
  readonly seed: number;
  readonly clock: Readonly<EvalariumClockControl>;
}

declare global {
  interface Window {
    __evalarium?: Readonly<EvalariumControlSurface>;
    __evalariumConfig?: Partial<EvalariumShimConfig>;
  }
}

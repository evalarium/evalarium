import type {
  BundleManifest,
  DivergenceEvent,
  ReplayCoverage,
  ReplayRequestLogEntry,
} from '@evalarium/core';
import type { Page } from 'playwright-core';

export const RUNTIME_CLOCK_MODE = {
  AUTO: 'auto',
  MANUAL: 'manual',
} as const;

export type RuntimeClockMode =
  (typeof RUNTIME_CLOCK_MODE)[keyof typeof RUNTIME_CLOCK_MODE];

export interface Observation {
  readonly url: string;
  readonly title: string;
  readonly a11ySnapshot: string;
  readonly domDigest: string;
}

export interface OpenEnvironmentOptions {
  readonly clockMode?: RuntimeClockMode;
  readonly executablePath?: string;
  readonly headless?: boolean;
  readonly injectShims?: boolean;
  readonly remoteDebuggingPort?: number;
}

export interface EnvironmentHandle {
  readonly page: Page;
  readonly manifest: BundleManifest;
  reset(fixtureName?: string, seed?: number): Promise<void>;
  observe(): Promise<Observation>;
  replayTrace(): Promise<readonly Observation[]>;
  coverage(): ReplayCoverage;
  requestLog(): readonly ReplayRequestLogEntry[];
  divergences(): readonly DivergenceEvent[];
  close(): Promise<void>;
}

import type {
  BundleManifest,
  DivergenceEvent,
  ReplayCoverage,
  ReplayRequestLogEntry,
} from '@evalarium/core';
import type { EnvironmentHandle, Observation } from '@evalarium/runtime';

import type { CdpRelay } from './cdp-relay.js';

export class SessionInputError extends Error {}

export interface EnvironmentSessionOptions {
  readonly id: string;
  readonly environment: EnvironmentHandle;
  readonly relay: CdpRelay;
  readonly cdpPort: number;
  readonly fixture: string;
  readonly seed: number;
}

export interface SessionDescription {
  readonly id: string;
  readonly fixture: string;
  readonly seed: number;
  readonly cdpPort: number;
  readonly createdAt: string;
}

export class EnvironmentSession {
  readonly #environment: EnvironmentHandle;
  readonly #relay: CdpRelay;
  readonly #createdAt = new Date().toISOString();
  readonly id: string;
  readonly cdpPort: number;
  #fixture: string;
  #seed: number;
  #operations: Promise<void> = Promise.resolve();
  #closePromise: Promise<void> | null = null;

  constructor(options: EnvironmentSessionOptions) {
    this.id = options.id;
    this.cdpPort = options.cdpPort;
    this.#environment = options.environment;
    this.#relay = options.relay;
    this.#fixture = options.fixture;
    this.#seed = options.seed;
  }

  get manifest(): BundleManifest {
    return this.#environment.manifest;
  }

  describe(): SessionDescription {
    return {
      id: this.id,
      fixture: this.#fixture,
      seed: this.#seed,
      cdpPort: this.cdpPort,
      createdAt: this.#createdAt,
    };
  }

  observe(): Promise<Observation> {
    return this.#enqueue(() => this.#environment.observe());
  }

  coverage(): Promise<ReplayCoverage> {
    return this.#enqueue(async () => this.#environment.coverage());
  }

  divergences(): Promise<readonly DivergenceEvent[]> {
    return this.#enqueue(async () => this.#environment.divergences());
  }

  requestLog(): Promise<readonly ReplayRequestLogEntry[]> {
    return this.#enqueue(async () => this.#environment.requestLog());
  }

  reset(fixture?: string, seed?: number): Promise<Observation> {
    return this.#enqueue(async () => {
      const nextFixture =
        fixture ?? this.#environment.manifest.fixtures[0]?.name ?? 'default';
      const nextSeed = seed ?? this.#environment.manifest.seedDefaults.seed;
      if (
        !this.#environment.manifest.fixtures.some(
          (candidate) => candidate.name === nextFixture,
        )
      ) {
        throw new SessionInputError(`Unknown fixture: ${nextFixture}.`);
      }
      await this.#environment.reset(nextFixture, nextSeed);
      this.#fixture = nextFixture;
      this.#seed = nextSeed;
      return this.#environment.observe();
    });
  }

  close(): Promise<void> {
    if (this.#closePromise === null) {
      this.#closePromise = (async () => {
        await this.#operations;
        await Promise.allSettled([
          this.#relay.close(),
          this.#environment.close(),
        ]);
      })();
    }
    return this.#closePromise;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closePromise !== null) {
      return Promise.reject(new Error(`Session ${this.id} is closing.`));
    }
    const result = this.#operations.then(operation, operation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

import type {
  BundleManifest,
  DivergenceEvent,
  ReplayCoverage,
  ReplayRequestLogEntry,
} from '@evalarium/core';
import type { EnvironmentHandle, Observation } from '@evalarium/runtime';

import type { CdpRelay } from './cdp-relay.js';

export class SessionInputError extends Error {}
export class SessionClosingError extends Error {}

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
  readonly lastActivityAt: string;
}

export class EnvironmentSession {
  readonly #environment: EnvironmentHandle;
  readonly #relay: CdpRelay;
  readonly #createdAt = new Date().toISOString();
  readonly id: string;
  readonly cdpPort: number;
  #fixture: string;
  #seed: number;
  #lastActivityAt = Date.now();
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
      lastActivityAt: new Date(this.#lastActivityAt).toISOString(),
    };
  }

  /**
   * A session is idle when no control call has touched it for the timeout
   * and no CDP client is connected. An agent driving the browser over CDP
   * without calling the control API therefore never counts as idle; a
   * crashed client's dropped socket starts the clock.
   */
  isIdle(now: number, idleTimeoutMs: number): boolean {
    return (
      this.#relay.activeConnections() === 0 &&
      now - this.#lastActivityAt >= idleTimeoutMs
    );
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
      return Promise.reject(
        new SessionClosingError(`Session ${this.id} is closing.`),
      );
    }
    this.#lastActivityAt = Date.now();
    const result = this.#operations.then(operation, operation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

import { randomUUID } from 'node:crypto';

import {
  RUNTIME_CLOCK_MODE,
  openEnvironment,
  type EnvironmentHandle,
  type OpenEnvironmentOptions,
} from '@evalarium/runtime';

import { startCdpRelay, type StartCdpRelay } from './cdp-relay.js';
import {
  EnvironmentSession,
  SessionInputError,
} from './environment-session.js';

export class SessionCapacityError extends Error {}
export class SessionNotFoundError extends Error {}

export type OpenSessionEnvironment = (
  bundlePath: string,
  options: OpenEnvironmentOptions,
) => Promise<EnvironmentHandle>;

export interface SessionPoolOptions {
  readonly bundlePath: string;
  readonly host: string;
  readonly headless: boolean;
  readonly maxSessions: number;
  readonly sessionCdpStart: number;
  readonly open?: OpenSessionEnvironment;
  readonly startRelay?: StartCdpRelay;
}

export interface CreateSessionOptions {
  readonly fixture?: string;
  readonly seed?: number;
}

export const validateSessionPortRange = (
  start: number,
  maxSessions: number,
  occupiedPorts: readonly number[] = [],
): void => {
  const end = start + maxSessions * 2 - 1;
  if (end > 65_535) {
    throw new Error(
      `session CDP range ${start}-${end} exceeds the TCP port limit.`,
    );
  }
  for (const occupied of occupiedPorts) {
    if (occupied >= start && occupied <= end) {
      throw new Error(
        `session CDP range ${start}-${end} overlaps port ${occupied}.`,
      );
    }
  }
};

export class SessionPool {
  readonly #options: SessionPoolOptions;
  readonly #sessions = new Map<string, EnvironmentSession>();
  readonly #reservedSlots = new Set<number>();
  #closing = false;

  constructor(options: SessionPoolOptions) {
    validateSessionPortRange(options.sessionCdpStart, options.maxSessions);
    this.#options = options;
  }

  list(): readonly EnvironmentSession[] {
    return [...this.#sessions.values()];
  }

  get(id: string): EnvironmentSession {
    const session = this.#sessions.get(id);
    if (session === undefined) {
      throw new SessionNotFoundError(`Unknown session: ${id}.`);
    }
    return session;
  }

  async create(
    options: CreateSessionOptions = {},
  ): Promise<EnvironmentSession> {
    if (this.#closing) {
      throw new SessionCapacityError('The session pool is closing.');
    }
    const slot = this.#reserveSlot();
    const cdpPort = this.#options.sessionCdpStart + slot * 2;
    const internalCdpPort = cdpPort + 1;
    let environment: EnvironmentHandle | null = null;
    try {
      environment = await (this.#options.open ?? openEnvironment)(
        this.#options.bundlePath,
        {
          clockMode: RUNTIME_CLOCK_MODE.AUTO,
          headless: this.#options.headless,
          remoteDebuggingPort: internalCdpPort,
        },
      );
      const fixture =
        options.fixture ?? environment.manifest.fixtures[0]?.name ?? 'default';
      const seed = options.seed ?? environment.manifest.seedDefaults.seed;
      if (
        !environment.manifest.fixtures.some(
          (candidate) => candidate.name === fixture,
        )
      ) {
        throw new SessionInputError(`Unknown fixture: ${fixture}.`);
      }
      await environment.reset(fixture, seed);
      const relay = await (this.#options.startRelay ?? startCdpRelay)(
        cdpPort,
        internalCdpPort,
        this.#options.host,
      );
      const session = new EnvironmentSession({
        id: randomUUID(),
        environment,
        relay,
        cdpPort,
        fixture,
        seed,
      });
      this.#sessions.set(session.id, session);
      return session;
    } catch (error) {
      await environment?.close().catch(() => undefined);
      this.#reservedSlots.delete(slot);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const session = this.get(id);
    this.#sessions.delete(id);
    const slot = (session.cdpPort - this.#options.sessionCdpStart) / 2;
    try {
      await session.close();
    } finally {
      this.#reservedSlots.delete(slot);
    }
  }

  async close(): Promise<void> {
    this.#closing = true;
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.close()));
    this.#reservedSlots.clear();
  }

  #reserveSlot(): number {
    for (let slot = 0; slot < this.#options.maxSessions; slot += 1) {
      if (!this.#reservedSlots.has(slot)) {
        this.#reservedSlots.add(slot);
        return slot;
      }
    }
    throw new SessionCapacityError(
      `Session capacity exhausted (maximum ${this.#options.maxSessions}).`,
    );
  }
}

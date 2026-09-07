import { randomUUID } from 'node:crypto';

import {
  RUNTIME_CLOCK_MODE,
  openEnvironment,
  type EnvironmentHandle,
  type OpenEnvironmentOptions,
} from '@evalarium/runtime';

import {
  startCdpRelay,
  type CdpRelay,
  type StartCdpRelay,
} from './cdp-relay.js';
import {
  EnvironmentSession,
  SessionInputError,
} from './environment-session.js';

export class SessionCapacityError extends Error {}
export class SessionNotFoundError extends Error {}

const PORT_OCCUPIED_CODE = 'EADDRINUSE';

const isPortOccupiedError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === PORT_OCCUPIED_CODE;

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
  /** Close sessions idle for this long; `0` or omitted disables reaping. */
  readonly idleTimeoutMs?: number;
  readonly open?: OpenSessionEnvironment;
  readonly startRelay?: StartCdpRelay;
}

const MIN_SWEEP_INTERVAL_MS = 1_000;
const MAX_SWEEP_INTERVAL_MS = 30_000;

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
  // Slots whose relay port was found occupied by another process. They stay
  // blocked for the life of the pool instead of being retried on every create.
  readonly #blockedSlots = new Set<number>();
  readonly #pendingCreates = new Set<Promise<unknown>>();
  readonly #sweepTimer: NodeJS.Timeout | null = null;
  #closing = false;

  constructor(options: SessionPoolOptions) {
    validateSessionPortRange(options.sessionCdpStart, options.maxSessions);
    this.#options = options;
    const idleTimeoutMs = options.idleTimeoutMs ?? 0;
    if (idleTimeoutMs > 0) {
      const interval = Math.min(
        MAX_SWEEP_INTERVAL_MS,
        Math.max(MIN_SWEEP_INTERVAL_MS, idleTimeoutMs / 4),
      );
      this.#sweepTimer = setInterval(() => {
        void this.sweepIdleSessions();
      }, interval);
      // The sweep must never keep an otherwise finished process alive.
      this.#sweepTimer.unref();
    }
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
    // A slot whose port turns out to be occupied is blocked and the next
    // free slot is tried, so one foreign listener costs one slot, not the
    // whole pool.
    for (;;) {
      this.#assertOpen();
      const slot = this.#reserveSlot();
      const creating = this.#createInSlot(slot, options);
      this.#pendingCreates.add(creating);
      try {
        return await creating;
      } catch (error) {
        if (!isPortOccupiedError(error)) {
          throw error;
        }
        this.#blockedSlots.add(slot);
      } finally {
        this.#pendingCreates.delete(creating);
      }
    }
  }

  blockedPorts(): readonly number[] {
    return [...this.#blockedSlots]
      .sort((left, right) => left - right)
      .map((slot) => this.#options.sessionCdpStart + slot * 2);
  }

  async #createInSlot(
    slot: number,
    options: CreateSessionOptions,
  ): Promise<EnvironmentSession> {
    const cdpPort = this.#options.sessionCdpStart + slot * 2;
    const internalCdpPort = cdpPort + 1;
    let environment: EnvironmentHandle | null = null;
    let relay: CdpRelay | null = null;
    try {
      environment = await (this.#options.open ?? openEnvironment)(
        this.#options.bundlePath,
        {
          clockMode: RUNTIME_CLOCK_MODE.AUTO,
          headless: this.#options.headless,
          remoteDebuggingPort: internalCdpPort,
        },
      );
      // The pool may have started closing while the browser booted. Every
      // await below is followed by the same check so a late session is
      // never added after close() snapshotted the map.
      this.#assertOpen();
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
      this.#assertOpen();
      relay = await (this.#options.startRelay ?? startCdpRelay)(
        cdpPort,
        internalCdpPort,
        this.#options.host,
      );
      this.#assertOpen();
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
      await Promise.allSettled([relay?.close(), environment?.close()]);
      this.#reservedSlots.delete(slot);
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closing) {
      throw new SessionCapacityError('The session pool is closing.');
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

  /**
   * Deletes every session that is idle at `now`. Returns the ids closed.
   * Runs on the sweep timer; exposed so tests can drive the clock.
   */
  async sweepIdleSessions(now = Date.now()): Promise<readonly string[]> {
    const idleTimeoutMs = this.#options.idleTimeoutMs ?? 0;
    if (idleTimeoutMs <= 0 || this.#closing) {
      return [];
    }
    const closed: string[] = [];
    for (const session of this.#sessions.values()) {
      if (!session.isIdle(now, idleTimeoutMs)) {
        continue;
      }
      try {
        await this.delete(session.id);
        closed.push(session.id);
      } catch {
        // Deleted concurrently by a client; nothing left to reap.
      }
    }
    return closed;
  }

  async close(): Promise<void> {
    this.#closing = true;
    if (this.#sweepTimer !== null) {
      clearInterval(this.#sweepTimer);
    }
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.close()));
    // In-flight creates reject once their next check runs and close what
    // they opened; waiting for them keeps the process exit clean.
    await Promise.allSettled([...this.#pendingCreates]);
    this.#reservedSlots.clear();
  }

  #reserveSlot(): number {
    for (let slot = 0; slot < this.#options.maxSessions; slot += 1) {
      if (!this.#reservedSlots.has(slot) && !this.#blockedSlots.has(slot)) {
        this.#reservedSlots.add(slot);
        return slot;
      }
    }
    const blocked = this.blockedPorts();
    const blockedNote =
      blocked.length === 0
        ? ''
        : ` CDP port${blocked.length === 1 ? '' : 's'} ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} occupied by another process.`;
    throw new SessionCapacityError(
      `Session capacity exhausted (maximum ${this.#options.maxSessions}).${blockedNote}`,
    );
  }
}

import { createSeededGenerator } from './prng.js';
import { VirtualScheduler } from './scheduler.js';
import {
  CLOCK_MODE,
  type ClockMode,
  type EvalariumControlSurface,
  type EvalariumShimConfig,
} from './types.js';

const SHIM_VERSION = 1 as const;

const isClockMode = (value: unknown): value is ClockMode =>
  value === CLOCK_MODE.AUTO || value === CLOCK_MODE.MANUAL;

const readConfig = (): EvalariumShimConfig => {
  const supplied = window.__evalariumConfig;
  const mode = isClockMode(supplied?.clockMode)
    ? supplied.clockMode
    : CLOCK_MODE.AUTO;
  return {
    seed: Number.isInteger(supplied?.seed) ? (supplied?.seed ?? 42) : 42,
    clockStartMs: Number.isFinite(supplied?.clockStartMs)
      ? (supplied?.clockStartMs ?? Date.now())
      : Date.now(),
    clockMode: mode,
  };
};

const installVirtualDate = (scheduler: VirtualScheduler): void => {
  const RealDate = window.Date;
  const VirtualDate = function (this: Date, ...args: unknown[]): string | Date {
    if (new.target === undefined) {
      return new RealDate(scheduler.now()).toString();
    }
    const date =
      args.length === 0
        ? new RealDate(scheduler.now())
        : (Reflect.construct(RealDate, args) as Date);
    Object.setPrototypeOf(date, VirtualDate.prototype);
    return date;
  } as unknown as DateConstructor;

  Object.defineProperty(VirtualDate, 'prototype', {
    value: RealDate.prototype,
  });
  Object.setPrototypeOf(VirtualDate, RealDate);
  VirtualDate.now = (): number => scheduler.now();
  window.Date = VirtualDate;
};

const installTimers = (scheduler: VirtualScheduler): void => {
  const toCallback = (
    handler: TimerHandler,
    args: readonly unknown[],
  ): (() => void) => {
    if (typeof handler !== 'function') {
      throw new TypeError(
        'evalarium virtual timers require function callbacks.',
      );
    }
    return (): void => handler(...args);
  };

  window.setTimeout = ((
    handler: TimerHandler,
    timeout = 0,
    ...args: unknown[]
  ): number =>
    scheduler.schedule(
      toCallback(handler, args),
      timeout,
      null,
    )) as Window['setTimeout'];
  window.setInterval = ((
    handler: TimerHandler,
    timeout = 0,
    ...args: unknown[]
  ): number => {
    const intervalMs = Math.max(1, timeout);
    return scheduler.schedule(
      toCallback(handler, args),
      intervalMs,
      intervalMs,
    );
  }) as Window['setInterval'];
  window.clearTimeout = ((timerId: number): void =>
    scheduler.clear(timerId)) as Window['clearTimeout'];
  window.clearInterval = ((timerId: number): void =>
    scheduler.clear(timerId)) as Window['clearInterval'];
  window.requestAnimationFrame = ((callback: FrameRequestCallback): number =>
    scheduler.animationFrame(callback)) as Window['requestAnimationFrame'];
  window.cancelAnimationFrame = ((timerId: number): void =>
    scheduler.clear(timerId)) as Window['cancelAnimationFrame'];
};

const installRandomness = (seed: number): void => {
  // One seeded stream per call site: consumers with timing-dependent call
  // counts (socket-retry jitter, animation shuffles) must not shift the
  // values that order-stable consumers (record-id generation) receive.
  const streams = new Map<string, ReturnType<typeof createSeededGenerator>>();
  const hashKey = (value: string): number => {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
    }
    return (hash ^ (seed >>> 0)) >>> 0;
  };
  const streamForCallsite = (): ReturnType<typeof createSeededGenerator> => {
    const stack = new Error().stack ?? 'unknown';
    const key = stack.split('\n').slice(2, 6).join('|');
    let generator = streams.get(key);
    if (generator === undefined) {
      generator = createSeededGenerator(hashKey(key));
      streams.set(key, generator);
    }
    return generator;
  };
  Math.random = (): number => streamForCallsite().next();
  const deterministicGetRandomValues = (<T extends ArrayBufferView | null>(
    target: T,
  ): T => {
    if (target === null) {
      throw new TypeError('Expected an integer typed array.');
    }
    const bytes = new Uint8Array(
      target.buffer,
      target.byteOffset,
      target.byteLength,
    );
    streamForCallsite().fill(bytes);
    return target;
  }) as Crypto['getRandomValues'];
  Object.defineProperty(window.crypto, 'getRandomValues', {
    configurable: true,
    value: deterministicGetRandomValues,
  });
  const deterministicRandomUuid = (): string => {
    const bytes = new Uint8Array(16);
    streamForCallsite().fill(bytes);
    const six = bytes[6] ?? 0;
    const eight = bytes[8] ?? 0;
    bytes[6] = (six & 0x0f) | 0x40;
    bytes[8] = (eight & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };
  Object.defineProperty(window.crypto, 'randomUUID', {
    configurable: true,
    value: deterministicRandomUuid,
  });
};

const install = (): void => {
  if (window.__evalarium !== undefined) {
    return;
  }

  const config = readConfig();
  const realPerformanceNow = window.performance.now.bind(window.performance);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const scheduler = new VirtualScheduler(
    { clockStartMs: config.clockStartMs, mode: config.clockMode },
    {
      realNow: realPerformanceNow,
      nativeSetTimeout,
      nativeClearTimeout,
    },
  );

  installVirtualDate(scheduler);
  Object.defineProperty(window.performance, 'now', {
    configurable: true,
    value: (): number => scheduler.elapsed(),
  });
  installTimers(scheduler);
  installRandomness(config.seed);

  const clock = Object.freeze({
    mode: config.clockMode,
    now: (): number => scheduler.now(),
    advance: (milliseconds: number): number => scheduler.advance(milliseconds),
  });
  const control: Readonly<EvalariumControlSurface> = Object.freeze({
    version: SHIM_VERSION,
    seed: config.seed,
    clock,
  });
  Object.defineProperty(window, '__evalarium', {
    configurable: false,
    enumerable: false,
    value: control,
    writable: false,
  });
};

install();

import { CLOCK_MODE, type ClockMode } from './types.js';

const FRAME_DURATION_MS = 1000 / 60;
const MAX_CALLBACKS_PER_DRAIN = 10_000;

interface ScheduledTask {
  readonly id: number;
  dueMs: number;
  readonly intervalMs: number | null;
  readonly callback: () => void;
}

export interface SchedulerHost {
  readonly realNow: () => number;
  readonly nativeSetTimeout: (callback: () => void, delayMs: number) => number;
  readonly nativeClearTimeout: (timerId: number) => void;
}

export interface VirtualSchedulerOptions {
  readonly clockStartMs: number;
  readonly mode: ClockMode;
}

export class VirtualScheduler {
  readonly #clockStartMs: number;
  readonly #host: SchedulerHost;
  readonly #mode: ClockMode;
  readonly #realAnchorMs: number;
  readonly #tasks = new Map<number, ScheduledTask>();
  #elapsedOffsetMs = 0;
  #manualElapsedMs = 0;
  #nextTaskId = 1;
  #pumpTimerId: number | null = null;

  constructor(options: VirtualSchedulerOptions, host: SchedulerHost) {
    this.#clockStartMs = options.clockStartMs;
    this.#mode = options.mode;
    this.#host = host;
    this.#realAnchorMs = host.realNow();
  }

  mode(): ClockMode {
    return this.#mode;
  }

  now(): number {
    return this.#clockStartMs + this.elapsed();
  }

  elapsed(): number {
    if (this.#mode === CLOCK_MODE.MANUAL) {
      return this.#manualElapsedMs;
    }
    return this.#elapsedOffsetMs + this.#host.realNow() - this.#realAnchorMs;
  }

  schedule(
    callback: () => void,
    delayMs: number,
    intervalMs: number | null,
  ): number {
    const id = this.#nextTaskId;
    this.#nextTaskId += 1;
    this.#tasks.set(id, {
      id,
      dueMs: this.elapsed() + Math.max(0, delayMs),
      intervalMs,
      callback,
    });
    this.#schedulePump();
    return id;
  }

  animationFrame(callback: FrameRequestCallback): number {
    const elapsed = this.elapsed();
    const dueMs =
      (Math.floor(elapsed / FRAME_DURATION_MS) + 1) * FRAME_DURATION_MS;
    return this.schedule(() => callback(this.elapsed()), dueMs - elapsed, null);
  }

  clear(id: number): void {
    this.#tasks.delete(id);
    this.#schedulePump();
  }

  advance(milliseconds: number): number {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError(
        'Clock advancement must be a finite, non-negative number.',
      );
    }
    if (this.#mode === CLOCK_MODE.MANUAL) {
      this.#manualElapsedMs += milliseconds;
    } else {
      this.#elapsedOffsetMs += milliseconds;
    }
    this.#drain();
    return this.now();
  }

  #nextTask(): ScheduledTask | undefined {
    return [...this.#tasks.values()].sort(
      (left, right) => left.dueMs - right.dueMs || left.id - right.id,
    )[0];
  }

  #drain(): void {
    let callbackCount = 0;
    while (callbackCount < MAX_CALLBACKS_PER_DRAIN) {
      const task = this.#nextTask();
      if (task === undefined || task.dueMs > this.elapsed()) {
        break;
      }
      callbackCount += 1;
      if (task.intervalMs === null) {
        this.#tasks.delete(task.id);
      } else {
        task.dueMs += task.intervalMs;
      }
      task.callback();
    }
    if (callbackCount === MAX_CALLBACKS_PER_DRAIN) {
      throw new Error('Virtual timer callback limit exceeded.');
    }
    this.#schedulePump();
  }

  #schedulePump(): void {
    if (this.#pumpTimerId !== null) {
      this.#host.nativeClearTimeout(this.#pumpTimerId);
      this.#pumpTimerId = null;
    }
    if (this.#mode !== CLOCK_MODE.AUTO) {
      return;
    }
    const nextTask = this.#nextTask();
    if (nextTask === undefined) {
      return;
    }
    const delayMs = Math.max(0, nextTask.dueMs - this.elapsed());
    this.#pumpTimerId = this.#host.nativeSetTimeout(() => {
      this.#pumpTimerId = null;
      this.#drain();
    }, delayMs);
  }
}

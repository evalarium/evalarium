import path from 'node:path';

import { resolveChromiumExecutable } from '@evalarium/capture';
import { readFrozenBundle, type FrozenBundle } from '@evalarium/compiler';
import type {
  BundleManifest,
  DivergenceEvent,
  ReplayCoverage,
  ReplayRequestLogEntry,
  StorageSnapshot,
} from '@evalarium/core';
import { startReplayProxy, type ReplayProxyHandle } from '@evalarium/proxy';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core';

import { observePage } from './observation.js';
import {
  sessionStorageBootstrap,
  toPlaywrightStorageState,
} from './storage.js';
import { playTrace, settleBoot } from './trace-player.js';
import {
  RUNTIME_CLOCK_MODE,
  type EnvironmentHandle,
  type Observation,
  type OpenEnvironmentOptions,
  type RuntimeClockMode,
} from './types.js';

const HANDLE_STATE = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

type HandleState = (typeof HANDLE_STATE)[keyof typeof HANDLE_STATE];

class RuntimeEnvironmentHandle implements EnvironmentHandle {
  readonly #browser: Browser;
  readonly #bundle: FrozenBundle;
  readonly #clockMode: RuntimeClockMode;
  readonly #injectShims: boolean;
  readonly #proxy: ReplayProxyHandle;
  #context: BrowserContext | null = null;
  #page: Page | null = null;
  #state: HandleState = HANDLE_STATE.OPEN;

  constructor(
    bundle: FrozenBundle,
    proxy: ReplayProxyHandle,
    browser: Browser,
    clockMode: RuntimeClockMode,
    injectShims: boolean,
  ) {
    this.#bundle = bundle;
    this.#proxy = proxy;
    this.#browser = browser;
    this.#clockMode = clockMode;
    this.#injectShims = injectShims;
  }

  get page(): Page {
    this.#assertOpen();
    if (this.#page === null) {
      throw new Error('The environment has not been reset.');
    }
    return this.#page;
  }

  get manifest(): BundleManifest {
    return this.#bundle.manifest;
  }

  async reset(
    fixtureName = this.#bundle.manifest.fixtures[0]?.name ?? 'default',
    seed = this.#bundle.manifest.seedDefaults.seed,
  ): Promise<void> {
    this.#assertOpen();
    await this.#context?.close();
    this.#context = null;
    this.#page = null;
    this.#proxy.reset();

    const fixture = this.#bundle.manifest.fixtures.find(
      (candidate) => candidate.name === fixtureName,
    );
    if (fixture === undefined) {
      throw new Error(`Unknown fixture: ${fixtureName}.`);
    }
    const snapshot = this.#bundle.config.storageSnapshots.find(
      (candidate) => candidate.id === fixture.storageSnapshotId,
    );
    if (snapshot === undefined) {
      throw new Error(
        `Fixture snapshot is missing: ${fixture.storageSnapshotId}.`,
      );
    }
    await this.#createContext(snapshot, seed);
  }

  // One discarded boot of the default fixture. A cold browser process
  // renders the first episode on different timing than every later one
  // (JIT, decode, and font caches), which is visible in the first
  // observation stream; warming pins all measured episodes to the same
  // state. The context is discarded so the handle stays pristine.
  async warmUp(): Promise<void> {
    await this.reset();
    await settleBoot(this.page, this.#clockMode);
    await this.#context?.close();
    this.#context = null;
    this.#page = null;
    this.#proxy.reset();
  }

  async observe(): Promise<Observation> {
    return observePage(this.page);
  }

  async replayTrace(): Promise<readonly Observation[]> {
    return playTrace({
      clockMode: this.#clockMode,
      events: this.#bundle.config.events,
      page: this.page,
      observe: async () => this.observe(),
    });
  }

  coverage(): ReplayCoverage {
    return this.#proxy.coverage();
  }

  requestLog(): readonly ReplayRequestLogEntry[] {
    return this.#proxy.requestLog();
  }

  divergences(): readonly DivergenceEvent[] {
    return this.#proxy.divergences();
  }

  async close(): Promise<void> {
    if (this.#state === HANDLE_STATE.CLOSED) {
      return;
    }
    this.#state = HANDLE_STATE.CLOSED;
    await this.#context?.close();
    await this.#browser.close();
    await this.#proxy.close();
  }

  async #createContext(snapshot: StorageSnapshot, seed: number): Promise<void> {
    const context = await this.#browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: {
        width: this.#bundle.config.session.viewport.width,
        height: this.#bundle.config.session.viewport.height,
      },
      deviceScaleFactor: this.#bundle.config.session.viewport.deviceScaleFactor,
      userAgent: this.#bundle.config.session.userAgent,
      storageState: toPlaywrightStorageState(snapshot),
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const shimConfig = JSON.stringify({
      seed,
      clockStartMs: this.#bundle.manifest.seedDefaults.clockStartMs,
      clockMode: this.#clockMode,
    });
    const shimBootstrap = this.#injectShims
      ? `window.__evalariumConfig = ${shimConfig};\n${this.#bundle.shimSource}\n`
      : '';
    const source = `${shimBootstrap}${sessionStorageBootstrap(snapshot)}`;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
    await page.goto(snapshot.url, {
      waitUntil: 'networkidle',
    });
    this.#context = context;
    this.#page = page;
  }

  #assertOpen(): void {
    if (this.#state !== HANDLE_STATE.OPEN) {
      throw new Error('The environment handle is closed.');
    }
  }
}

export const openEnvironment = async (
  bundlePath: string,
  options: OpenEnvironmentOptions = {},
): Promise<EnvironmentHandle> => {
  const bundle = await readFrozenBundle(bundlePath);
  const proxy = await startReplayProxy({
    requests: bundle.config.requests,
    blobsDirectory: path.join(bundlePath, 'blobs'),
    normalizationRules: bundle.manifest.normalizationRules,
  });
  const executablePath = await resolveChromiumExecutable(
    options.executablePath,
  );
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless ?? true,
    proxy: { server: proxy.proxyUrl },
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
      '--metrics-recording-only',
      '--no-first-run',
      '--proxy-bypass-list=<-loopback>',
      ...(process.env.EVALARIUM_CHROMIUM_NO_SANDBOX === '1'
        ? ['--no-sandbox', '--disable-dev-shm-usage']
        : []),
      ...(options.remoteDebuggingPort === undefined
        ? []
        : [
            `--remote-debugging-port=${options.remoteDebuggingPort}`,
            '--remote-debugging-address=0.0.0.0',
          ]),
    ],
  });
  const handle = new RuntimeEnvironmentHandle(
    bundle,
    proxy,
    browser,
    options.clockMode ?? RUNTIME_CLOCK_MODE.AUTO,
    options.injectShims ?? true,
  );
  try {
    await handle.warmUp();
    await handle.reset();
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
};

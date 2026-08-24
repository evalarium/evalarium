import { randomUUID } from 'node:crypto';

import {
  DEFAULT_NORMALIZATION_RULES,
  STORAGE_SNAPSHOT_PHASE,
  type NormalizationRules,
  type RecordingSink,
  type Session,
  type Viewport,
} from '@evalarium/core';
import { chromium, type Page } from 'playwright-core';

import { resolveChromiumExecutable } from './chromium.js';
import { installInputRecorder } from './input-recorder.js';
import { captureStorageSnapshot } from './storage-snapshot.js';

const DEFAULT_VIEWPORT: Viewport = {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
};

export type CaptureScriptPhase = (page: Page) => Promise<void>;

export interface CaptureScript {
  readonly prepare?: CaptureScriptPhase;
  readonly run: CaptureScriptPhase;
}

export interface CaptureSessionOptions {
  readonly targetUrl: string;
  readonly proxyUrl: string;
  readonly sink: RecordingSink;
  readonly script: CaptureScript;
  readonly sessionId?: string;
  readonly executablePath?: string;
  readonly viewport?: Viewport;
  readonly normalizationRules?: NormalizationRules;
  readonly onSessionReady?: () => void | Promise<void>;
  readonly onReplayPhase?: () => void | Promise<void>;
}

export interface CaptureSessionResult {
  readonly session: Session;
  readonly eventCount: number;
}

export const captureSession = async (
  options: CaptureSessionOptions,
): Promise<CaptureSessionResult> => {
  const sessionId = options.sessionId ?? randomUUID();
  const startedAt = Date.now();
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const executablePath = await resolveChromiumExecutable(
    options.executablePath,
  );
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    proxy: { server: options.proxyUrl },
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--proxy-bypass-list=<-loopback>',
    ],
  });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    const page = await context.newPage();
    // Record full response bodies: a fresh replay context cannot use
    // recorded 304s, so conditional revalidation must never happen.
    const cacheControl = await context.newCDPSession(page);
    await cacheControl.send('Network.enable');
    await cacheControl.send('Network.setCacheDisabled', {
      cacheDisabled: true,
    });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const session: Session = {
      id: sessionId,
      targetUrl: new URL(options.targetUrl).toString(),
      startedAt,
      userAgent,
      viewport,
      normalizationRules:
        options.normalizationRules ?? DEFAULT_NORMALIZATION_RULES,
    };
    await options.sink.writeSession(session);
    await options.onSessionReady?.();
    const inputRecorder = await installInputRecorder(
      page,
      sessionId,
      startedAt,
    );

    await page.goto(session.targetUrl, { waitUntil: 'networkidle' });
    await options.script.prepare?.(page);
    // Reload so the document request and boot traffic for the snapshot URL
    // are recorded exactly as replay will issue them on reset. Everything
    // from here on is replay content; prepare traffic is context only.
    await options.onReplayPhase?.();
    await page.goto(page.url(), { waitUntil: 'load' });
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      // Apps with reconnecting sockets or long-polling never reach idle.
    }
    await options.sink.writeStorageSnapshot(
      await captureStorageSnapshot(
        context,
        page,
        sessionId,
        STORAGE_SNAPSHOT_PHASE.INITIAL,
      ),
    );
    inputRecorder.beginTrace();
    await options.script.run(page);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      // Apps with reconnecting sockets or long-polling never reach idle.
    }
    await options.sink.writeStorageSnapshot(
      await captureStorageSnapshot(
        context,
        page,
        sessionId,
        STORAGE_SNAPSHOT_PHASE.FINAL,
      ),
    );
    const events = inputRecorder.events();
    for (const event of events) {
      await options.sink.writeEvent(event);
    }
    await context.close();
    return { session, eventCount: events.length };
  } finally {
    await browser.close();
  }
};

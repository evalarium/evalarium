import { randomUUID } from 'node:crypto';

import {
  type StorageSnapshot,
  type StorageSnapshotPhase,
} from '@evalarium/core';
import type { BrowserContext, Page } from 'playwright-core';

export const captureStorageSnapshot = async (
  context: BrowserContext,
  page: Page,
  sessionId: string,
  phase: StorageSnapshotPhase,
): Promise<StorageSnapshot> => {
  const storageState = await context.storageState({ indexedDB: false });
  const sessionEntries = await page.evaluate(() =>
    Object.entries(window.sessionStorage).map(([name, value]) => ({
      name,
      value,
    })),
  );
  const pageUrl = new URL(page.url());
  return {
    id: randomUUID(),
    sessionId,
    phase,
    url: page.url(),
    capturedAt: Date.now(),
    cookies: storageState.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
    localStorage: storageState.origins.map((origin) => ({
      origin: origin.origin,
      entries: origin.localStorage,
    })),
    sessionStorage: [{ origin: pageUrl.origin, entries: sessionEntries }],
    indexedDb: null,
  };
};

import type { StorageSnapshot } from '@evalarium/core';
import type { BrowserContextOptions } from 'playwright-core';

export const toPlaywrightStorageState = (
  snapshot: StorageSnapshot,
): NonNullable<BrowserContextOptions['storageState']> => ({
  cookies: snapshot.cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  })),
  origins: snapshot.localStorage.map((origin) => ({
    origin: origin.origin,
    localStorage: origin.entries,
  })),
});

export const sessionStorageBootstrap = (snapshot: StorageSnapshot): string => {
  const serialized = JSON.stringify(snapshot.sessionStorage);
  return `(() => {
    const snapshots = ${serialized};
    const matching = snapshots.find((snapshot) => snapshot.origin === window.location.origin);
    if (!matching) return;
    for (const entry of matching.entries) window.sessionStorage.setItem(entry.name, entry.value);
  })();`;
};

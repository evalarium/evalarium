import type { Cookie, ReplayRequestLogEntry } from '@evalarium/core';
import type { EnvironmentHandle } from '@evalarium/runtime';

import type {
  DomAssertions,
  NetworkAssertions,
  NetworkRequestMatcher,
  StorageReads,
  VerifyContext,
} from './types.js';

const matchesRequest = (
  request: ReplayRequestLogEntry,
  matcher: NetworkRequestMatcher,
): boolean => {
  if (
    matcher.method !== undefined &&
    request.method !== matcher.method.toUpperCase()
  ) {
    return false;
  }
  if (
    matcher.matchKind !== undefined &&
    request.matchKind !== matcher.matchKind
  ) {
    return false;
  }
  if (
    matcher.graphqlOperation !== undefined &&
    request.graphqlOperation !== matcher.graphqlOperation
  ) {
    return false;
  }
  if (
    matcher.variables !== undefined &&
    !(request.graphqlVariables ?? []).some((variables) =>
      matcher.variables?.(variables),
    )
  ) {
    return false;
  }
  if (matcher.url === undefined) {
    return true;
  }
  if (typeof matcher.url === 'string') {
    return request.url === matcher.url || request.url.endsWith(matcher.url);
  }
  return matcher.url.test(request.url);
};

const createDomAssertions = (handle: EnvironmentHandle): DomAssertions => ({
  async text(selector: string): Promise<string> {
    return (await handle.page.locator(selector).first().textContent()) ?? '';
  },
  async isVisible(selector: string): Promise<boolean> {
    return handle.page.locator(selector).first().isVisible();
  },
  async hasText(selector: string, expected: string): Promise<boolean> {
    const text =
      (await handle.page.locator(selector).first().textContent()) ?? '';
    return text.includes(expected);
  },
});

const createNetworkAssertions = (
  handle: EnvironmentHandle,
): NetworkAssertions => ({
  requests: () => handle.requestLog(),
  count: (matcher) =>
    handle.requestLog().filter((request) => matchesRequest(request, matcher))
      .length,
  has: (matcher) =>
    handle.requestLog().some((request) => matchesRequest(request, matcher)),
});

const createStorageReads = (handle: EnvironmentHandle): StorageReads => ({
  localStorage: async (name) =>
    handle.page.evaluate((key) => window.localStorage.getItem(key), name),
  sessionStorage: async (name) =>
    handle.page.evaluate((key) => window.sessionStorage.getItem(key), name),
  cookies: async (): Promise<readonly Cookie[]> =>
    (await handle.page.context().cookies()).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
});

export const createVerifyContext = (
  handle: EnvironmentHandle,
): VerifyContext => ({
  page: handle.page,
  dom: createDomAssertions(handle),
  network: createNetworkAssertions(handle),
  storage: createStorageReads(handle),
});

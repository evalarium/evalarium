import {
  DEFAULT_NORMALIZATION_RULES,
  REPLAY_MATCH_KIND,
  fingerprintRequest,
  graphqlOperationNames,
  type RecordedRequest,
} from '@evalarium/core';
import { describe, expect, it } from 'vitest';

import { ReplayIndex } from '../src/index.js';

const makeRequest = (
  id: string,
  sequence: number,
  method: string,
  url: string,
  options: {
    readonly rules?: typeof DEFAULT_NORMALIZATION_RULES;
    readonly body?: string;
    readonly headers?: Record<string, string>;
    readonly phase?: 'prepare' | 'replay';
  } = {},
): RecordedRequest => {
  const rules = options.rules ?? DEFAULT_NORMALIZATION_RULES;
  const headers = options.headers ?? {};
  const body =
    options.body === undefined
      ? new Uint8Array()
      : new TextEncoder().encode(options.body);
  const normalized = fingerprintRequest({ method, url, headers, body }, rules);
  return {
    id,
    sessionId: 'session-1',
    sequence,
    fingerprint: normalized.fingerprint,
    method: normalized.normalized.method,
    url,
    normalizedUrl: normalized.normalized.url,
    graphqlOperation: graphqlOperationNames(
      { method, url, headers, body },
      rules,
    ),
    capturePhase: options.phase ?? 'replay',
    requestHeaders: {},
    requestBodyHash: null,
    status: 200,
    responseHeaders: {},
    responseBodyHash: null,
    timing: { startedAt: 0, headersAt: 0, completedAt: 0 },
  };
};

describe('ReplayIndex', () => {
  it('returns exact fingerprint matches', () => {
    const request = makeRequest(
      'products',
      0,
      'GET',
      'https://shop.test/api/products',
    );
    const index = new ReplayIndex([request], DEFAULT_NORMALIZATION_RULES);

    const result = index.resolve({
      method: 'GET',
      url: 'https://shop.test/api/products',
      headers: {},
    });

    expect(result.matchKind).toBe(REPLAY_MATCH_KIND.EXACT);
    expect(result.request?.id).toBe('products');
  });

  it('chooses a deterministic nearest URL fallback', () => {
    const products = makeRequest(
      'products',
      0,
      'GET',
      'https://shop.test/api/products',
    );
    const index = new ReplayIndex([products], DEFAULT_NORMALIZATION_RULES);

    const result = index.resolve({
      method: 'GET',
      url: 'https://shop.test/api/productz',
      headers: {},
    });

    expect(result.matchKind).toBe(REPLAY_MATCH_KIND.FALLBACK);
    expect(result.request?.id).toBe('products');
    expect(result.distance).toBe(1);
  });

  it('falls back to the recorded operation with the nearest name', () => {
    const rules = {
      ...DEFAULT_NORMALIZATION_RULES,
      graphql: { endpointSuffixes: ['/graphql'], ignoredVariablePaths: [] },
    };
    const graphqlBody = (name: string, variables: object) =>
      JSON.stringify({
        operationName: name,
        query: `query ${name} { field }`,
        variables,
      });
    const headers = { 'content-type': 'application/json' };
    const findCompanies = makeRequest(
      'find-companies',
      0,
      'POST',
      'https://crm.test/graphql',
      { rules, headers, body: graphqlBody('FindCompanies', { limit: 30 }) },
    );
    const findPeople = makeRequest(
      'find-people',
      1,
      'POST',
      'https://crm.test/graphql',
      { rules, headers, body: graphqlBody('FindPeople', { limit: 30 }) },
    );
    const index = new ReplayIndex([findCompanies, findPeople], rules);

    const result = index.resolve({
      method: 'POST',
      url: 'https://crm.test/graphql',
      headers,
      body: new TextEncoder().encode(
        graphqlBody('FindCompanies', { limit: 60 }),
      ),
    });

    expect(result.matchKind).toBe(REPLAY_MATCH_KIND.FALLBACK);
    expect(result.request?.id).toBe('find-companies');
    expect(result.graphqlOperation).toBe('FindCompanies');
  });

  it('starts fingerprint cursors past prepare-phase instances', () => {
    const preLogin = makeRequest(
      'me-401',
      0,
      'GET',
      'https://app.test/admin/users/me',
      { phase: 'prepare' },
    );
    const postLogin = makeRequest(
      'me-200',
      5,
      'GET',
      'https://app.test/admin/users/me',
      { phase: 'replay' },
    );
    const index = new ReplayIndex(
      [preLogin, postLogin],
      DEFAULT_NORMALIZATION_RULES,
    );

    const result = index.resolve({
      method: 'GET',
      url: 'https://app.test/admin/users/me',
      headers: {},
    });

    expect(result.matchKind).toBe(REPLAY_MATCH_KIND.EXACT);
    expect(result.request?.id).toBe('me-200');
  });
});

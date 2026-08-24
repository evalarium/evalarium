import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NORMALIZATION_RULES,
  fingerprintRequest,
  graphqlOperationNames,
  stableStringify,
  type NormalizationRules,
} from '../src/index.js';

const GRAPHQL_RULES: NormalizationRules = {
  ...DEFAULT_NORMALIZATION_RULES,
  graphql: {
    endpointSuffixes: ['/graphql'],
    ignoredVariablePaths: ['input.id', 'data.createdAt'],
  },
};

const graphqlRequest = (body: unknown) => ({
  method: 'POST',
  url: 'https://crm.test/graphql',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('stableStringify', () => {
  it('sorts object keys recursively', () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
  });
});

describe('fingerprintRequest', () => {
  it('normalizes JSON and volatile query parameters', () => {
    const first = fingerprintRequest(
      {
        method: 'post',
        url: 'https://shop.test/api/cart?ts=123&b=2&a=1',
        headers: { 'content-type': 'application/json' },
        body: '{"quantity":1,"productId":"mug-1"}',
      },
      DEFAULT_NORMALIZATION_RULES,
    );
    const second = fingerprintRequest(
      {
        method: 'POST',
        url: 'https://shop.test/api/cart?a=1&b=2&ts=999',
        headers: { 'Content-Type': 'application/json' },
        body: '{"productId":"mug-1","quantity":1}',
      },
      DEFAULT_NORMALIZATION_RULES,
    );

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.normalized.url).toBe('https://shop.test/api/cart?a=1&b=2');
  });
});

describe('graphql fingerprinting', () => {
  it('keys on operation name plus variables hash, not query text', () => {
    const first = fingerprintRequest(
      graphqlRequest({
        operationName: 'FindCompanies',
        query:
          'query FindCompanies($limit: Int) { companies(limit: $limit) { id } }',
        variables: { limit: 30 },
      }),
      GRAPHQL_RULES,
    );
    const reformatted = fingerprintRequest(
      graphqlRequest({
        operationName: 'FindCompanies',
        query:
          'query FindCompanies($limit: Int) {\n  companies(limit: $limit) {\n    id\n  }\n}',
        variables: { limit: 30 },
      }),
      GRAPHQL_RULES,
    );
    const differentVariables = fingerprintRequest(
      graphqlRequest({
        operationName: 'FindCompanies',
        query:
          'query FindCompanies($limit: Int) { companies(limit: $limit) { id } }',
        variables: { limit: 60 },
      }),
      GRAPHQL_RULES,
    );

    expect(first.normalized.body).toMatch(/^graphql:FindCompanies\./u);
    expect(first.fingerprint).toBe(reformatted.fingerprint);
    expect(first.fingerprint).not.toBe(differentVariables.fingerprint);
  });

  it('ignores volatile variable paths, including inside arrays', () => {
    const create = (id: string) =>
      fingerprintRequest(
        graphqlRequest({
          operationName: 'CreateCompanies',
          query:
            'mutation CreateCompanies($data: [CompanyInput!]!) { createCompanies(data: $data) { id } }',
          variables: { data: [{ createdAt: id, name: 'Acme' }] },
        }),
        GRAPHQL_RULES,
      );
    expect(create('2026-01-01').fingerprint).toBe(
      create('2026-02-02').fingerprint,
    );
  });

  it('derives the operation name from the query when absent', () => {
    const request = graphqlRequest({
      query: 'mutation SignIn($email: String!) { signIn(email: $email) }',
      variables: { email: 'user@crm.test' },
    });
    expect(graphqlOperationNames(request, GRAPHQL_RULES)).toBe('SignIn');
    expect(graphqlOperationNames(request, DEFAULT_NORMALIZATION_RULES)).toBe(
      null,
    );
  });

  it('joins batched operations in order', () => {
    const request = graphqlRequest([
      { query: 'query A { a }', variables: {} },
      { query: 'query B { b }', variables: {} },
    ]);
    expect(graphqlOperationNames(request, GRAPHQL_RULES)).toBe('A|B');
  });
});

import { z } from 'zod';

import { sha256 } from './hash.js';
import { stableStringify } from './stable-json.js';

export const GraphqlNormalizationRulesSchema = z.object({
  endpointSuffixes: z.array(z.string().min(1)).min(1),
  ignoredVariablePaths: z.array(z.string()),
});

export const NormalizationRulesSchema = z.object({
  stripQueryParams: z.array(z.string()),
  ignoreHeaders: z.array(z.string()),
  jsonIgnoredPaths: z.array(z.string()),
  graphql: GraphqlNormalizationRulesSchema.nullable().default(null),
});

export type GraphqlNormalizationRules = z.infer<
  typeof GraphqlNormalizationRulesSchema
>;
export type NormalizationRules = z.infer<typeof NormalizationRulesSchema>;

export const DEFAULT_NORMALIZATION_RULES: NormalizationRules = Object.freeze({
  stripQueryParams: ['_', 'cacheBust', 'cache_bust', 'timestamp', 'ts'],
  ignoreHeaders: [
    'accept-encoding',
    'connection',
    'content-length',
    'date',
    'proxy-connection',
    'user-agent',
  ],
  jsonIgnoredPaths: [],
  graphql: null,
});

export interface RawRequestForFingerprint {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly body?: string | Uint8Array;
}

export interface NormalizedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly body: string;
}

export interface RequestNormalizer {
  normalize(
    request: RawRequestForFingerprint,
    rules: NormalizationRules,
  ): NormalizedRequest;
}

const headerValue = (
  headers: RawRequestForFingerprint['headers'],
  headerName: string,
): string => {
  const matchingName = Object.keys(headers).find(
    (name) => name.toLowerCase() === headerName,
  );
  if (matchingName === undefined) {
    return '';
  }
  const value = headers[matchingName];
  if (typeof value === 'string') {
    return value;
  }
  return value?.join(',') ?? '';
};

const removeJsonSegments = (
  value: unknown,
  segments: readonly string[],
): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const element of value) {
      removeJsonSegments(element, segments);
    }
    return;
  }
  const current = value as Record<string, unknown>;
  const [head, ...rest] = segments;
  if (head === undefined) {
    return;
  }
  if (rest.length === 0) {
    delete current[head];
    return;
  }
  removeJsonSegments(current[head], rest);
};

const removeJsonPath = (value: unknown, path: string): void => {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return;
  }
  removeJsonSegments(value, segments);
};

const normalizeUrl = (rawUrl: string, rules: NormalizationRules): string => {
  const url = new URL(rawUrl);
  for (const parameter of rules.stripQueryParams) {
    url.searchParams.delete(parameter);
  }
  const entries = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison === 0
        ? leftValue.localeCompare(rightValue)
        : keyComparison;
    },
  );
  url.search = '';
  for (const [key, value] of entries) {
    url.searchParams.append(key, value);
  }
  url.hash = '';
  return url.toString();
};

const normalizeHeaders = (
  headers: RawRequestForFingerprint['headers'],
  rules: NormalizationRules,
): Readonly<Record<string, string | readonly string[]>> => {
  const ignored = new Set(
    rules.ignoreHeaders.map((header) => header.toLowerCase()),
  );
  const normalized: Record<string, string | readonly string[]> = {};
  for (const name of Object.keys(headers).sort()) {
    const normalizedName = name.toLowerCase();
    if (!ignored.has(normalizedName)) {
      const value = headers[name];
      if (value !== undefined) {
        normalized[normalizedName] = value;
      }
    }
  }
  return normalized;
};

const bodyBytes = (body: string | Uint8Array | undefined): Uint8Array => {
  if (body === undefined) {
    return new Uint8Array();
  }
  return typeof body === 'string' ? new TextEncoder().encode(body) : body;
};

const OPERATION_NAME_PATTERN =
  /(?:^|[\s,{}])(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/u;

const OPERATION_TYPE_PATTERN =
  /(?:^|[\s,{}])(query|mutation|subscription)[\s{]/u;

export type GraphqlOperationType = 'query' | 'mutation' | 'subscription';

interface GraphqlOperationKey {
  readonly name: string;
  readonly type: GraphqlOperationType;
  readonly variablesHash: string;
}

const graphqlOperationKey = (
  operation: unknown,
  rules: GraphqlNormalizationRules,
): GraphqlOperationKey | null => {
  if (operation === null || typeof operation !== 'object') {
    return null;
  }
  const record = operation as Record<string, unknown>;
  const query = typeof record.query === 'string' ? record.query : null;
  if (query === null) {
    return null;
  }
  const explicitName =
    typeof record.operationName === 'string' && record.operationName.length > 0
      ? record.operationName
      : null;
  const name =
    explicitName ?? OPERATION_NAME_PATTERN.exec(query)?.[1] ?? 'anonymous';
  const type = (OPERATION_TYPE_PATTERN.exec(query)?.[1] ??
    'query') as GraphqlOperationType;
  const variables =
    record.variables !== null &&
    typeof record.variables === 'object' &&
    !Array.isArray(record.variables)
      ? (structuredClone(record.variables) as Record<string, unknown>)
      : {};
  for (const path of rules.ignoredVariablePaths) {
    removeJsonPath(variables, path);
  }
  return { name, type, variablesHash: sha256(stableStringify(variables)) };
};

const isGraphqlEndpoint = (
  rawUrl: string,
  rules: GraphqlNormalizationRules,
): boolean => {
  try {
    const pathname = new URL(rawUrl).pathname;
    return rules.endpointSuffixes.some((suffix) => pathname.endsWith(suffix));
  } catch {
    return false;
  }
};

const graphqlOperationKeys = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): readonly GraphqlOperationKey[] | null => {
  if (
    rules.graphql === null ||
    !isGraphqlEndpoint(request.url, rules.graphql)
  ) {
    return null;
  }
  const bytes = bodyBytes(request.body);
  if (bytes.byteLength === 0) {
    return null;
  }
  const contentType = headerValue(
    request.headers,
    'content-type',
  ).toLowerCase();
  if (!contentType.includes('application/json')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const operations = Array.isArray(parsed) ? parsed : [parsed];
  if (operations.length === 0) {
    return null;
  }
  const keys: GraphqlOperationKey[] = [];
  for (const operation of operations) {
    const key = graphqlOperationKey(operation, rules.graphql);
    if (key === null) {
      return null;
    }
    keys.push(key);
  }
  return keys;
};

export const graphqlOperationNames = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): string | null => {
  const keys = graphqlOperationKeys(request, rules);
  return keys === null ? null : keys.map((key) => key.name).join('|');
};

const collectJsonPathValues = (
  value: unknown,
  segments: readonly string[],
  sink: string[],
): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const element of value) {
      collectJsonPathValues(element, segments, sink);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  const [head, ...rest] = segments;
  if (head === undefined) {
    return;
  }
  if (rest.length === 0) {
    const found = record[head];
    if (typeof found === 'string') {
      sink.push(found);
    }
    return;
  }
  collectJsonPathValues(record[head], rest, sink);
};

// Returns the string values sitting at the ignored variable paths of each
// GraphQL operation in the request, in stable order. Replay uses these to
// pair client-generated record ids with their recorded counterparts.
export const graphqlIgnoredVariableValues = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): readonly string[] | null => {
  if (
    rules.graphql === null ||
    !isGraphqlEndpoint(request.url, rules.graphql)
  ) {
    return null;
  }
  const bytes = bodyBytes(request.body);
  if (bytes.byteLength === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const operations = Array.isArray(parsed) ? parsed : [parsed];
  const values: string[] = [];
  for (const operation of operations) {
    if (operation === null || typeof operation !== 'object') {
      continue;
    }
    const variables = (operation as Record<string, unknown>).variables;
    for (const path of rules.graphql.ignoredVariablePaths) {
      const segments = path.split('.').filter((part) => part.length > 0);
      collectJsonPathValues(variables, segments, values);
    }
  }
  return values;
};

// Parsed variables of each GraphQL operation in the request, in order.
export const graphqlVariablesOf = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): readonly unknown[] | null => {
  if (
    rules.graphql === null ||
    !isGraphqlEndpoint(request.url, rules.graphql)
  ) {
    return null;
  }
  const bytes = bodyBytes(request.body);
  if (bytes.byteLength === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const operations = Array.isArray(parsed) ? parsed : [parsed];
  return operations.map((operation) =>
    operation !== null && typeof operation === 'object'
      ? ((operation as Record<string, unknown>).variables ?? null)
      : null,
  );
};

export const isGraphqlSubscriptionRequest = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): boolean => {
  const keys = graphqlOperationKeys(request, rules);
  return keys !== null && keys.every((key) => key.type === 'subscription');
};

const normalizeBody = (
  request: RawRequestForFingerprint,
  rules: NormalizationRules,
): string => {
  const bytes = bodyBytes(request.body);
  if (bytes.byteLength === 0) {
    return '';
  }
  const graphqlKeys = graphqlOperationKeys(request, rules);
  if (graphqlKeys !== null) {
    return `graphql:${graphqlKeys
      .map((key) => `${key.name}.${key.variablesHash.slice(0, 16)}`)
      .join('|')}`;
  }
  const contentType = headerValue(
    request.headers,
    'content-type',
  ).toLowerCase();
  const text = new TextDecoder().decode(bytes);
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(text);
      for (const path of rules.jsonIgnoredPaths) {
        removeJsonPath(parsed, path);
      }
      return `json:${stableStringify(parsed)}`;
    } catch {
      return `text:${text}`;
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const entries = [...new URLSearchParams(text).entries()].sort(
      ([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyComparison = leftKey.localeCompare(rightKey);
        return keyComparison === 0
          ? leftValue.localeCompare(rightValue)
          : keyComparison;
      },
    );
    return `form:${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
  }
  if (contentType.startsWith('text/')) {
    return `text:${text}`;
  }
  return `base64:${Buffer.from(bytes).toString('base64')}`;
};

export const defaultRequestNormalizer: RequestNormalizer = Object.freeze({
  normalize(
    request: RawRequestForFingerprint,
    rules: NormalizationRules,
  ): NormalizedRequest {
    return {
      method: request.method.toUpperCase(),
      url: normalizeUrl(request.url, rules),
      headers: normalizeHeaders(request.headers, rules),
      body: normalizeBody(request, rules),
    };
  },
});

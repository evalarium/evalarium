import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  REPLAY_MATCH_KIND,
  graphqlVariablesOf,
  isGraphqlSubscriptionRequest,
  type DivergenceEvent,
  type ReplayCoverage,
  type ReplayRequestLogEntry,
} from '@evalarium/core';

import { replayHeaders, toHeaderMap } from './headers.js';
import { createMockServer } from './mock-server.js';
import { ReplayIndex } from './replay-index.js';
import type {
  ReplayProxyHandle,
  ReplayProxyOptions,
  UnsupportedProtocolEvent,
} from './types.js';

const NOT_RECORDED_STATUS = 502;

export const startReplayProxy = async (
  options: ReplayProxyOptions,
): Promise<ReplayProxyHandle> => {
  const server = await createMockServer();
  const bodies = new Map<string, Buffer>();
  const requestBodies = new Map<string, Buffer>();
  for (const request of options.requests) {
    if (
      request.responseBodyHash !== null &&
      !bodies.has(request.responseBodyHash)
    ) {
      const body = await readFile(
        path.join(options.blobsDirectory, request.responseBodyHash),
      );
      bodies.set(request.responseBodyHash, body);
    }
    if (
      request.graphqlOperation !== null &&
      request.requestBodyHash !== null &&
      !requestBodies.has(request.requestBodyHash)
    ) {
      const body = await readFile(
        path.join(options.blobsDirectory, request.requestBodyHash),
      );
      requestBodies.set(request.requestBodyHash, body);
    }
  }
  const index = new ReplayIndex(
    options.requests,
    options.normalizationRules,
    (bodyHash) => requestBodies.get(bodyHash),
  );

  const requestLog: ReplayRequestLogEntry[] = [];
  const divergences: DivergenceEvent[] = [];
  const unsupported: UnsupportedProtocolEvent[] = [];
  let exactHits = 0;
  let fallbacks = 0;
  let misses = 0;
  let stubs = 0;

  await server.on('websocket-request', (request) => {
    unsupported.push({ protocol: 'websocket', url: request.url });
  });
  await server
    .forAnyWebSocket()
    .thenRejectConnection(501, 'WebSocket replay is not implemented', {
      'x-evalarium-unsupported': 'websocket',
    });
  await server
    .forAnyRequest()
    .waitForRequestBody()
    .thenCallback((request) => {
      const rawRequest = {
        method: request.method,
        url: request.url,
        headers: toHeaderMap(request.headers),
        body: request.body.buffer,
      };
      const resolution = index.resolve(rawRequest);
      const recordedRequest = resolution.request;
      const graphqlVariables =
        resolution.graphqlOperation === null
          ? null
          : [
              ...(graphqlVariablesOf(rawRequest, options.normalizationRules) ??
                []),
            ];
      let status = NOT_RECORDED_STATUS;
      if (
        resolution.matchKind !== REPLAY_MATCH_KIND.EXACT &&
        isGraphqlSubscriptionRequest(rawRequest, options.normalizationRules)
      ) {
        // Subscriptions are out of replay scope by design: answer them
        // deterministically instead of counting them as off-trail.
        stubs += 1;
        requestLog.push({
          sequence: requestLog.length,
          method: resolution.normalized.method,
          url: request.url,
          normalizedUrl: resolution.normalized.url,
          graphqlOperation: resolution.graphqlOperation,
          graphqlVariables,
          fingerprint: resolution.fingerprint,
          matchKind: REPLAY_MATCH_KIND.STUB,
          recordedRequestId: null,
          status: 200,
        });
        return {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-evalarium-synthetic': 'subscription-stub',
          },
          body: JSON.stringify({ data: null }),
        };
      }
      if (
        resolution.matchKind === REPLAY_MATCH_KIND.FALLBACK &&
        resolution.graphqlOperation !== null
      ) {
        // A same-endpoint GraphQL fallback would answer with a different
        // record's data — identity corruption that reads as an app bug.
        // Serve an honest deterministic miss instead.
        misses += 1;
        divergences.push({
          fingerprint: resolution.fingerprint,
          method: resolution.normalized.method,
          url: request.url,
          normalizedUrl: resolution.normalized.url,
          graphqlOperation: resolution.graphqlOperation,
          closestRequestId: recordedRequest?.id ?? null,
          closestNormalizedUrl: recordedRequest?.normalizedUrl ?? null,
          closestGraphqlOperation: recordedRequest?.graphqlOperation ?? null,
          closestMatchDistance: resolution.distance,
        });
        requestLog.push({
          sequence: requestLog.length,
          method: resolution.normalized.method,
          url: request.url,
          normalizedUrl: resolution.normalized.url,
          graphqlOperation: resolution.graphqlOperation,
          graphqlVariables,
          fingerprint: resolution.fingerprint,
          matchKind: REPLAY_MATCH_KIND.MISS,
          recordedRequestId: null,
          status: 200,
        });
        return {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-evalarium-synthetic': 'graphql-unrecorded',
          },
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message:
                  'Evalarium: this query is not part of the frozen universe.',
                extensions: { code: 'EVALARIUM_UNRECORDED' },
              },
            ],
          }),
        };
      }
      if (resolution.matchKind === REPLAY_MATCH_KIND.EXACT) {
        exactHits += 1;
      } else {
        divergences.push({
          fingerprint: resolution.fingerprint,
          method: resolution.normalized.method,
          url: request.url,
          normalizedUrl: resolution.normalized.url,
          graphqlOperation: resolution.graphqlOperation,
          closestRequestId: recordedRequest?.id ?? null,
          closestNormalizedUrl: recordedRequest?.normalizedUrl ?? null,
          closestGraphqlOperation: recordedRequest?.graphqlOperation ?? null,
          closestMatchDistance: resolution.distance,
        });
        if (resolution.matchKind === REPLAY_MATCH_KIND.FALLBACK) {
          fallbacks += 1;
        } else {
          misses += 1;
        }
      }

      if (recordedRequest !== null) {
        status = recordedRequest.status;
      }
      requestLog.push({
        sequence: requestLog.length,
        method: resolution.normalized.method,
        url: request.url,
        normalizedUrl: resolution.normalized.url,
        graphqlOperation: resolution.graphqlOperation,
        graphqlVariables,
        fingerprint: resolution.fingerprint,
        matchKind: resolution.matchKind,
        recordedRequestId: recordedRequest?.id ?? null,
        status,
      });

      if (recordedRequest === null) {
        return {
          statusCode: NOT_RECORDED_STATUS,
          headers: {
            'content-type': 'application/json',
            'x-evalarium-synthetic': 'miss',
          },
          body: JSON.stringify({ error: 'No recorded response is available.' }),
        };
      }
      const body =
        recordedRequest.responseBodyHash === null
          ? Buffer.alloc(0)
          : (bodies.get(recordedRequest.responseBodyHash) ?? Buffer.alloc(0));
      return {
        statusCode: recordedRequest.status,
        headers: replayHeaders(
          recordedRequest.responseHeaders,
          resolution.matchKind === REPLAY_MATCH_KIND.FALLBACK,
        ),
        rawBody: body,
      };
    });

  const reset = (): void => {
    index.reset();
    requestLog.length = 0;
    divergences.length = 0;
    unsupported.length = 0;
    exactHits = 0;
    fallbacks = 0;
    misses = 0;
    stubs = 0;
  };

  return {
    proxyUrl: `http://127.0.0.1:${server.port}`,
    coverage: (): ReplayCoverage => {
      const totalRequests = exactHits + fallbacks + misses + stubs;
      const graded = exactHits + fallbacks + misses;
      return {
        totalRequests,
        exactHits,
        fallbacks,
        misses,
        stubs,
        exactRate: graded === 0 ? 1 : exactHits / graded,
      };
    },
    requestLog: () => [...requestLog],
    divergences: () => [...divergences],
    unsupportedProtocols: () => [...unsupported],
    reset,
    close: async () => server.stop(),
  };
};

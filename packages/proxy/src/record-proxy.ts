import {
  CAPTURE_PHASE,
  fingerprintRequest,
  graphqlOperationNames,
  sha256,
  type CapturePhase,
  type RecordedRequest,
} from '@evalarium/core';

import { toHeaderMap } from './headers.js';
import { createMockServer } from './mock-server.js';
import type {
  RecordProxyHandle,
  RecordProxyOptions,
  UnsupportedProtocolEvent,
} from './types.js';

export const startRecordProxy = async (
  options: RecordProxyOptions,
): Promise<RecordProxyHandle> => {
  const server = await createMockServer();
  const unsupported: UnsupportedProtocolEvent[] = [];
  let sequence = 0;
  let recordingActive = false;
  let capturePhase: CapturePhase = CAPTURE_PHASE.PREPARE;

  await server.on('websocket-request', (request) => {
    unsupported.push({ protocol: 'websocket', url: request.url });
  });
  await server
    .forAnyWebSocket()
    .thenRejectConnection(501, 'WebSocket replay is not implemented', {
      'x-evalarium-unsupported': 'websocket',
    });
  await server.forAnyRequest().thenPassThrough({
    beforeResponse: async (response, request) => {
      if (!recordingActive) {
        return;
      }
      const requestBody = request.body.buffer;
      const responseBody = response.body.buffer;
      const requestHeaders = toHeaderMap(request.headers);
      const rawRequest = {
        method: request.method,
        url: request.url,
        headers: requestHeaders,
        body: requestBody,
      };
      const { fingerprint, normalized } = fingerprintRequest(
        rawRequest,
        options.normalizationRules,
      );
      const graphqlOperation = graphqlOperationNames(
        rawRequest,
        options.normalizationRules,
      );
      const now = Date.now();
      const recordedRequest: RecordedRequest = {
        id: request.id,
        sessionId: options.sessionId,
        sequence,
        fingerprint,
        method: normalized.method,
        url: request.url,
        normalizedUrl: normalized.url,
        graphqlOperation,
        capturePhase,
        requestHeaders,
        requestBodyHash:
          requestBody.byteLength > 0 ? sha256(requestBody) : null,
        status: response.statusCode,
        responseHeaders: toHeaderMap(response.headers),
        responseBodyHash:
          responseBody.byteLength > 0 ? sha256(responseBody) : null,
        timing: {
          startedAt: request.timingEvents.startTime,
          headersAt: now,
          completedAt: now,
        },
      };
      sequence += 1;
      await options.sink.writeRequest(
        recordedRequest,
        requestBody,
        responseBody,
      );
    },
  });

  return {
    proxyUrl: `http://127.0.0.1:${server.port}`,
    beginRecording: () => {
      recordingActive = true;
    },
    beginReplayPhase: () => {
      capturePhase = CAPTURE_PHASE.REPLAY;
    },
    unsupportedProtocols: () => [...unsupported],
    close: async () => server.stop(),
  };
};

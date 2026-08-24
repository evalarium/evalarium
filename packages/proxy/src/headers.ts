import type { HeaderMap } from '@evalarium/core';
import type { Headers } from 'mockttp';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export const toHeaderMap = (headers: Headers): HeaderMap => {
  const result: HeaderMap = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name.toLowerCase()] = value;
    }
  }
  return result;
};

export const replayHeaders = (
  headers: HeaderMap,
  synthetic: boolean,
): Headers => {
  const result: Headers = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  if (synthetic) {
    result['x-evalarium-synthetic'] = 'nearest-match';
  }
  return result;
};

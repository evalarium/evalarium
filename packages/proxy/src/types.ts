import type {
  DivergenceEvent,
  NormalizationRules,
  RecordedRequest,
  RecordingSink,
  ReplayCoverage,
  ReplayRequestLogEntry,
} from '@evalarium/core';

export interface UnsupportedProtocolEvent {
  readonly protocol: 'websocket';
  readonly url: string;
}

export interface RecordProxyOptions {
  readonly sessionId: string;
  readonly sink: RecordingSink;
  readonly normalizationRules: NormalizationRules;
}

export interface ReplayProxyOptions {
  readonly requests: readonly RecordedRequest[];
  readonly blobsDirectory: string;
  readonly normalizationRules: NormalizationRules;
}

export interface BaseProxyHandle {
  readonly proxyUrl: string;
  unsupportedProtocols(): readonly UnsupportedProtocolEvent[];
  close(): Promise<void>;
}

export interface RecordProxyHandle extends BaseProxyHandle {
  beginRecording(): void;
  beginReplayPhase(): void;
}

export interface ReplayProxyHandle extends BaseProxyHandle {
  coverage(): ReplayCoverage;
  requestLog(): readonly ReplayRequestLogEntry[];
  divergences(): readonly DivergenceEvent[];
  reset(): void;
}

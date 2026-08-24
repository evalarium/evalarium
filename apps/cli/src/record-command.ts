import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { captureSession, createEvalrecWriter } from '@evalarium/capture';
import { startRecordProxy } from '@evalarium/proxy';

import { loadNormalizationRules } from './rules-loader.js';
import { loadCaptureScript } from './script-loader.js';

export interface RecordCommandOptions {
  readonly script: string;
  readonly out: string;
  readonly rules?: string;
}

export const recordCommand = async (
  targetUrl: string,
  options: RecordCommandOptions,
): Promise<void> => {
  const recordingPath = path.resolve(options.out);
  const script = await loadCaptureScript(options.script);
  const normalizationRules = await loadNormalizationRules(options.rules);
  const sessionId = randomUUID();
  const writer = await createEvalrecWriter(recordingPath);
  const proxy = await startRecordProxy({
    sessionId,
    sink: writer,
    normalizationRules,
  });
  try {
    const result = await captureSession({
      targetUrl,
      proxyUrl: proxy.proxyUrl,
      sink: writer,
      script,
      sessionId,
      normalizationRules,
      onSessionReady: () => proxy.beginRecording(),
      onReplayPhase: () => proxy.beginReplayPhase(),
    });
    process.stdout.write(
      `Recorded ${result.eventCount} input events to ${recordingPath}\n`,
    );
  } finally {
    await proxy.close();
    await writer.close();
  }
};

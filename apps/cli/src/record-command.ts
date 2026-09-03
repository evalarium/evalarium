import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { captureSession, createEvalrecWriter } from '@evalarium/capture';
import { startRecordProxy } from '@evalarium/proxy';

import { loadNormalizationRules } from './rules-loader.js';
import { resolveRecordMode } from './record-mode.js';

export interface RecordCommandOptions {
  readonly script?: string;
  readonly interactive?: boolean;
  readonly out: string;
  readonly rules?: string;
}

export const recordCommand = async (
  targetUrl: string,
  options: RecordCommandOptions,
): Promise<void> => {
  const recordingPath = path.resolve(options.out);
  const mode = await resolveRecordMode(options);
  const sessionId = randomUUID();
  let completed = false;
  let recordingCreated = false;
  try {
    const normalizationRules = await loadNormalizationRules(options.rules);
    const writer = await createEvalrecWriter(recordingPath);
    recordingCreated = true;
    try {
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
          script: mode.script,
          sessionId,
          normalizationRules,
          headless: mode.headless,
          onSessionReady: () => proxy.beginRecording(),
          onReplayPhase: () => proxy.beginReplayPhase(),
        });
        completed = true;
        process.stdout.write(
          `Recorded ${result.eventCount} input events to ${recordingPath}\n`,
        );
      } finally {
        await proxy.close();
      }
    } finally {
      await writer.close();
    }
  } finally {
    mode.close();
    if (recordingCreated && !completed) {
      await rm(recordingPath, { force: true, recursive: true });
    }
  }
};

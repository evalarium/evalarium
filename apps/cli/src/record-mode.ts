import type { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline/promises';

import type { CaptureScript } from '@evalarium/capture';

import { loadCaptureScript } from './script-loader.js';

export interface RecordModeOptions {
  readonly script?: string;
  readonly interactive?: boolean;
}

export interface InteractivePrompter {
  wait(message: string): Promise<void>;
  close(): void;
}

export interface ResolvedRecordMode {
  readonly script: CaptureScript;
  readonly headless: boolean;
  close(): void;
}

export interface RecordModeDependencies {
  readonly loadScript: (scriptPath: string) => Promise<CaptureScript>;
  readonly createPrompter: () => InteractivePrompter;
}

/**
 * Rejects the pending prompt when the operator interrupts. A TTY readline
 * swallows Ctrl-C and emits `SIGINT` on the interface instead of the
 * process, so both emitters are watched. Turning the interrupt into a
 * rejection lets the recording command run its normal cleanup and remove
 * the partial output instead of exiting mid-write.
 */
export const rejectOnInterrupt = <T>(
  operation: Promise<T>,
  emitters: readonly EventEmitter[],
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const detach = (): void => {
      for (const emitter of emitters) {
        emitter.off('SIGINT', onInterrupt);
      }
    };
    const onInterrupt = (): void => {
      detach();
      reject(new Error('Recording cancelled by the operator.'));
    };
    for (const emitter of emitters) {
      emitter.on('SIGINT', onInterrupt);
    }
    operation.then(
      (value) => {
        detach();
        resolve(value);
      },
      (error: unknown) => {
        detach();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

const createTerminalPrompter = (): InteractivePrompter => {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new Error(
      'Interactive recording requires a terminal. Use --script for CI and non-interactive shells.',
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    wait: async (message) => {
      await rejectOnInterrupt(
        readline.question(`${message}\nPress Enter to continue… `),
        [readline, process],
      );
    },
    close: () => readline.close(),
  };
};

const defaultDependencies: RecordModeDependencies = {
  loadScript: loadCaptureScript,
  createPrompter: createTerminalPrompter,
};

export const resolveRecordMode = async (
  options: RecordModeOptions,
  dependencies: RecordModeDependencies = defaultDependencies,
): Promise<ResolvedRecordMode> => {
  const interactive = options.interactive === true;
  if (interactive === (options.script !== undefined)) {
    throw new Error(
      'Choose exactly one recording mode: --script or --interactive.',
    );
  }
  if (options.script !== undefined) {
    return {
      script: await dependencies.loadScript(options.script),
      headless: true,
      close: () => undefined,
    };
  }

  const prompter = dependencies.createPrompter();
  return {
    headless: false,
    script: {
      prepare: async () => {
        await prompter.wait(
          'Preparation: sign in and navigate to the state that should become the fixture. Preparation traffic is context only.',
        );
      },
      run: async () => {
        await prompter.wait(
          'Reference workflow: perform every interaction the frozen environment should support. These inputs and responses are being recorded.',
        );
      },
    },
    close: () => prompter.close(),
  };
};

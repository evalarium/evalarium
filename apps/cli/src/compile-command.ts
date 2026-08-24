import path from 'node:path';

import { compileRecording } from '@evalarium/compiler';

export interface CompileCommandOptions {
  readonly out: string;
  readonly fixtureName?: string;
}

export const compileCommand = async (
  recordingPath: string,
  options: CompileCommandOptions,
): Promise<void> => {
  const outputPath = path.resolve(options.out);
  const result = await compileRecording(
    path.resolve(recordingPath),
    outputPath,
    {
      ...(options.fixtureName === undefined
        ? {}
        : { fixtureName: options.fixtureName }),
    },
  );
  process.stdout.write(
    `Compiled ${result.manifest.environmentId} to ${outputPath}\n`,
  );
};

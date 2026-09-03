import path from 'node:path';

import { startInspectorServer } from '@evalarium/inspector';

export interface InspectCommandOptions {
  readonly host: string;
  readonly port: string;
}

export const inspectorPort = (rawValue: string): number => {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('port must be a TCP port.');
  }
  return value;
};

export const inspectCommand = async (
  inputPath: string,
  options: InspectCommandOptions,
): Promise<void> => {
  const inspector = await startInspectorServer(path.resolve(inputPath), {
    host: options.host,
    port: inspectorPort(options.port),
  });
  process.stdout.write(`Inspecting episode evidence at ${inspector.url}\n`);

  await new Promise<void>((resolve) => {
    let closing = false;
    const shutdown = (): void => {
      if (closing) {
        return;
      }
      closing = true;
      void inspector.close().then(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
};

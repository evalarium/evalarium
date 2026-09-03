import type { EnvironmentHandle } from '@evalarium/runtime';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { jsonResult } from '../result.js';

export const registerDiagnosticTools = (
  server: McpServer,
  environment: EnvironmentHandle,
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>,
): void => {
  const registerReadOnly = (
    name: string,
    description: string,
    read: () => unknown,
  ): void => {
    server.registerTool(
      name,
      {
        description,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      () => enqueue(async () => jsonResult(read())),
    );
  };

  registerReadOnly(
    'evalarium_manifest',
    'Read the frozen environment manifest and fixture catalog.',
    () => environment.manifest,
  );
  registerReadOnly(
    'evalarium_coverage',
    'Read exact, fallback, miss, and stub replay coverage.',
    () => environment.coverage(),
  );
  registerReadOnly(
    'evalarium_divergences',
    'Read requests that left the recorded network trail.',
    () => environment.divergences(),
  );
  registerReadOnly(
    'evalarium_request_log',
    'Read the ordered replay request log and match decisions.',
    () => environment.requestLog(),
  );
};

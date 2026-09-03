import { openEnvironment, type EnvironmentHandle } from '@evalarium/runtime';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { registerBrowserTools } from './tools/register-browser-tools.js';
import { registerDiagnosticTools } from './tools/register-diagnostic-tools.js';

export interface EvalariumMcpSession {
  readonly server: McpServer;
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

export type OpenMcpEnvironment = (
  bundlePath: string,
  options?: { readonly headless?: boolean },
) => Promise<EnvironmentHandle>;

export interface OpenEvalariumMcpOptions {
  readonly headless?: boolean;
  readonly open?: OpenMcpEnvironment;
}

export const createEvalariumMcpSession = (
  environment: EnvironmentHandle,
): EvalariumMcpSession => {
  const server = new McpServer(
    { name: 'evalarium', version: '0.0.0' },
    {
      instructions:
        'Drive one local frozen Evalarium environment. Mutating tools return the resulting observation and on-trail status.',
    },
  );
  let operations = Promise.resolve();
  let closePromise: Promise<void> | null = null;
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operations.then(operation, operation);
    operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const closeEnvironment = async (): Promise<void> => {
    if (closePromise === null) {
      closePromise = (async () => {
        await operations;
        await environment.close();
      })();
    }
    await closePromise;
  };

  registerBrowserTools(server, environment, enqueue);
  registerDiagnosticTools(server, environment, enqueue);
  server.server.onclose = () => {
    void closeEnvironment();
  };

  return {
    server,
    connect: (transport) => server.connect(transport),
    close: async () => {
      await server.close();
      await closeEnvironment();
    },
  };
};

export const openEvalariumMcpSession = async (
  bundlePath: string,
  options: OpenEvalariumMcpOptions = {},
): Promise<EvalariumMcpSession> => {
  const environment = await (options.open ?? openEnvironment)(
    bundlePath,
    options.headless === undefined ? {} : { headless: options.headless },
  );
  return createEvalariumMcpSession(environment);
};

import { createServer, type ServerResponse } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import path from 'node:path';

import { RUNTIME_CLOCK_MODE, openEnvironment } from '@evalarium/runtime';

export interface ServeCommandOptions {
  readonly port: string;
  readonly cdpPort: string;
  readonly host: string;
  readonly headed?: boolean;
}

const parsePort = (rawValue: string, name: string): number => {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a TCP port.`);
  }
  return value;
};

const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
};

const readBody = async (
  request: NodeJS.ReadableStream,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
};

export const serveCommand = async (
  bundlePath: string,
  options: ServeCommandOptions,
): Promise<void> => {
  const port = parsePort(options.port, 'port');
  const cdpPort = parsePort(options.cdpPort, 'cdp-port');
  // Chromium only binds CDP on loopback; relay the public port to it so
  // containerized agents can attach.
  const internalCdpPort = cdpPort === 65_535 ? cdpPort - 1 : cdpPort + 1;
  const handle = await openEnvironment(path.resolve(bundlePath), {
    clockMode: RUNTIME_CLOCK_MODE.AUTO,
    remoteDebuggingPort: internalCdpPort,
    headless: options.headed !== true,
  });
  const cdpRelay = createTcpServer((socket) => {
    const upstream = connect(internalCdpPort, '127.0.0.1');
    socket.pipe(upstream);
    upstream.pipe(socket);
    const teardown = (): void => {
      socket.destroy();
      upstream.destroy();
    };
    socket.on('error', teardown);
    upstream.on('error', teardown);
  });
  await new Promise<void>((resolve) => {
    cdpRelay.listen(cdpPort, options.host, resolve);
  });

  // Serialize control operations: reset tears the page down.
  let operationChain: Promise<unknown> = Promise.resolve();
  const enqueue = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationChain.then(operation, operation);
    operationChain = result.catch(() => undefined);
    return result;
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      try {
        if (request.method === 'GET' && url.pathname === '/healthz') {
          sendJson(response, 200, { status: 'ok' });
          return;
        }
        if (request.method === 'GET' && url.pathname === '/manifest') {
          sendJson(response, 200, handle.manifest);
          return;
        }
        if (request.method === 'GET' && url.pathname === '/observation') {
          sendJson(response, 200, await enqueue(async () => handle.observe()));
          return;
        }
        if (request.method === 'GET' && url.pathname === '/coverage') {
          sendJson(response, 200, handle.coverage());
          return;
        }
        if (request.method === 'GET' && url.pathname === '/divergences') {
          sendJson(response, 200, handle.divergences());
          return;
        }
        if (request.method === 'GET' && url.pathname === '/request-log') {
          sendJson(response, 200, handle.requestLog());
          return;
        }
        if (request.method === 'POST' && url.pathname === '/reset') {
          const body = await readBody(request);
          const fixture =
            typeof body.fixture === 'string' ? body.fixture : undefined;
          const seed = typeof body.seed === 'number' ? body.seed : undefined;
          const observation = await enqueue(async () => {
            await handle.reset(fixture, seed);
            return handle.observe();
          });
          sendJson(response, 200, observation);
          return;
        }
        sendJson(response, 404, { error: 'Unknown control endpoint.' });
      } catch (error) {
        sendJson(response, 500, { error: (error as Error).message });
      }
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(port, options.host, resolve);
  });
  process.stdout.write(
    `Serving frozen environment ${handle.manifest.environmentId}\n` +
      `  control http://${options.host}:${port}\n` +
      `  cdp     http://${options.host}:${cdpPort}\n` +
      `  fixtures ${handle.manifest.fixtures.map((f) => f.name).join(', ')}\n`,
  );

  const shutdown = async (): Promise<void> => {
    server.close();
    cdpRelay.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  await new Promise<never>(() => {
    /* run until signalled */
  });
};

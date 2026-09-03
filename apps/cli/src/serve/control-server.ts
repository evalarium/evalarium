import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import {
  SessionInputError,
  type EnvironmentSession,
} from './environment-session.js';
import {
  SessionCapacityError,
  SessionNotFoundError,
  type SessionPool,
} from './session-pool.js';

class RequestInputError extends Error {}

export interface ControlServerOptions {
  readonly host: string;
  readonly port: number;
  readonly legacy: EnvironmentSession;
  readonly sessions: SessionPool;
}

export interface ControlServer {
  readonly url: string;
  close(): Promise<void>;
}

const statusForError = (error: unknown): number => {
  if (
    error instanceof RequestInputError ||
    error instanceof SessionInputError
  ) {
    return 400;
  }
  if (error instanceof SessionNotFoundError) {
    return 404;
  }
  if (error instanceof SessionCapacityError) {
    return 429;
  }
  return 500;
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
  request: IncomingMessage,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.byteLength;
    if (size > 1_000_000) {
      throw new RequestInputError('Request body exceeds 1 MB.');
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RequestInputError('Request body must be valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestInputError('Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
};

const resetOptions = (
  body: Record<string, unknown>,
): { fixture?: string; seed?: number } => {
  if (
    body.fixture !== undefined &&
    (typeof body.fixture !== 'string' || body.fixture.length === 0)
  ) {
    throw new RequestInputError('fixture must be a non-empty string.');
  }
  if (
    body.seed !== undefined &&
    (typeof body.seed !== 'number' || !Number.isInteger(body.seed))
  ) {
    throw new RequestInputError('seed must be an integer.');
  }
  return {
    ...(typeof body.fixture === 'string' ? { fixture: body.fixture } : {}),
    ...(typeof body.seed === 'number' ? { seed: body.seed } : {}),
  };
};

const externalDescription = (session: EnvironmentSession, url: URL) => {
  const endpoint = new URL(url.origin);
  endpoint.port = String(session.cdpPort);
  return {
    ...session.describe(),
    cdpEndpoint: endpoint.origin,
  };
};

const sessionRoute =
  /^\/sessions\/([^/]+)(?:\/(manifest|observation|coverage|divergences|request-log|reset))?$/u;

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: ControlServerOptions,
): Promise<void> => {
  const url = new URL(
    request.url ?? '/',
    `http://${request.headers.host ?? `${options.host}:${options.port}`}`,
  );
  if (request.method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/sessions') {
    const session = await options.sessions.create(
      resetOptions(await readBody(request)),
    );
    sendJson(response, 201, externalDescription(session, url));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/sessions') {
    sendJson(
      response,
      200,
      options.sessions
        .list()
        .map((session) => externalDescription(session, url)),
    );
    return;
  }

  const match = sessionRoute.exec(url.pathname);
  if (match?.[1] !== undefined) {
    const id = decodeURIComponent(match[1]);
    const action = match[2];
    const session = options.sessions.get(id);
    if (request.method === 'DELETE' && action === undefined) {
      await options.sessions.delete(id);
      sendJson(response, 200, { deleted: true, id });
      return;
    }
    if (request.method === 'GET' && action === undefined) {
      sendJson(response, 200, externalDescription(session, url));
      return;
    }
    if (request.method === 'GET' && action === 'manifest') {
      sendJson(response, 200, session.manifest);
      return;
    }
    if (request.method === 'GET' && action === 'observation') {
      sendJson(response, 200, await session.observe());
      return;
    }
    if (request.method === 'GET' && action === 'coverage') {
      sendJson(response, 200, await session.coverage());
      return;
    }
    if (request.method === 'GET' && action === 'divergences') {
      sendJson(response, 200, await session.divergences());
      return;
    }
    if (request.method === 'GET' && action === 'request-log') {
      sendJson(response, 200, await session.requestLog());
      return;
    }
    if (request.method === 'POST' && action === 'reset') {
      const { fixture, seed } = resetOptions(await readBody(request));
      sendJson(response, 200, await session.reset(fixture, seed));
      return;
    }
  }

  const legacy = options.legacy;
  if (request.method === 'GET' && url.pathname === '/manifest') {
    sendJson(response, 200, legacy.manifest);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/observation') {
    sendJson(response, 200, await legacy.observe());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/coverage') {
    sendJson(response, 200, await legacy.coverage());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/divergences') {
    sendJson(response, 200, await legacy.divergences());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/request-log') {
    sendJson(response, 200, await legacy.requestLog());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/reset') {
    const { fixture, seed } = resetOptions(await readBody(request));
    sendJson(response, 200, await legacy.reset(fixture, seed));
    return;
  }
  sendJson(response, 404, { error: 'Unknown control endpoint.' });
};

export const startControlServer = async (
  options: ControlServerOptions,
): Promise<ControlServer> => {
  const server = createServer((request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      sendJson(response, statusForError(error), {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Control server did not bind a TCP address.');
  }
  let closePromise: Promise<void> | null = null;
  return {
    url: `http://${options.host}:${address.port}`,
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
      return closePromise;
    },
  };
};

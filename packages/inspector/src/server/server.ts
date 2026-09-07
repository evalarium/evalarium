import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEpisodes } from './episodes.js';

export interface InspectorServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly assetsDirectory?: string;
}

export interface InspectorServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);
const LOOPBACK_BIND_ADDRESSES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

/**
 * A page on any origin can be pointed at a loopback bind through DNS
 * rebinding; the Host header is the only thing that distinguishes such a
 * request from the operator's own browser. Loopback binds therefore accept
 * loopback names only. Non-loopback binds are reachable by whatever
 * addresses the operator chose, so the check does not apply there.
 */
const isAllowedHost = (
  hostHeader: string | undefined,
  boundHost: string,
): boolean => {
  if (!LOOPBACK_BIND_ADDRESSES.has(boundHost)) {
    return true;
  }
  if (hostHeader === undefined) {
    return false;
  }
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
};

const send = (
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

export const startInspectorServer = async (
  inputPath: string,
  options: InspectorServerOptions = {},
): Promise<InspectorServerHandle> => {
  const episodes = await loadEpisodes(inputPath);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 5175;
  const assetsDirectory = path.resolve(
    options.assetsDirectory ??
      fileURLToPath(new URL('../client', import.meta.url)),
  );
  const server = createServer((request, response) => {
    void (async () => {
      if (!isAllowedHost(request.headers.host, host)) {
        send(
          response,
          403,
          'application/json; charset=utf-8',
          '{"error":"Host header must name this loopback server."}',
        );
        return;
      }
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method !== 'GET') {
        send(response, 405, 'application/json', '{"error":"GET required"}');
        return;
      }
      if (url.pathname === '/api/episodes') {
        send(
          response,
          200,
          'application/json; charset=utf-8',
          JSON.stringify(episodes),
        );
        return;
      }
      const relativePath =
        url.pathname === '/'
          ? 'index.html'
          : decodeURIComponent(url.pathname.slice(1));
      const candidate = path.resolve(assetsDirectory, relativePath);
      if (
        candidate !== assetsDirectory &&
        !candidate.startsWith(`${assetsDirectory}${path.sep}`)
      ) {
        send(response, 403, 'text/plain; charset=utf-8', 'Forbidden');
        return;
      }
      try {
        const body = await readFile(candidate);
        send(
          response,
          200,
          contentTypes[path.extname(candidate)] ?? 'application/octet-stream',
          body,
        );
      } catch {
        send(response, 404, 'text/plain; charset=utf-8', 'Not found');
      }
    })().catch((error: unknown) => {
      send(
        response,
        500,
        'application/json; charset=utf-8',
        JSON.stringify({ error: (error as Error).message }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Inspector server did not bind a TCP port.');
  }
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  return {
    url: `http://${displayHost}:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
};

import type {
  EnvironmentHandle,
  OpenEnvironmentOptions,
} from '@evalarium/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  startControlServer,
  type ControlServer,
} from '../src/serve/control-server.js';
import { EnvironmentSession } from '../src/serve/environment-session.js';
import {
  SessionPool,
  validateSessionPortRange,
} from '../src/serve/session-pool.js';

const servers: ControlServer[] = [];
const pools: SessionPool[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.allSettled(pools.splice(0).map((pool) => pool.close()));
});

const manifest = {
  schemaVersion: 2,
  environmentId: '0123456789abcdef',
  sourceSessionId: 'source-1',
  entryUrl: 'https://example.test/',
  seedDefaults: { seed: 42, clockStartMs: 0 },
  normalizationRules: {},
  fixtures: [{ name: 'default', storageSnapshotId: 'snapshot-1' }],
  blobHashes: [],
};

const createFakeEnvironment = () => {
  let seed = 42;
  const close = vi.fn(async () => undefined);
  const environment = {
    manifest,
    reset: vi.fn(async (_fixture?: string, nextSeed?: number) => {
      seed = nextSeed ?? 42;
    }),
    observe: async () => ({
      url: 'https://example.test/',
      title: 'Example',
      a11ySnapshot: `- text "seed ${seed}"`,
      domDigest: `seed-${seed}`,
    }),
    coverage: () => ({
      totalRequests: seed,
      exactHits: seed,
      fallbacks: 0,
      misses: 0,
      stubs: 0,
      exactRate: 1,
    }),
    requestLog: () => [],
    divergences: () => [],
    close,
  } as unknown as EnvironmentHandle;
  return { close, environment };
};

const createPool = () => {
  const browserPorts: number[] = [];
  const relayPorts: number[] = [];
  const environments: ReturnType<typeof createFakeEnvironment>[] = [];
  const pool = new SessionPool({
    bundlePath: '/fake/bundle',
    host: '127.0.0.1',
    headless: true,
    maxSessions: 2,
    sessionCdpStart: 41_000,
    open: async (_bundlePath: string, options: OpenEnvironmentOptions) => {
      browserPorts.push(options.remoteDebuggingPort ?? -1);
      const fake = createFakeEnvironment();
      environments.push(fake);
      return fake.environment;
    },
    startRelay: async (publicPort) => {
      relayPorts.push(publicPort);
      return { close: async () => undefined };
    },
  });
  pools.push(pool);
  return { browserPorts, environments, pool, relayPorts };
};

const json = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

interface SessionResponse {
  readonly id: string;
  readonly seed: number;
  readonly cdpPort: number;
  readonly cdpEndpoint: string;
}

describe('managed environment sessions', () => {
  it('keeps two control sessions and their coverage independent', async () => {
    const { browserPorts, environments, pool, relayPorts } = createPool();
    const legacyEnvironment = createFakeEnvironment();
    const legacy = new EnvironmentSession({
      id: 'legacy',
      environment: legacyEnvironment.environment,
      relay: { close: async () => undefined },
      cdpPort: 39_922,
      fixture: 'default',
      seed: 42,
    });
    const server = await startControlServer({
      host: '127.0.0.1',
      port: 0,
      legacy,
      sessions: pool,
    });
    servers.push(server);

    const firstResponse = await fetch(`${server.url}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed: 1 }),
    });
    const secondResponse = await fetch(`${server.url}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed: 2 }),
    });
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    const first = await json<SessionResponse>(firstResponse);
    const second = await json<SessionResponse>(secondResponse);
    expect([first.cdpPort, second.cdpPort]).toEqual([41_000, 41_002]);
    expect(browserPorts).toEqual([41_001, 41_003]);
    expect(relayPorts).toEqual([41_000, 41_002]);
    expect(first.cdpEndpoint).toBe('http://127.0.0.1:41000');

    const reset = await fetch(`${server.url}/sessions/${first.id}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed: 9 }),
    });
    expect(await json(reset)).toMatchObject({ domDigest: 'seed-9' });
    const firstCoverage = await json<{ exactHits: number }>(
      await fetch(`${server.url}/sessions/${first.id}/coverage`),
    );
    const secondCoverage = await json<{ exactHits: number }>(
      await fetch(`${server.url}/sessions/${second.id}/coverage`),
    );
    expect(firstCoverage.exactHits).toBe(9);
    expect(secondCoverage.exactHits).toBe(2);

    const fullResponse = await fetch(`${server.url}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(fullResponse.status).toBe(429);

    expect(
      (
        await json<SessionResponse[]>(await fetch(`${server.url}/sessions`))
      ).map((session) => session.id),
    ).toEqual([first.id, second.id]);
    expect(
      (
        await fetch(`${server.url}/sessions/${first.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
    expect(
      await json<SessionResponse[]>(await fetch(`${server.url}/sessions`)),
    ).toHaveLength(1);
    expect(environments[0]?.close).toHaveBeenCalledOnce();
    await pool.close();
    expect(environments[1]?.close).toHaveBeenCalledOnce();

    await legacy.close();
  });

  it('preserves the legacy reset, observation, and coverage routes', async () => {
    const { pool } = createPool();
    const fake = createFakeEnvironment();
    const legacy = new EnvironmentSession({
      id: 'legacy',
      environment: fake.environment,
      relay: { close: async () => undefined },
      cdpPort: 39_922,
      fixture: 'default',
      seed: 42,
    });
    const server = await startControlServer({
      host: '127.0.0.1',
      port: 0,
      legacy,
      sessions: pool,
    });
    servers.push(server);

    const reset = await fetch(`${server.url}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed: 5 }),
    });
    expect(await json(reset)).toMatchObject({ domDigest: 'seed-5' });
    expect(await json(await fetch(`${server.url}/observation`))).toMatchObject({
      domDigest: 'seed-5',
    });
    expect(await json(await fetch(`${server.url}/coverage`))).toMatchObject({
      exactHits: 5,
    });

    await legacy.close();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('rejects overlapping or overflowing session port ranges', () => {
    expect(() => validateSessionPortRange(4_000, 4, [4_003])).toThrow(
      /overlaps port 4003/u,
    );
    expect(() => validateSessionPortRange(65_534, 2)).toThrow(
      /exceeds the TCP port limit/u,
    );
  });
});

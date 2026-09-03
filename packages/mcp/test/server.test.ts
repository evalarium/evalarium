import type { EnvironmentHandle } from '@evalarium/runtime';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import { createEvalariumMcpSession } from '../src/server.js';

const observation = {
  url: 'https://example.test/',
  title: 'Example',
  a11ySnapshot: '- heading "Example"',
  domDigest: 'abc123',
};

const createFakeEnvironment = () => {
  const calls: string[] = [];
  const close = vi.fn(async () => undefined);
  const reset = vi.fn(async (fixture?: string, seed?: number) => {
    calls.push(`reset:${fixture ?? 'default'}:${String(seed ?? 42)}`);
  });
  const locator = {
    first: () => locator,
    click: async () => {
      calls.push('click');
    },
    fill: async (value: string) => {
      calls.push(`fill:${value}`);
    },
    press: async (key: string) => {
      calls.push(`press:${key}`);
    },
  };
  const environment = {
    manifest: {
      schemaVersion: 2,
      environmentId: '0123456789abcdef',
      sourceSessionId: 'session-1',
      entryUrl: 'https://example.test/',
      seedDefaults: { seed: 42, clockStartMs: 0 },
      normalizationRules: {},
      fixtures: [{ name: 'default', storageSnapshotId: 'snapshot-1' }],
      blobHashes: [],
    },
    page: {
      locator: () => locator,
      keyboard: {
        press: async (key: string) => {
          calls.push(`keyboard:${key}`);
        },
      },
      screenshot: async () => Buffer.from('png'),
      waitForTimeout: async () => undefined,
    },
    reset,
    observe: async () => observation,
    coverage: () => ({
      totalRequests: 1,
      exactHits: 1,
      fallbacks: 0,
      misses: 0,
      stubs: 0,
      exactRate: 1,
    }),
    requestLog: () => [],
    divergences: () => [],
    close,
  } as unknown as EnvironmentHandle;
  return { calls, close, environment, reset };
};

const connect = async (environment: EnvironmentHandle) => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const session = createEvalariumMcpSession(environment);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await session.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, session };
};

const textPayload = (result: unknown) => {
  const content = CallToolResultSchema.parse(result).content[0];
  if (content?.type !== 'text') {
    throw new Error('Expected a text MCP result.');
  }
  return JSON.parse(content.text) as Record<string, unknown>;
};

describe('Evalarium MCP server', () => {
  it('initializes and exposes the bounded local tool set', async () => {
    const fake = createFakeEnvironment();
    const { client, session } = await connect(fake.environment);

    expect(client.getServerVersion()?.name).toBe('evalarium');
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual([
      'evalarium_reset',
      'evalarium_observe',
      'evalarium_click',
      'evalarium_fill',
      'evalarium_press',
      'evalarium_screenshot',
      'evalarium_manifest',
      'evalarium_coverage',
      'evalarium_divergences',
      'evalarium_request_log',
    ]);

    await client.close();
    await session.close();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('resets and returns an observation with on-trail status', async () => {
    const fake = createFakeEnvironment();
    const { client, session } = await connect(fake.environment);

    const result = await client.callTool({
      name: 'evalarium_reset',
      arguments: { fixture: 'default', seed: 7 },
    });
    expect(textPayload(result)).toEqual({ observation, onTrail: true });
    expect(fake.reset).toHaveBeenCalledWith('default', 7);

    await client.close();
    await session.close();
  });

  it('executes browser actions in order and captures screenshots', async () => {
    const fake = createFakeEnvironment();
    const { client, session } = await connect(fake.environment);

    const fill = await client.callTool({
      name: 'evalarium_fill',
      arguments: { selector: '#email', value: 'person@example.test' },
    });
    expect(textPayload(fill).onTrail).toBe(true);
    const press = await client.callTool({
      name: 'evalarium_press',
      arguments: { key: 'Enter' },
    });
    expect(textPayload(press).observation).toEqual(observation);
    const screenshot = await client.callTool({
      name: 'evalarium_screenshot',
      arguments: {},
    });
    expect(CallToolResultSchema.parse(screenshot).content[0]).toMatchObject({
      type: 'image',
      data: Buffer.from('png').toString('base64'),
      mimeType: 'image/png',
    });
    expect(fake.calls).toEqual(['fill:person@example.test', 'keyboard:Enter']);

    await client.close();
    await session.close();
  });

  it('rejects invalid tool input without touching the environment', async () => {
    const fake = createFakeEnvironment();
    const { client, session } = await connect(fake.environment);

    const result = await client.callTool({
      name: 'evalarium_click',
      arguments: { selector: '' },
    });
    expect(result.isError).toBe(true);
    expect(fake.calls).toEqual([]);

    await client.close();
    await session.close();
  });
});

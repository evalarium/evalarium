import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from '../packages/runtime/node_modules/playwright-core/index.mjs';

const ROOT = process.cwd();
const CLI_PATH = path.join(ROOT, 'apps/cli/dist/index.js');
const FIXTURE_SERVER_PATH = path.join(
  ROOT,
  'fixtures/demo-shop/dist/server/index.js',
);

const run = async (command, argumentsList, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd: ROOT,
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code, stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${argumentsList.join(' ')} exited with ${code}\n${stderr}`,
        ),
      );
    });
  });

const runCli = (argumentsList) =>
  run(process.execPath, [CLI_PATH, ...argumentsList]);

const startFixture = async () => {
  const child = spawn(process.execPath, [FIXTURE_SERVER_PATH], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout.setEncoding('utf8');
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Fixture startup timed out.')),
      10_000,
    );
    child.stdout.on('data', (chunk) => {
      const match = /EVALARIUM_FIXTURE_URL=(https?:\/\/[^\s]+)/u.exec(chunk);
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Fixture exited before startup with ${code}.`));
    });
  });
  return { child, url };
};

const stopFixture = async (child) => {
  if (child.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
};

const reservePort = async () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address !== null && typeof address !== 'string');
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(port);
        }
      });
    });
  });

const waitForHealthy = async (url) => {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error('Container health check timed out.');
};

const workDirectory = await mkdtemp(
  path.join(tmpdir(), 'evalarium-docker-smoke-'),
);
const recordingPath = path.join(workDirectory, 'demo-shop.evalrec');
const bundlePath = path.join(workDirectory, 'demo-shop.evalbundle');
const suffix = `${process.pid}-${Date.now()}`;
const imageName = `evalarium-smoke:${suffix}`;
const containerName = `evalarium-smoke-${suffix}`;
let fixture = null;

try {
  await run('docker', ['info'], { capture: true });
  fixture = await startFixture();
  await runCli([
    'record',
    fixture.url,
    '--script',
    'fixtures/demo-shop/dist/scripts/record.js',
    '--out',
    recordingPath,
  ]);
  await stopFixture(fixture.child);
  fixture = null;
  await runCli(['compile', recordingPath, '--out', bundlePath]);

  await run('docker', [
    'build',
    '--file',
    'packages/packager/docker/Dockerfile',
    '--tag',
    imageName,
    '.',
  ]);

  const controlPort = await reservePort();
  const cdpPort = await reservePort();
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--name',
      containerName,
      '--publish',
      `127.0.0.1:${controlPort}:3901`,
      '--publish',
      `127.0.0.1:${cdpPort}:3924`,
      '--volume',
      `${bundlePath}:/bundle:ro`,
      imageName,
    ],
    { capture: true },
  );

  const controlUrl = `http://127.0.0.1:${controlPort}`;
  const cdpUrl = `http://127.0.0.1:${cdpPort}`;
  await waitForHealthy(controlUrl);

  const manifestResponse = await fetch(`${controlUrl}/manifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.fixtures[0]?.name, 'default');

  const resetResponse = await fetch(`${controlUrl}/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(resetResponse.status, 200);
  const observation = await resetResponse.json();
  assert.equal(observation.title, 'Evalarium Demo Shop');

  const coverageResponse = await fetch(`${controlUrl}/coverage`);
  assert.equal(coverageResponse.status, 200);
  const coverage = await coverageResponse.json();
  assert.equal(coverage.exactRate, 1);
  assert.equal(coverage.fallbacks, 0);
  assert.equal(coverage.misses, 0);

  const versionResponse = await fetch(`${cdpUrl}/json/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  assert.match(version.webSocketDebuggerUrl, /^ws:\/\//u);

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const page = browser.contexts()[0]?.pages()[0];
    assert(page, 'The served browser has no page.');
    assert.equal(await page.title(), 'Evalarium Demo Shop');
  } finally {
    await browser.close();
  }

  process.stdout.write(
    `Docker smoke passed: control=${controlPort}, cdp=${cdpPort}, exact=${coverage.exactRate}.\n`,
  );
} finally {
  if (fixture !== null) {
    await stopFixture(fixture.child);
  }
  await run('docker', ['rm', '--force', containerName], {
    allowFailure: true,
    capture: true,
  }).catch(() => undefined);
  await run('docker', ['image', 'rm', '--force', imageName], {
    allowFailure: true,
    capture: true,
  }).catch(() => undefined);
  await rm(workDirectory, { recursive: true, force: true });
}

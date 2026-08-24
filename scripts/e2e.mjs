import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openEnvironment } from '../packages/runtime/dist/index.js';

const REPOSITORY_ROOT = process.cwd();
const CLI_PATH = path.join(REPOSITORY_ROOT, 'apps/cli/dist/index.js');
const FIXTURE_SERVER_PATH = path.join(
  REPOSITORY_ROOT,
  'fixtures/demo-shop/dist/server/index.js',
);

const runCli = async (argumentsList) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...argumentsList], {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `evalarium ${argumentsList[0]} exited with ${code}: ${stderr}`,
        ),
      );
    });
  });

const startFixture = async () => {
  const child = spawn(process.execPath, [FIXTURE_SERVER_PATH], {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.pipe(process.stderr);
  child.stdout.setEncoding('utf8');
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Fixture startup timed out.')),
      10_000,
    );
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      const match = /EVALARIUM_FIXTURE_URL=(https?:\/\/[^\s]+)/u.exec(chunk);
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
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

const workDirectory = await mkdtemp(path.join(tmpdir(), 'evalarium-e2e-'));
const recordingPath = path.join(workDirectory, 'demo-shop.evalrec');
const bundlePath = path.join(workDirectory, 'demo-shop.evalbundle');
let fixture = null;

try {
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
  process.stdout.write('Origin stopped; all remaining stages are offline.\n');

  await runCli(['compile', recordingPath, '--out', bundlePath]);
  const runOutput = await runCli(['run', bundlePath, '--fixture', 'default']);
  assert.match(runOutput, /Replay coverage 100% on-trail/u);

  const verifyOutput = await runCli([
    'verify',
    bundlePath,
    '--tasks',
    'fixtures/demo-shop/dist/tasks/*.task.js',
  ]);
  assert.match(verifyOutput, /2\/2 tasks passed/u);

  const determinismOutput = await runCli([
    'determinism',
    bundlePath,
    '--episodes',
    '5',
    '--seed',
    '42',
  ]);
  assert.match(
    determinismOutput,
    /determinism hash identical across 5 episodes/u,
  );

  const noShimsOutput = await runCli([
    'determinism',
    bundlePath,
    '--episodes',
    '5',
    '--seed',
    '42',
    '--no-shims',
  ]);
  assert.match(noShimsOutput, /no-shims hashes diverged across 5 episodes/u);

  const handle = await openEnvironment(bundlePath);
  try {
    await handle.replayTrace();
    const onTrailCoverage = handle.coverage();
    assert.equal(onTrailCoverage.exactRate, 1);
    assert.equal(onTrailCoverage.fallbacks, 0);
    const probe = await handle.page.evaluate(async () => {
      const response = await fetch('/api/productz');
      return {
        status: response.status,
        synthetic: response.headers.get('x-evalarium-synthetic'),
      };
    });
    assert.equal(probe.status, 200);
    assert.equal(probe.synthetic, 'nearest-match');
    const divergence = handle.divergences().at(-1);
    assert.ok(divergence);
    assert.equal(divergence.closestMatchDistance, 1);
    process.stdout.write(
      `Divergence logged for ${divergence.url}; nearest-match distance=${divergence.closestMatchDistance}.\n`,
    );
  } finally {
    await handle.close();
  }

  process.stdout.write('Evalarium e2e walking skeleton passed.\n');
} finally {
  if (fixture !== null) {
    await stopFixture(fixture.child);
  }
  await rm(workDirectory, { recursive: true, force: true });
}

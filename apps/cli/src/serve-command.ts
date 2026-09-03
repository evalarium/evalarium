import path from 'node:path';

import { RUNTIME_CLOCK_MODE, openEnvironment } from '@evalarium/runtime';

import { startCdpRelay } from './serve/cdp-relay.js';
import { startControlServer } from './serve/control-server.js';
import { EnvironmentSession } from './serve/environment-session.js';
import { SessionPool, validateSessionPortRange } from './serve/session-pool.js';

export interface ServeCommandOptions {
  readonly port: string;
  readonly cdpPort: string;
  readonly sessionCdpStart: string;
  readonly maxSessions: string;
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

const parseMaxSessions = (rawValue: string): number => {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('max-sessions must be an integer between 1 and 100.');
  }
  return value;
};

export const serveCommand = async (
  bundlePath: string,
  options: ServeCommandOptions,
): Promise<void> => {
  const port = parsePort(options.port, 'port');
  const cdpPort = parsePort(options.cdpPort, 'cdp-port');
  const sessionCdpStart = parsePort(
    options.sessionCdpStart,
    'session-cdp-start',
  );
  const maxSessions = parseMaxSessions(options.maxSessions);
  // Chromium binds CDP on loopback. Every public relay gets an adjacent,
  // loopback-only browser port.
  const internalCdpPort = cdpPort === 65_535 ? cdpPort - 1 : cdpPort + 1;
  validateSessionPortRange(sessionCdpStart, maxSessions, [
    port,
    cdpPort,
    internalCdpPort,
  ]);

  const resolvedBundlePath = path.resolve(bundlePath);
  const headless = options.headed !== true;
  const environment = await openEnvironment(resolvedBundlePath, {
    clockMode: RUNTIME_CLOCK_MODE.AUTO,
    remoteDebuggingPort: internalCdpPort,
    headless,
  });
  let legacyRelay: Awaited<ReturnType<typeof startCdpRelay>> | null = null;
  let sessions: SessionPool | null = null;
  let control: Awaited<ReturnType<typeof startControlServer>> | null = null;
  try {
    legacyRelay = await startCdpRelay(cdpPort, internalCdpPort, options.host);
    const legacy = new EnvironmentSession({
      id: 'legacy',
      environment,
      relay: legacyRelay,
      cdpPort,
      fixture: environment.manifest.fixtures[0]?.name ?? 'default',
      seed: environment.manifest.seedDefaults.seed,
    });
    sessions = new SessionPool({
      bundlePath: resolvedBundlePath,
      host: options.host,
      headless,
      maxSessions,
      sessionCdpStart,
    });
    control = await startControlServer({
      host: options.host,
      port,
      legacy,
      sessions,
    });

    process.stdout.write(
      `Serving frozen environment ${environment.manifest.environmentId}\n` +
        `  control  ${control.url}\n` +
        `  cdp      http://${options.host}:${cdpPort}\n` +
        `  sessions up to ${maxSessions} (CDP ${sessionCdpStart}-${sessionCdpStart + maxSessions * 2 - 1})\n` +
        `  fixtures ${environment.manifest.fixtures.map((fixture) => fixture.name).join(', ')}\n`,
    );

    await new Promise<void>((resolve) => {
      const onSignal = (): void => resolve();
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    });
    await control.close();
    await sessions.close();
    await legacy.close();
  } catch (error) {
    await control?.close().catch(() => undefined);
    await sessions?.close().catch(() => undefined);
    if (legacyRelay === null) {
      await environment.close().catch(() => undefined);
    } else {
      await Promise.allSettled([legacyRelay.close(), environment.close()]);
    }
    throw error;
  }
};

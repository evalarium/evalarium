import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BundleManifestSchema,
  CompiledEnvironmentConfigSchema,
  type BundleManifest,
  type CompiledEnvironmentConfig,
} from '@evalarium/core';

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8')) as unknown;

export interface FrozenBundle {
  readonly path: string;
  readonly manifest: BundleManifest;
  readonly config: CompiledEnvironmentConfig;
  readonly shimSource: string;
}

export const readFrozenBundle = async (
  bundlePath: string,
): Promise<FrozenBundle> => {
  const [manifest, config, shimSource] = await Promise.all([
    readJson(path.join(bundlePath, 'manifest.json')),
    readJson(path.join(bundlePath, 'evalarium.config.json')),
    readFile(path.join(bundlePath, 'shim.js'), 'utf8'),
  ]);
  return {
    path: bundlePath,
    manifest: BundleManifestSchema.parse(manifest),
    config: CompiledEnvironmentConfigSchema.parse(config),
    shimSource,
  };
};

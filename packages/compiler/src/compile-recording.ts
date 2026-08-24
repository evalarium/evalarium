import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUNDLE_SCHEMA_VERSION,
  BundleManifestSchema,
  CompiledEnvironmentConfigSchema,
  STORAGE_SNAPSHOT_PHASE,
  sha256,
  stableStringify,
  type BundleManifest,
} from '@evalarium/core';

import { readEvalrec } from './read-evalrec.js';

export interface CompileRecordingOptions {
  readonly fixtureName?: string;
}

export interface CompileRecordingResult {
  readonly manifest: BundleManifest;
  readonly bundlePath: string;
}

const writeCanonicalJson = async (
  destination: string,
  value: unknown,
): Promise<void> => {
  await writeFile(destination, `${stableStringify(value)}\n`, { flag: 'wx' });
};

export const compileRecording = async (
  recordingPath: string,
  bundlePath: string,
  options: CompileRecordingOptions = {},
): Promise<CompileRecordingResult> => {
  const recording = readEvalrec(recordingPath);
  const initialSnapshot = recording.storageSnapshots.find(
    (snapshot) => snapshot.phase === STORAGE_SNAPSHOT_PHASE.INITIAL,
  );
  if (initialSnapshot === undefined) {
    throw new Error('The recording has no initial storage snapshot.');
  }
  const blobHashes = [
    ...new Set(
      recording.requests.flatMap((request) =>
        [request.requestBodyHash, request.responseBodyHash].filter(
          (hash): hash is string => hash !== null,
        ),
      ),
    ),
  ].sort();
  const config = CompiledEnvironmentConfigSchema.parse({
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    session: recording.session,
    requests: recording.requests,
    events: recording.events,
    storageSnapshots: recording.storageSnapshots,
  });
  const environmentId = sha256(stableStringify({ config, blobHashes })).slice(
    0,
    16,
  );
  const manifest = BundleManifestSchema.parse({
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    environmentId,
    sourceSessionId: recording.session.id,
    entryUrl: recording.session.targetUrl,
    seedDefaults: { seed: 42, clockStartMs: recording.session.startedAt },
    normalizationRules: recording.session.normalizationRules,
    fixtures: [
      {
        name: options.fixtureName ?? 'default',
        storageSnapshotId: initialSnapshot.id,
      },
    ],
    blobHashes,
  });

  await mkdir(bundlePath);
  const outputBlobs = path.join(bundlePath, 'blobs');
  await mkdir(outputBlobs);
  for (const hash of blobHashes) {
    const source = path.join(recordingPath, 'blobs', hash);
    const body = await readFile(source);
    if (sha256(body) !== hash) {
      throw new Error(`Recording blob failed integrity validation: ${hash}.`);
    }
    await copyFile(source, path.join(outputBlobs, hash));
  }
  const shimSource = fileURLToPath(
    import.meta.resolve('@evalarium/shims/iife'),
  );
  await copyFile(shimSource, path.join(bundlePath, 'shim.js'));
  await writeCanonicalJson(path.join(bundlePath, 'manifest.json'), manifest);
  await writeCanonicalJson(
    path.join(bundlePath, 'evalarium.config.json'),
    config,
  );
  return { manifest, bundlePath };
};

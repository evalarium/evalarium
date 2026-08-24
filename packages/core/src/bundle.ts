import { z } from 'zod';

import { InputEventSchema } from './events.js';
import { NormalizationRulesSchema } from './normalization.js';
import { RecordedRequestSchema, SessionSchema } from './recording.js';
import { StorageSnapshotSchema } from './storage.js';

export const BUNDLE_SCHEMA_VERSION = 2 as const;

export const FixtureDefinitionSchema = z.object({
  name: z.string().min(1),
  storageSnapshotId: z.string().min(1),
});

export const SeedDefaultsSchema = z.object({
  seed: z.number().int(),
  clockStartMs: z.number().int().nonnegative(),
});

export const BundleManifestSchema = z.object({
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  environmentId: z.string().regex(/^[a-f0-9]{16}$/u),
  sourceSessionId: z.string().min(1),
  entryUrl: z.url(),
  seedDefaults: SeedDefaultsSchema,
  normalizationRules: NormalizationRulesSchema,
  fixtures: z.array(FixtureDefinitionSchema).min(1),
  blobHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
});

export const CompiledEnvironmentConfigSchema = z.object({
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  session: SessionSchema,
  requests: z.array(RecordedRequestSchema),
  events: z.array(InputEventSchema),
  storageSnapshots: z.array(StorageSnapshotSchema),
});

export type FixtureDefinition = z.infer<typeof FixtureDefinitionSchema>;
export type SeedDefaults = z.infer<typeof SeedDefaultsSchema>;
export type BundleManifest = z.infer<typeof BundleManifestSchema>;
export type CompiledEnvironmentConfig = z.infer<
  typeof CompiledEnvironmentConfigSchema
>;

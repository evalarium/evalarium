import { z } from 'zod';

import {
  DivergenceEventSchema,
  ReplayRequestLogEntrySchema,
} from './replay.js';

export const EPISODE_SCHEMA_VERSION = 1 as const;

export const EpisodeObservationSchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  a11ySnapshot: z.string(),
  domDigest: z.string().min(1),
});

export const EpisodeStepNetworkSchema = z.object({
  requests: z.array(ReplayRequestLogEntrySchema).default([]),
  divergences: z.array(DivergenceEventSchema).default([]),
});

export const EpisodeStepSchema = z.object({
  observation: EpisodeObservationSchema,
  actions: z.array(z.record(z.string(), z.unknown())),
  commentary: z.string(),
  network: EpisodeStepNetworkSchema.default({
    requests: [],
    divergences: [],
  }),
});

export const EpisodeNetworkSummarySchema = z.object({
  coverage: z.object({
    totalRequests: z.number().int().nonnegative(),
    exactHits: z.number().int().nonnegative(),
    fallbacks: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    stubs: z.number().int().nonnegative(),
  }),
  operations: z.record(z.string(), z.record(z.string(), z.number())),
});

export const EpisodeUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative(),
});

// Defaults on schemaVersion, seed, and step.network keep artifacts written by
// the pre-inspector runner readable. Parsing upgrades them in memory without
// rewriting the user's evidence on disk.
export const EpisodeArtifactSchema = z.object({
  schemaVersion: z.literal(EPISODE_SCHEMA_VERSION).default(1),
  taskId: z.string().min(1),
  fixture: z.string().min(1),
  instructions: z.string().min(1),
  model: z.string().min(1),
  environmentId: z.string().min(1),
  seed: z.number().int().nullable().default(null),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  steps: z.array(EpisodeStepSchema),
  finished: z.boolean(),
  reward: z.number().min(0).max(1),
  network: EpisodeNetworkSummarySchema,
  usage: EpisodeUsageSchema,
});

export type EpisodeObservation = z.infer<typeof EpisodeObservationSchema>;
export type EpisodeStepNetwork = z.infer<typeof EpisodeStepNetworkSchema>;
export type EpisodeStep = z.infer<typeof EpisodeStepSchema>;
export type EpisodeNetworkSummary = z.infer<typeof EpisodeNetworkSummarySchema>;
export type EpisodeUsage = z.infer<typeof EpisodeUsageSchema>;
export type EpisodeArtifact = z.infer<typeof EpisodeArtifactSchema>;

export const parseEpisodeArtifact = (value: unknown): EpisodeArtifact =>
  EpisodeArtifactSchema.parse(value);

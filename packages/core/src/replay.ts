import { z } from 'zod';

export const REPLAY_MATCH_KIND = {
  EXACT: 'exact',
  FALLBACK: 'fallback',
  MISS: 'miss',
  STUB: 'stub',
} as const;

export type ReplayMatchKind =
  (typeof REPLAY_MATCH_KIND)[keyof typeof REPLAY_MATCH_KIND];

export const ReplayRequestLogEntrySchema = z.object({
  sequence: z.number().int().nonnegative(),
  method: z.string().min(1),
  url: z.url(),
  normalizedUrl: z.url(),
  graphqlOperation: z.string().nullable(),
  graphqlVariables: z.array(z.unknown()).nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  matchKind: z.enum([
    REPLAY_MATCH_KIND.EXACT,
    REPLAY_MATCH_KIND.FALLBACK,
    REPLAY_MATCH_KIND.MISS,
    REPLAY_MATCH_KIND.STUB,
  ]),
  recordedRequestId: z.string().nullable(),
  status: z.number().int().min(100).max(599),
});

export const DivergenceEventSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  method: z.string().min(1),
  url: z.url(),
  normalizedUrl: z.url(),
  graphqlOperation: z.string().nullable(),
  closestRequestId: z.string().nullable(),
  closestNormalizedUrl: z.url().nullable(),
  closestGraphqlOperation: z.string().nullable(),
  closestMatchDistance: z.number().int().nonnegative().nullable(),
});

export const ReplayCoverageSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  exactHits: z.number().int().nonnegative(),
  fallbacks: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  stubs: z.number().int().nonnegative(),
  exactRate: z.number().min(0).max(1),
});

export type ReplayRequestLogEntry = z.infer<typeof ReplayRequestLogEntrySchema>;
export type DivergenceEvent = z.infer<typeof DivergenceEventSchema>;
export type ReplayCoverage = z.infer<typeof ReplayCoverageSchema>;

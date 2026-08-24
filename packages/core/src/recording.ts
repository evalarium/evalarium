import { z } from 'zod';

import { InputEventSchema } from './events.js';
import { NormalizationRulesSchema } from './normalization.js';
import { StorageSnapshotSchema } from './storage.js';

export const EVALREC_SCHEMA_VERSION = 2 as const;

export const HeaderMapSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);

export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive(),
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  targetUrl: z.url(),
  startedAt: z.number().int().nonnegative(),
  userAgent: z.string().min(1),
  viewport: ViewportSchema,
  normalizationRules: NormalizationRulesSchema,
});

export const CAPTURE_PHASE = {
  PREPARE: 'prepare',
  REPLAY: 'replay',
} as const;

export type CapturePhase = (typeof CAPTURE_PHASE)[keyof typeof CAPTURE_PHASE];

export const RequestTimingSchema = z.object({
  startedAt: z.number().nonnegative(),
  headersAt: z.number().nonnegative(),
  completedAt: z.number().nonnegative(),
});

export const RecordedRequestSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  method: z.string().min(1),
  url: z.url(),
  normalizedUrl: z.url(),
  graphqlOperation: z.string().nullable(),
  capturePhase: z.enum([CAPTURE_PHASE.PREPARE, CAPTURE_PHASE.REPLAY]),
  requestHeaders: HeaderMapSchema,
  requestBodyHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  status: z.number().int().min(100).max(599),
  responseHeaders: HeaderMapSchema,
  responseBodyHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  timing: RequestTimingSchema,
});

export const EvalrecDataSchema = z.object({
  schemaVersion: z.literal(EVALREC_SCHEMA_VERSION),
  session: SessionSchema,
  requests: z.array(RecordedRequestSchema),
  events: z.array(InputEventSchema),
  storageSnapshots: z.array(StorageSnapshotSchema),
});

export type HeaderMap = z.infer<typeof HeaderMapSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type RequestTiming = z.infer<typeof RequestTimingSchema>;
export type RecordedRequest = z.infer<typeof RecordedRequestSchema>;
export type EvalrecData = z.infer<typeof EvalrecDataSchema>;

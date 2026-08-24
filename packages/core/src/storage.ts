import { z } from 'zod';

export const StorageEntrySchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const OriginStorageSchema = z.object({
  origin: z.url(),
  entries: z.array(StorageEntrySchema),
});

export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(['Strict', 'Lax', 'None']),
});

export const STORAGE_SNAPSHOT_PHASE = {
  INITIAL: 'initial',
  FINAL: 'final',
} as const;

export type StorageSnapshotPhase =
  (typeof STORAGE_SNAPSHOT_PHASE)[keyof typeof STORAGE_SNAPSHOT_PHASE];

export const StorageSnapshotSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  phase: z.enum([STORAGE_SNAPSHOT_PHASE.INITIAL, STORAGE_SNAPSHOT_PHASE.FINAL]),
  url: z.url(),
  capturedAt: z.number().int().nonnegative(),
  cookies: z.array(CookieSchema),
  localStorage: z.array(OriginStorageSchema),
  sessionStorage: z.array(OriginStorageSchema),
  indexedDb: z.null(),
});

export type StorageEntry = z.infer<typeof StorageEntrySchema>;
export type OriginStorage = z.infer<typeof OriginStorageSchema>;
export type Cookie = z.infer<typeof CookieSchema>;
export type StorageSnapshot = z.infer<typeof StorageSnapshotSchema>;

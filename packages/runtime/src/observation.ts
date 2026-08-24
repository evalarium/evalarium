import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { sha256, stableStringify } from '@evalarium/core';
import type { Page } from 'playwright-core';

import { serializeDomInPage } from './dom-serialization.js';
import type { Observation } from './types.js';

let debugObservationCounter = 0;

const debugDumpDom = (serializedDom: string): void => {
  const directory = process.env.EVALARIUM_DEBUG_DOM_DIR;
  if (directory === undefined || directory === '') {
    return;
  }
  mkdirSync(directory, { recursive: true });
  debugObservationCounter += 1;
  writeFileSync(
    path.join(
      directory,
      `dom-${String(debugObservationCounter).padStart(4, '0')}.txt`,
    ),
    serializedDom,
  );
};

export const observePage = async (page: Page): Promise<Observation> => {
  // Let in-flight images finish decoding so avatar placeholders do not
  // race the observation.
  await page
    .waitForFunction(
      () => [...document.images].every((image) => image.complete),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  const [title, a11ySnapshot, serializedDom] = await Promise.all([
    page.title(),
    page.ariaSnapshot(),
    page.evaluate(serializeDomInPage),
  ]);
  debugDumpDom(serializedDom);
  return {
    url: page.url(),
    title,
    a11ySnapshot,
    domDigest: sha256(serializedDom),
  };
};

export const hashObservationStream = (
  observations: readonly Observation[],
): string => sha256(stableStringify(observations));

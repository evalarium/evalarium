import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const bundlePath = fileURLToPath(
  new URL('../dist/shim.global.js', import.meta.url),
);

describe('shim IIFE', () => {
  it('contains no runtime imports or requires', async () => {
    const bundle = await readFile(bundlePath, 'utf8');

    expect(bundle).not.toMatch(/\brequire\s*\(/u);
    expect(bundle).not.toMatch(/\bimport\s/u);
  });
});

import { defineConfig } from 'tsup';

export default defineConfig({
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  dts: false,
  entry: ['src/index.ts'],
  external: [
    '@anthropic-ai/sdk',
    '@evalarium/runtime',
    '@evalarium/verify',
    'commander',
  ],
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
});

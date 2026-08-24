import { defineConfig } from 'tsup';

export default defineConfig({
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  dts: false,
  entry: ['src/index.ts'],
  external: [
    '@evalarium/capture',
    '@evalarium/compiler',
    '@evalarium/core',
    '@evalarium/proxy',
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

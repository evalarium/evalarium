import { defineConfig } from 'tsup';

export default defineConfig({
  clean: false,
  dts: true,
  entry: ['src/server/index.ts'],
  external: ['@evalarium/core'],
  format: ['esm'],
  outDir: 'dist/server',
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
});

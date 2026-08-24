import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  external: ['better-sqlite3'],
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
});

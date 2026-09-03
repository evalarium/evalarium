import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/bin.ts'],
  external: ['@evalarium/core', '@evalarium/runtime'],
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
});

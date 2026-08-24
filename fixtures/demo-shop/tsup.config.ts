import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    'server/index': 'src/server/index.ts',
    'scripts/record': 'scripts/record.ts',
    'tasks/find-price.task': 'tasks/find-price.task.ts',
    'tasks/checkout.task': 'tasks/checkout.task.ts',
  },
  external: ['@evalarium/verify', 'express'],
  format: ['esm'],
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
});

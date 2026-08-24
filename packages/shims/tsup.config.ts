import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: false,
  entry: { shim: 'src/shim.ts' },
  format: ['iife'],
  globalName: 'EvalariumShim',
  minify: false,
  platform: 'browser',
  sourcemap: false,
  splitting: false,
  target: 'es2022',
});

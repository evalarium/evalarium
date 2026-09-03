import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const INSPECTOR_PORT = 5176;

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist/client',
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  preview: {
    port: INSPECTOR_PORT,
    strictPort: true,
  },
  server: {
    port: INSPECTOR_PORT,
    strictPort: true,
  },
});

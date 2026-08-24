import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const HUB_PORT = 5173;

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  preview: {
    port: HUB_PORT,
    strictPort: true,
  },
  server: {
    port: HUB_PORT,
    strictPort: true,
  },
});

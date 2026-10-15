import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 inlines everything (JS, worker, CSS) into one index.html for the artifact build.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100000000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));

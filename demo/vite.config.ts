import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // demo/ is the root — Vite looks for index.html here
  root: resolve(__dirname, '.'),

  publicDir: resolve(__dirname, 'public'),

  resolve: {
    alias: {
      // Resolve the library from source so no build step is required
      'geospatial-audio-js': resolve(__dirname, '../src/index.ts'),
    },
  },
});

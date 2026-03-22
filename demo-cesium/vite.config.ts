import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // demo-cesium/ is the root — Vite looks for index.html here
  root: resolve(__dirname, '.'),

  // Reuse the same audio assets as the MapLibre demo
  publicDir: resolve(__dirname, '../demo/public'),

  resolve: {
    alias: {
      // Resolve the library from source so no build step is required
      'geospatial-audio-js': resolve(__dirname, '../src/index.ts'),
    },
  },
});

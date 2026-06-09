import { defineConfig } from 'vite';
import { resolve } from 'path';

// Prototype demo for the Doppler effect on the Cesium adapter.
// (Intentionally not referenced from the docs — experimental.)
export default defineConfig({
  root: resolve(__dirname, '.'),

  // Reuse the same audio assets as the MapLibre / Cesium demos
  publicDir: resolve(__dirname, '../demo/public'),

  resolve: {
    alias: {
      // Resolve the library from source so no build step is required
      'geospatial-audio-js': resolve(__dirname, '../src/index.ts'),
    },
  },
});

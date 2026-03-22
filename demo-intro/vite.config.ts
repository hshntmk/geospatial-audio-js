import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '.'),
  publicDir: resolve(__dirname, '../demo/public'),
  resolve: {
    alias: {
      'geospatial-audio-js': resolve(__dirname, '../src/index.ts'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ insertTypesEntry: true }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GeospatialAudio',
      fileName: 'geospatial-audio-js',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['maplibre-gl'],
      output: {
        globals: {
          'maplibre-gl': 'maplibregl',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
});

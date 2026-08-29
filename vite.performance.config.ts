import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

export default mergeConfig(baseConfig, defineConfig({
  build: {
    outDir: '.perf-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        g6: resolve(__dirname, 'benchmarks/g6.html'),
      },
    },
  },
}));

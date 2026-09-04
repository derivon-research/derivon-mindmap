import { resolve } from 'node:path';
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import baseConfig from './vite.config';

const base = baseConfig as (env: ConfigEnv) => UserConfig;

export default defineConfig((env) => mergeConfig(base(env), {
  build: {
    outDir: '.perf-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        // The benchmarks still drive the v0.4.2 application, which keeps its measurements
        // comparable while the rewrite is empty. #56 removes this entry with the old form.
        legacy: resolve(__dirname, 'legacy.html'),
        g6: resolve(__dirname, 'benchmarks/g6.html'),
      },
    },
  },
}));

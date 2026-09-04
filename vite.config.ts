import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/',
  plugins: [react()],
  clearScreen: false,
  build: {
    manifest: true,
  },
  optimizeDeps: {
    exclude: ['@antv/g6'],
    include: ['color-string', 'eventemitter3', 'svg-path-parser'],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});

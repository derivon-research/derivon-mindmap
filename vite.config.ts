import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `--mode desktop` builds the desktop host, anything else builds the web host. The mode
 * picks which module `#host` resolves to, and that single edge decides what the bundle
 * can contain: only the desktop host module references `src/modes/authoring/`, so a web
 * build has no path to the authoring side at all.
 */
function hostEntry(mode: string): string {
  return resolve(__dirname, mode === 'desktop' ? 'src/hosts/desktop/host.ts' : 'src/hosts/web/host.ts');
}

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react()],
  clearScreen: false,
  // One cache per host build. Sharing it lets a desktop dev server re-optimize under a
  // running web dev server, which force-reloads whatever that one is serving.
  cacheDir: mode === 'desktop' ? 'node_modules/.vite-desktop' : 'node_modules/.vite',
  resolve: {
    alias: {
      '#host': hostEntry(mode),
    },
  },
  build: {
    manifest: true,
  },
  optimizeDeps: {
    // Both entries are scanned up front. Without the legacy entry the dev server first
    // meets its dependencies on navigation and force-reloads the page mid-test.
    entries: ['index.html', 'legacy.html'],
    exclude: ['@antv/g6'],
    // Dependencies the scanner cannot see: reached from a worker or from the excluded G6.
    // Discovering them on navigation force-reloads the page. `@dagrejs/dagre` and
    // `d3-force` belong to the v0.4.2 form and go away with it (#56).
    include: ['color-string', 'eventemitter3', 'svg-path-parser', '@dagrejs/dagre', 'd3-force'],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
}));

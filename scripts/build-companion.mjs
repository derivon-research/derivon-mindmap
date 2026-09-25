import { build } from 'esbuild';

await build({
  entryPoints: ['src/companion/index.ts'],
  outfile: 'dist-companion/companion.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  target: 'node24',
  legalComments: 'none',
  define: {
    // The Pi SDK configures its extension loader from this flag: with it, extension modules are
    // resolved against the packages embedded in this bundle; without it, the loader goes looking
    // for `typebox`, the Pi packages and their dependencies on disk. The bundle ships as one file
    // beside the Node runtime and no `node_modules`, so without the flag an extension that imports
    // anything from the SDK would load on the build machine and fail in the installed application.
    PI_BUNDLED_NODE: 'true',
  },
});

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
  target: 'node22',
  legalComments: 'none',
});

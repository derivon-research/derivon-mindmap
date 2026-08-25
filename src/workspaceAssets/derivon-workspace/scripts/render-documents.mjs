#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = `Usage:
  node render-documents.mjs [--write] [--runtime <project>] <workspace> [object-id-or-document ...]

Without --write, the command reports source/publication drift without changing files.
The runtime project must provide marked and marked-katex-extension.`;

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const runtimeIndex = argv.indexOf('--runtime');
const runtimeRoot = runtimeIndex >= 0 ? argv[runtimeIndex + 1] : process.env.DERIVON_RUNTIME_ROOT || process.cwd();
if (runtimeIndex >= 0) argv.splice(runtimeIndex, 2);
const positional = argv.filter((value) => value !== '--write');
if (positional.includes('--help') || positional.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const workspaceRoot = resolve(positional.shift() || '.');
const selectors = new Set(positional.map((value) => value.replace(/\/$/, '')));
const manifestPath = resolve(workspaceRoot, '.derivon/workspace.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.graph || !Array.isArray(manifest.graph.points) || !Array.isArray(manifest.graph.hyperedges)) {
  throw new Error(`Invalid Derivon manifest: ${manifestPath}`);
}

let Marked;
let markedKatex;
try {
  const runtimeRequire = createRequire(resolve(runtimeRoot, 'package.json'));
  ({ Marked } = runtimeRequire('marked'));
  markedKatex = runtimeRequire('marked-katex-extension');
} catch (error) {
  console.error(`Cannot load Markdown runtime from ${resolve(runtimeRoot)}.`);
  console.error('Pass --runtime <project> pointing to a project with marked and marked-katex-extension installed.');
  throw error;
}

const renderer = new Marked(
  { gfm: true },
  markedKatex({ throwOnError: false, strict: false }),
);
const defaultStyle = `:root { color: #202422; background: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { max-width: 820px; margin: 0 auto; padding: 32px; line-height: 1.7; }
h1, h2, h3 { line-height: 1.3; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { overflow: auto; padding: 12px; background: #f4f5f2; }
blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #799084; color: #5d6761; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 7px 9px; border: 1px solid #d5d8d3; text-align: left; }
img { max-width: 100%; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
button, input, select, textarea { font: inherit; }`;

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderDocument(markdown, title) {
  const body = String(renderer.parse(markdown, { async: false })).trim();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/katex.min.css" crossorigin="anonymous">
  <style>
${defaultStyle.split('\n').map((line) => `    ${line}`).join('\n')}
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

const objects = [
  ...manifest.graph.points.map((point) => ({
    id: point.id,
    title: point.data?.label || point.id,
    document: point.data?.document,
    format: point.data?.format,
  })),
  ...manifest.graph.hyperedges.map((edge) => ({
    id: edge.id,
    title: `\u63a8\u5bfc ${edge.id}`,
    document: edge.data?.document,
    format: edge.data?.format,
  })),
].filter((object) => object.format === 'markdown' && typeof object.document === 'string');

const selected = selectors.size === 0
  ? objects
  : objects.filter((object) => selectors.has(object.id)
    || selectors.has(object.document)
    || selectors.has(object.document.split('/').at(-1)));
if (selected.length === 0) throw new Error('No matching Markdown documents.');

let drift = 0;
for (const object of selected) {
  const sourcePath = resolve(workspaceRoot, object.document, 'document.md');
  const publicationPath = resolve(workspaceRoot, object.document, 'index.html');
  const markdown = await readFile(sourcePath, 'utf8');
  const expected = renderDocument(markdown, object.title);
  let current = null;
  try {
    current = await readFile(publicationPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (current === expected) {
    console.log(`ok     ${object.document}`);
  } else if (write) {
    await writeFile(publicationPath, expected);
    console.log(`wrote  ${object.document}`);
  } else {
    drift += 1;
    console.log(`drift  ${object.document}`);
  }
}

if (drift > 0) {
  console.error(`${drift} publication(s) differ from their Markdown source. Re-run with --write after review.`);
  process.exitCode = 1;
}

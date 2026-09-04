#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// 250,000 bytes is webpack's conventional built-in 244 KiB single-resource budget.
// Changing this limit requires an explicit human product/performance decision.
const INITIAL_JS_BUDGET_BYTES = 250_000;

function formatBytes(bytes) {
  return bytes < 1_000 ? `${bytes} B` : `${(bytes / 1_000).toFixed(2)} kB`;
}

function collectInitialManifestKeys(manifest) {
  const initialKeys = new Set();
  const pending = Object.entries(manifest)
    .filter(([, chunk]) => chunk.isEntry)
    .map(([key]) => key);

  if (pending.length === 0) {
    throw new Error('Vite manifest contains no entry chunks');
  }

  while (pending.length > 0) {
    const key = pending.pop();
    if (initialKeys.has(key)) continue;

    const chunk = manifest[key];
    if (!chunk) {
      throw new Error(`Vite manifest references missing static import: ${key}`);
    }

    initialKeys.add(key);
    pending.push(...(chunk.imports ?? []));
  }

  return initialKeys;
}

async function listJavaScriptFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath, root);
    if (!entry.isFile() || !entry.name.endsWith('.js')) return [];
    return [path.relative(root, entryPath).split(path.sep).join('/')];
  }));
  return nestedFiles.flat();
}

async function checkInitialJsBudget(distDirectory) {
  const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const initialKeys = collectInitialManifestKeys(manifest);
  const initialFiles = new Set([...initialKeys].map((key) => manifest[key].file));
  const javascriptFiles = await listJavaScriptFiles(distDirectory);

  const chunks = await Promise.all(javascriptFiles.map(async (file) => ({
    classification: initialFiles.has(file) ? 'INITIAL' : 'LAZY',
    file,
    gzipBytes: gzipSync(await readFile(path.join(distDirectory, file))).byteLength,
  })));
  chunks.sort((left, right) => left.classification.localeCompare(right.classification)
    || left.file.localeCompare(right.file));

  console.log(`Initial JavaScript budget: ${formatBytes(INITIAL_JS_BUDGET_BYTES)} gzip`);
  for (const chunk of chunks) {
    console.log(`${chunk.classification.padEnd(7)} ${formatBytes(chunk.gzipBytes).padStart(10)}  ${chunk.file}`);
  }

  const initialBytes = chunks
    .filter((chunk) => chunk.classification === 'INITIAL')
    .reduce((total, chunk) => total + chunk.gzipBytes, 0);
  const difference = INITIAL_JS_BUDGET_BYTES - initialBytes;
  console.log(`Initial total: ${formatBytes(initialBytes)} gzip`);

  if (difference >= 0) {
    console.log(`Within budget by: ${formatBytes(difference)} gzip`);
    return;
  }

  console.log(`Over budget by: ${formatBytes(-difference)} gzip`);
  console.error('Initial JavaScript exceeds its configured gzip budget.');
  process.exitCode = 1;
}

const distDirectory = path.resolve(process.argv[2] ?? 'dist');
checkInitialJsBudget(distDirectory).catch((error) => {
  console.error(`Initial JavaScript budget check failed: ${error.message}`);
  process.exitCode = 1;
});

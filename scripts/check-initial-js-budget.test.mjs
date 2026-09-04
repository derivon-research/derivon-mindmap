import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-initial-js-budget.mjs');
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createBuild(manifest, files) {
  const distDirectory = await mkdtemp(path.join(os.tmpdir(), 'initial-js-budget-'));
  temporaryDirectories.push(distDirectory);
  await mkdir(path.join(distDirectory, '.vite'), { recursive: true });
  await writeFile(path.join(distDirectory, '.vite', 'manifest.json'), JSON.stringify(manifest));

  await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
    const outputPath = path.join(distDirectory, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents);
  }));

  return distDirectory;
}

function runBudgetCheck(distDirectory) {
  return spawnSync(process.execPath, [scriptPath, distDirectory], { encoding: 'utf8' });
}

test('reports the entry static import closure as initial and dynamic chunks as lazy', async () => {
  const distDirectory = await createBuild({
    'src/main.ts': {
      file: 'assets/index.js',
      isEntry: true,
      imports: ['_shared.js'],
      dynamicImports: ['src/editor.ts'],
    },
    '_shared.js': {
      file: 'assets/shared.js',
    },
    'src/editor.ts': {
      file: 'assets/editor.js',
      isDynamicEntry: true,
      imports: ['_editor-shared.js'],
    },
    '_editor-shared.js': {
      file: 'assets/editor-shared.js',
    },
  }, {
    'assets/index.js': 'console.log("entry")',
    'assets/shared.js': 'export const shared = true',
    'assets/editor.js': 'console.log("editor")',
    'assets/editor-shared.js': 'export const editorShared = true',
    'assets/layout.worker.js': 'self.onmessage = () => undefined',
  });

  const result = runBudgetCheck(distDirectory);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /INITIAL\s+\d+ B\s+assets\/index\.js/);
  assert.match(result.stdout, /INITIAL\s+\d+ B\s+assets\/shared\.js/);
  assert.match(result.stdout, /LAZY\s+\d+ B\s+assets\/editor\.js/);
  assert.match(result.stdout, /LAZY\s+\d+ B\s+assets\/editor-shared\.js/);
  assert.match(result.stdout, /LAZY\s+\d+ B\s+assets\/layout\.worker\.js/);
  assert.match(result.stdout, /Initial total:\s+\d+ B gzip/);
  assert.match(result.stdout, /Within budget by:/);
});

test('exits nonzero and reports how far an initial chunk exceeds the budget', async () => {
  const distDirectory = await createBuild({
    'src/main.ts': {
      file: 'assets/index.js',
      isEntry: true,
    },
  }, {
    'assets/index.js': randomBytes(1_000_000),
  });

  const result = runBudgetCheck(distDirectory);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Initial JavaScript budget: \d+\.\d+ kB gzip/);
  assert.match(result.stdout, /INITIAL\s+\d+\.\d+ kB\s+assets\/index\.js/);
  assert.match(result.stdout, /Over budget by:\s+\d+\.\d+ kB gzip/);
  assert.match(result.stderr, /Initial JavaScript exceeds its configured gzip budget/);
});

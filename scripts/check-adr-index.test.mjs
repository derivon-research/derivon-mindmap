import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const adrDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'adr');

async function readIndexLinks() {
  const readme = await readFile(path.join(adrDirectory, 'README.md'), 'utf8');
  const indexSection = readme.split('\n## Index\n')[1]?.split('\n## ')[0];
  assert.ok(indexSection, 'docs/adr/README.md has no "## Index" section');
  return [...indexSection.matchAll(/^\| \[(\d{4})\]\(([^)]+)\) \|/gm)].map(([, number, file]) => ({ number, file }));
}

test('every ADR has exactly one index row, and every row points at an ADR', async () => {
  const files = (await readdir(adrDirectory)).filter((file) => /^\d{4}-.+\.md$/.test(file)).sort();
  const links = await readIndexLinks();

  assert.deepEqual(links.map(({ file }) => file).sort(), files);
  for (const { number, file } of links) {
    assert.ok(file.startsWith(`${number}-`), `index row ${number} links ${file}`);
  }
});

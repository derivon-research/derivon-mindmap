#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = `Usage:
  node audit-workspace-artifacts.mjs [--json] <workspace>

Reports unowned document directories, ownership problems, workspace-local helper
files, and common scratch artifacts. It never deletes or changes files.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const json = argv.includes('--json');
const positional = argv.filter((value) => value !== '--json');
if (positional.length > 1) throw new Error(usage);
const workspaceRoot = resolve(positional[0] || '.');
const manifest = JSON.parse(await readFile(resolve(workspaceRoot, '.derivon/workspace.json'), 'utf8'));
const points = manifest.graph?.points;
const hyperedges = manifest.graph?.hyperedges;
if (!Array.isArray(points) || !Array.isArray(hyperedges)) {
  throw new Error('Invalid Derivon manifest: expected graph.points and graph.hyperedges arrays.');
}

const normalizePath = (value) => String(value)
  .replaceAll('\\', '/')
  .replace(/^\.\/+/, '')
  .replace(/\/+$/, '');
const owners = new Map();
for (const object of [
  ...points.map((point) => ({ kind: 'point', id: point.id, document: point.data?.document })),
  ...hyperedges.map((edge) => ({ kind: 'hyperedge', id: edge.id, document: edge.data?.document })),
]) {
  if (typeof object.document !== 'string' || object.document.trim() === '') continue;
  const document = normalizePath(object.document);
  if (!owners.has(document)) owners.set(document, []);
  owners.get(document).push({ kind: object.kind, id: object.id });
}

const duplicateDocumentOwners = [...owners.entries()]
  .filter(([, documentOwners]) => documentOwners.length > 1)
  .map(([document, documentOwners]) => ({ document, owners: documentOwners }));
const missingDocumentDirectories = [];
for (const document of owners.keys()) {
  try {
    const info = await stat(resolve(workspaceRoot, document));
    if (!info.isDirectory()) missingDocumentDirectories.push(document);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    missingDocumentDirectories.push(document);
  }
}

let documentEntries = [];
try {
  documentEntries = await readdir(resolve(workspaceRoot, 'docs'), { withFileTypes: true });
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const ownedDocuments = [...owners.keys()];
const unownedDocumentDirectories = documentEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => `docs/${entry.name}`)
  .filter((directory) => !ownedDocuments.some((document) => document === directory || document.startsWith(`${directory}/`)))
  .sort();

const managedDerivonEntries = new Set(['agent', 'tmp', 'vendor', 'workspace.json']);
let derivonEntries = [];
try {
  derivonEntries = await readdir(resolve(workspaceRoot, '.derivon'), { withFileTypes: true });
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const workspaceHelperCandidates = derivonEntries
  .filter((entry) => !managedDerivonEntries.has(entry.name))
  .map((entry) => `.derivon/${entry.name}${entry.isDirectory() ? '/' : ''}`)
  .sort();

const scratchArtifactPattern = /(?:^\.DS_Store$|\.(?:bak|swo|swp|tmp)$|~$)/i;
const scratchArtifacts = [];
async function scan(directory, relative = '') {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return;
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await scan(resolve(directory, entry.name), entryRelative);
    } else if (entryRelative.startsWith('.derivon/tmp/') || scratchArtifactPattern.test(entry.name)) {
      scratchArtifacts.push(entryRelative);
    }
  }
}
await scan(workspaceRoot);
scratchArtifacts.sort();

const errors = [];
if (duplicateDocumentOwners.length) errors.push(`${duplicateDocumentOwners.length} document director${duplicateDocumentOwners.length === 1 ? 'y has' : 'ies have'} multiple owners`);
if (missingDocumentDirectories.length) errors.push(`${missingDocumentDirectories.length} owned document director${missingDocumentDirectories.length === 1 ? 'y is' : 'ies are'} missing`);
const reviewSignals = [];
if (unownedDocumentDirectories.length) reviewSignals.push(`${unownedDocumentDirectories.length} document director${unownedDocumentDirectories.length === 1 ? 'y has' : 'ies have'} no manifest owner`);
if (workspaceHelperCandidates.length) reviewSignals.push(`${workspaceHelperCandidates.length} workspace-local helper artifact(s) need an explicit keep, migrate, or remove decision`);
if (scratchArtifacts.length) reviewSignals.push(`${scratchArtifacts.length} common scratch artifact(s) remain`);

const report = {
  ownedDocumentDirectories: owners.size,
  unownedDocumentDirectories,
  missingDocumentDirectories,
  duplicateDocumentOwners,
  workspaceHelperCandidates,
  scratchArtifacts,
  errors,
  reviewSignals,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`owned docs  ${report.ownedDocumentDirectories}`);
  console.log(`unowned     ${unownedDocumentDirectories.length}`);
  for (const item of unownedDocumentDirectories) console.log(`             ${item}`);
  console.log(`missing     ${missingDocumentDirectories.length}`);
  for (const item of missingDocumentDirectories) console.log(`             ${item}`);
  console.log(`duplicates  ${duplicateDocumentOwners.length}`);
  for (const item of duplicateDocumentOwners) console.log(`             ${item.document}`);
  console.log(`helpers     ${workspaceHelperCandidates.length}`);
  for (const item of workspaceHelperCandidates) console.log(`             ${item}`);
  console.log(`scratch     ${scratchArtifacts.length}`);
  for (const item of scratchArtifacts) console.log(`             ${item}`);
  for (const signal of reviewSignals) console.log(`review      ${signal}`);
  for (const error of errors) console.log(`error       ${error}`);
}

if (errors.length) process.exitCode = 1;

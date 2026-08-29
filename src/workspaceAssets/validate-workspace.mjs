#!/usr/bin/env node
// managed-by: derivon-mindmap-demo

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const reviewFlag = args.indexOf('--review');
const reviewId = reviewFlag >= 0 ? args[reviewFlag + 1] : undefined;
const rootArg = args.find((argument, index) =>
  !argument.startsWith('-') && (reviewFlag < 0 || index !== reviewFlag + 1),
) ?? '.';
const inventory = args.includes('--inventory');
const root = path.resolve(rootArg);
const manifestPath = path.join(root, '.derivon', 'workspace.json');
const issues = [];

function report(location, message) {
  issues.push(`${location}: ${message}`);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUnknownKeys(value, allowed, location) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) report(`${location}.${key}`, 'field is not part of the mathematical model');
  }
}

function sourcePath(object) {
  return object.data.format === 'markdown'
    ? `${object.data.document}/document.md`
    : `${object.data.document}/index.html`;
}

async function requireFile(relativePath, location) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    report(location, `missing file ${relativePath}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${manifestPath}: ${error.message}`);
  process.exit(1);
}

if (manifest.schema !== 'derivon.authoring/v0.3.0') report('schema', 'expected derivon.authoring/v0.3.0');
if (!isObject(manifest.document)) report('document', 'expected metadata object');
else {
  reportUnknownKeys(manifest.document, new Set(['title', 'description']), 'document');
  if (typeof manifest.document.title !== 'string') report('document.title', 'expected string');
  if (typeof manifest.document.description !== 'string') report('document.description', 'expected string');
}
if (!isObject(manifest.graph)) report('graph', 'expected graph object');
else reportUnknownKeys(manifest.graph, new Set(['points', 'hyperedges']), 'graph');
if (!isObject(manifest.view)) report('view', 'expected view object');
else reportUnknownKeys(manifest.view, new Set(['replacements']), 'view');

const points = Array.isArray(manifest.graph?.points) ? manifest.graph.points : [];
const hyperedges = Array.isArray(manifest.graph?.hyperedges) ? manifest.graph.hyperedges : [];
if (!Array.isArray(manifest.graph?.points)) report('graph.points', 'expected array');
if (!Array.isArray(manifest.graph?.hyperedges)) report('graph.hyperedges', 'expected array');

const pointIds = new Set();
const objectIds = new Set();
const documentOwners = new Map();

for (const [index, point] of points.entries()) {
  const location = `graph.points[${index}]`;
  if (!isObject(point) || typeof point.id !== 'string' || !point.id.trim()) {
    report(location, 'expected point with non-empty string ID');
    continue;
  }
  reportUnknownKeys(point, new Set(['id', 'data']), location);
  if (objectIds.has(point.id)) report(`${location}.id`, `duplicate object ID ${point.id}`);
  objectIds.add(point.id);
  pointIds.add(point.id);
  if (!isObject(point.data) || typeof point.data.label !== 'string') report(`${location}.data`, 'expected label and document reference');
}

for (const [index, edge] of hyperedges.entries()) {
  const location = `graph.hyperedges[${index}]`;
  if (!isObject(edge) || typeof edge.id !== 'string' || !edge.id.trim()) {
    report(location, 'expected hyperedge with non-empty string ID');
    continue;
  }
  reportUnknownKeys(edge, new Set(['id', 'weight', 'tails', 'head', 'data']), location);
  if (objectIds.has(edge.id)) report(`${location}.id`, `duplicate object ID ${edge.id}`);
  objectIds.add(edge.id);
  const scaledWeight = Math.round(edge.weight * 10);
  if (
    typeof edge.weight !== 'number'
    || !Number.isFinite(edge.weight)
    || edge.weight < 0
    || !Number.isSafeInteger(scaledWeight)
    || Math.abs(edge.weight - scaledWeight / 10) >= 1e-10
  ) report(`${location}.weight`, 'expected a non-negative finite number with at most one decimal place');
  if (!Array.isArray(edge.tails)) report(`${location}.tails`, 'expected array');
  else {
    if (new Set(edge.tails).size !== edge.tails.length) report(`${location}.tails`, 'contains duplicate point IDs');
    for (const tail of edge.tails) if (!pointIds.has(tail)) report(`${location}.tails`, `unknown point ${tail}`);
  }
  if (!pointIds.has(edge.head)) report(`${location}.head`, `unknown point ${edge.head}`);
}

for (const [kind, objects] of [['points', points], ['hyperedges', hyperedges]]) {
  for (const [index, object] of objects.entries()) {
    const location = `graph.${kind}[${index}].data`;
    const data = object?.data;
    if (!isObject(data) || typeof data.document !== 'string' || !['markdown', 'html'].includes(data.format)) {
      report(location, 'expected document directory and markdown/html format');
      continue;
    }
    const directory = data.document;
    const parts = directory.split('/');
    if (
      path.isAbsolute(directory)
      || directory.includes('\\')
      || parts.length < 2
      || parts[0] === '.derivon'
      || /\.(md|html)$/i.test(directory)
      || parts.some((part) => !part || part === '.' || part === '..')
    ) {
      report(`${location}.document`, 'expected a safe workspace-relative document directory');
      continue;
    }
    if (documentOwners.has(directory)) report(`${location}.document`, `also owned by ${documentOwners.get(directory)}`);
    else documentOwners.set(directory, object.id);
    await requireFile(`${directory}/index.html`, location);
    if (data.format === 'markdown') await requireFile(`${directory}/document.md`, location);
  }
}

const replacements = manifest.view?.replacements;
if (!Array.isArray(replacements)) report('view.replacements', 'expected array');
else {
  const replacementTargets = new Set();
  const ownerByPoint = new Map();
  for (const [index, replacement] of replacements.entries()) {
    const location = `view.replacements[${index}]`;
    if (!isObject(replacement)) {
      report(location, 'expected object');
      continue;
    }
    if (typeof replacement.replaceWith !== 'string' || !pointIds.has(replacement.replaceWith)) {
      report(`${location}.replaceWith`, 'expected an existing point ID');
    } else if (replacementTargets.has(replacement.replaceWith)) {
      report(`${location}.replaceWith`, 'point is already the result of another replacement');
    } else replacementTargets.add(replacement.replaceWith);

    if (!Array.isArray(replacement.points) || !replacement.points.length) {
      report(`${location}.points`, 'expected at least one point ID');
    } else {
      if (new Set(replacement.points).size !== replacement.points.length) report(`${location}.points`, 'contains duplicate point IDs');
      for (const id of replacement.points) {
        if (!pointIds.has(id)) report(`${location}.points`, `unknown point ${id}`);
        else if (id === replacement.replaceWith) report(`${location}.points`, 'result point cannot also be replaced');
        else if (ownerByPoint.has(id)) report(`${location}.points`, `point already belongs to replacement ${ownerByPoint.get(id)}`);
        else if (typeof replacement.replaceWith === 'string') ownerByPoint.set(id, replacement.replaceWith);
      }
    }
    if (!['points', 'replacement'].includes(replacement.show)) report(`${location}.show`, 'expected points or replacement');
  }

  for (const target of replacementTargets) {
    let cursor = target;
    const visited = new Set();
    while (ownerByPoint.has(cursor)) {
      if (visited.has(cursor)) {
        report('view.replacements', `replacement cycle contains ${cursor}`);
        break;
      }
      visited.add(cursor);
      cursor = ownerByPoint.get(cursor);
    }
  }
}

if (issues.length) {
  console.error(`Derivon workspace has ${issues.length} error(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Derivon workspace is valid: ${points.length} concept(s), ${hyperedges.length} derivation(s).`);

if (inventory) {
  console.log('\nConcepts:');
  for (const point of points) console.log(`- ${point.id}: ${JSON.stringify(point.data.label)} [${sourcePath(point)}]`);
  console.log('\nDerivations:');
  for (const edge of hyperedges) {
    const premises = edge.tails.length ? edge.tails.join(' & ') : 'empty';
    console.log(`- ${edge.id}: (${premises}) -> ${edge.head}; weight=${edge.weight} [${sourcePath(edge)}]`);
  }
}

if (reviewFlag >= 0) {
  if (!reviewId || reviewId.startsWith('-')) {
    console.error('\n--review requires a hyperedge ID.');
    process.exit(2);
  }
  const edge = hyperedges.find((candidate) => candidate.id === reviewId);
  if (!edge) {
    console.error(`\nUnknown hyperedge: ${reviewId}`);
    process.exit(2);
  }
  const byId = new Map(points.map((point) => [point.id, point]));
  console.log(`\nReview bundle for ${edge.id}:`);
  if (edge.tails.length) {
    for (const id of edge.tails) {
      const point = byId.get(id);
      console.log(`- premise ${id} (${point.data.label}): ${sourcePath(point)}`);
    }
  } else console.log('- premises: none (unconditional derivation)');
  console.log(`- derivation ${edge.id}: ${sourcePath(edge)}`);
  const head = byId.get(edge.head);
  console.log(`- conclusion ${head.id} (${head.data.label}): ${sourcePath(head)}`);
}

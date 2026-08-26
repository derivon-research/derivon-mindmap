#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = `Usage:
  node audit-learning-graph.mjs [--json] <workspace>

Reports structural signals for reviewing a Derivon learning graph. It does not
change the workspace or decide semantic correctness.`;

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

const normalizeLabel = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ');
const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const entries = (map) => [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }));

const weightHistogram = new Map();
const tailSizeHistogram = new Map();
const incident = new Map(points.map((point) => [point.id, 0]));
const labelGroups = new Map();
const routeGroups = new Map();
const headGroups = new Map();
const highWeight = [];
const largeTails = [];

for (const point of points) {
  const label = normalizeLabel(point.data?.label);
  if (!labelGroups.has(label)) labelGroups.set(label, []);
  labelGroups.get(label).push(point.id);
}

for (const edge of hyperedges) {
  increment(weightHistogram, edge.weight);
  increment(tailSizeHistogram, edge.tails?.length ?? 0);
  if (edge.weight >= 4) highWeight.push({ id: edge.id, weight: edge.weight });
  if ((edge.tails?.length ?? 0) >= 6) largeTails.push({ id: edge.id, tails: edge.tails.length });
  if (incident.has(edge.head)) incident.set(edge.head, incident.get(edge.head) + 1);
  for (const tail of edge.tails || []) {
    if (incident.has(tail)) incident.set(tail, incident.get(tail) + 1);
  }
  const routeKey = JSON.stringify([...(edge.tails || [])].sort()) + ` -> ${edge.head}`;
  if (!routeGroups.has(routeKey)) routeGroups.set(routeKey, []);
  routeGroups.get(routeKey).push(edge.id);
  if (!headGroups.has(edge.head)) headGroups.set(edge.head, []);
  headGroups.get(edge.head).push(edge.id);
}

const duplicateLabels = [...labelGroups.entries()]
  .filter(([label, ids]) => label && ids.length > 1)
  .map(([label, ids]) => ({ label, ids }));
const parallelRoutes = [...routeGroups.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([route, ids]) => ({ route, ids }));
const alternativeHeads = [...headGroups.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([head, ids]) => ({ head, ids }));
const isolatedPoints = [...incident.entries()].filter(([, count]) => count === 0).map(([id]) => id);
const warnings = [];
if (hyperedges.length >= 5 && weightHistogram.size === 1) {
  warnings.push(`all ${hyperedges.length} hyperedges have weight ${weightHistogram.keys().next().value}`);
} else if (hyperedges.length >= 10) {
  const [dominantWeight, dominantCount] = [...weightHistogram.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominantCount / hyperedges.length >= 0.9) {
    warnings.push(`${dominantCount}/${hyperedges.length} hyperedges have weight ${dominantWeight}; calibration has little discrimination`);
  }
}
if (duplicateLabels.length) warnings.push(`${duplicateLabels.length} normalized label group(s) need identity review`);
if (isolatedPoints.length) warnings.push(`${isolatedPoints.length} point(s) are isolated`);
if (largeTails.length) warnings.push(`${largeTails.length} hyperedge(s) have at least 6 tails`);

const report = {
  points: points.length,
  hyperedges: hyperedges.length,
  weightHistogram: Object.fromEntries(entries(weightHistogram)),
  tailSizeHistogram: Object.fromEntries(entries(tailSizeHistogram)),
  duplicateLabels,
  parallelRoutes,
  alternativeHeads,
  isolatedPoints,
  highWeight,
  largeTails,
  warnings,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`points       ${report.points}`);
  console.log(`hyperedges  ${report.hyperedges}`);
  console.log(`weights     ${entries(weightHistogram).map(([weight, count]) => `${weight}:${count}`).join('  ') || 'none'}`);
  console.log(`tail sizes  ${entries(tailSizeHistogram).map(([size, count]) => `${size}:${count}`).join('  ') || 'none'}`);
  console.log(`parallel    ${parallelRoutes.length}`);
  console.log(`alternates  ${alternativeHeads.length}`);
  console.log(`high cost   ${highWeight.length}`);
  console.log(`isolated    ${isolatedPoints.length}`);
  for (const warning of warnings) console.log(`warning     ${warning}`);
}

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
const toTenths = (weight) => Math.round(weight * 10);
const formatTenths = (tenths) => (tenths / 10).toFixed(1);
const round = (value, places = 3) => Number(value.toFixed(places));

function distribution(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const variance = sorted.reduce((total, value) => total + ((value - mean) ** 2), 0) / sorted.length;
  return {
    min: round(sorted[0]),
    max: round(sorted.at(-1)),
    mean: round(mean),
    median: round(median),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

function dominantEntry(map, total) {
  if (total === 0) return null;
  const [value, count] = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  return { value, count, ratio: round(count / total) };
}

const weightHistogram = new Map();
const weightAnchorBands = new Map();
const weightValues = [];
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
  if (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight) || edge.weight < 0) {
    throw new Error(`Invalid weight on hyperedge ${edge.id}.`);
  }
  const weightTenths = toTenths(edge.weight);
  if (Math.abs((edge.weight * 10) - weightTenths) > 1e-9) {
    throw new Error(`Invalid weight on hyperedge ${edge.id}: expected at most one decimal place.`);
  }
  const normalizedWeight = weightTenths / 10;
  weightValues.push(normalizedWeight);
  increment(weightHistogram, formatTenths(weightTenths));
  increment(weightAnchorBands, Math.round(normalizedWeight));
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
const exactConcentration = dominantEntry(weightHistogram, hyperedges.length);
const anchorConcentration = dominantEntry(weightAnchorBands, hyperedges.length);
const reviewSignals = [];
if (hyperedges.length >= 5 && exactConcentration?.count === hyperedges.length) {
  reviewSignals.push(`weight concentration: all ${hyperedges.length} hyperedges have weight ${exactConcentration.value}. This may reflect consistently atomic granularity; do not change weights from distribution alone. The dataset has limited coverage for testing variable-weight routing.`);
} else if (hyperedges.length >= 10 && exactConcentration && exactConcentration.count / hyperedges.length >= 0.9) {
  reviewSignals.push(`weight concentration: ${exactConcentration.count}/${hyperedges.length} hyperedges have exact weight ${exactConcentration.value}. This may be intentional normalization or insufficient calibration; compare rationales and route behavior before changing values. The dataset has limited coverage for testing variable-weight routing.`);
} else if (hyperedges.length >= 10 && anchorConcentration && anchorConcentration.count / hyperedges.length >= 0.9) {
  reviewSignals.push(`anchor concentration: ${anchorConcentration.count}/${hyperedges.length} hyperedges fall nearest anchor ${anchorConcentration.value}. Small decimal differences may be meaningful or may be unsupported jitter; compare rationales and route effects before changing values.`);
}
if (duplicateLabels.length) reviewSignals.push(`${duplicateLabels.length} normalized label group(s) need identity review`);
if (isolatedPoints.length) reviewSignals.push(`${isolatedPoints.length} point(s) are isolated`);
if (largeTails.length) reviewSignals.push(`${largeTails.length} hyperedge(s) have at least 6 tails`);

const report = {
  points: points.length,
  hyperedges: hyperedges.length,
  weightHistogram: Object.fromEntries(entries(weightHistogram)),
  weightAnchorBands: Object.fromEntries(entries(weightAnchorBands).map(([anchor, count]) => [`~${anchor}`, count])),
  weightStatistics: distribution(weightValues),
  weightConcentration: { exact: exactConcentration, anchor: anchorConcentration },
  tailSizeHistogram: Object.fromEntries(entries(tailSizeHistogram)),
  duplicateLabels,
  parallelRoutes,
  alternativeHeads,
  isolatedPoints,
  highWeight,
  largeTails,
  reviewSignals,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`points       ${report.points}`);
  console.log(`hyperedges  ${report.hyperedges}`);
  console.log(`weights     ${entries(weightHistogram).map(([weight, count]) => `${weight}:${count}`).join('  ') || 'none'}`);
  console.log(`anchors     ${entries(weightAnchorBands).map(([anchor, count]) => `~${anchor}:${count}`).join('  ') || 'none'}`);
  const stats = report.weightStatistics;
  console.log(`statistics  ${stats ? `min:${stats.min}  max:${stats.max}  mean:${stats.mean}  median:${stats.median}  sd:${stats.standardDeviation}` : 'none'}`);
  console.log(`tail sizes  ${entries(tailSizeHistogram).map(([size, count]) => `${size}:${count}`).join('  ') || 'none'}`);
  console.log(`parallel    ${parallelRoutes.length}`);
  console.log(`alternates  ${alternativeHeads.length}`);
  console.log(`high cost   ${highWeight.length}`);
  console.log(`isolated    ${isolatedPoints.length}`);
  for (const signal of reviewSignals) console.log(`signal      ${signal}`);
}

import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../ports/RouteSolver';
import { parseWorkspaceManifest, type ManifestGraph } from '../workspace/index';
import { routeIsStale, routeRecord } from './routes';

const conceptA = { id: 'c-a', data: { label: 'A', document: 'docs/a' } };
const conceptB = { id: 'c-b', data: { label: 'B', document: 'docs/b' } };
const conceptC = { id: 'c-c', data: { label: 'C', document: 'docs/c' } };
const derivation = { id: 'h-ab', weight: 2, tails: ['c-a'], head: 'c-b', data: { document: 'docs/h-ab' } };

function graphOf(
  graph: { points: readonly unknown[]; hyperedges: readonly unknown[] },
  indent = 0,
): ManifestGraph {
  return parseWorkspaceManifest(JSON.stringify({
    schema: 'derivon.workspace/v1',
    id: 'routes-workspace',
    document: { title: '路线', description: '' },
    tags: [],
    graph,
  }, null, indent)).manifest.graph;
}

const graph = (overrides: Partial<{ points: readonly unknown[]; hyperedges: readonly unknown[] }> = {}) =>
  graphOf({ points: [conceptA, conceptB], hyperedges: [derivation], ...overrides });

const solution: RouteSolution = {
  reachable: true,
  conceptIds: ['c-a', 'c-b'],
  derivationIds: ['h-ab'],
  order: ['h-ab'],
  cost: 2,
  provenOptimal: true,
  blocked: [],
};

const confirmed = (overrides: Partial<Parameters<typeof routeRecord>[0]> = {}) =>
  routeRecord({ id: 'r-k7f3q2', description: '从 A 到 B', graph: graph(), solution, targets: ['c-b'], known: ['c-a'], ...overrides });

describe('routeRecord', () => {
  it('writes the reference-only subgraph a confirmed solve produces', async () => {
    const record = await confirmed();
    expect(record).toMatchObject({
      id: 'r-k7f3q2',
      description: '从 A 到 B',
      targets: ['c-b'],
      known: ['c-a'],
      conceptIds: ['c-a', 'c-b'],
      derivationIds: ['h-ab'],
      order: ['h-ab'],
      cost: 2,
    });
    expect(record.basis).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names the solve it was computed from rather than reusing a description', async () => {
    const [first, second] = await Promise.all([
      confirmed({ id: 'r-aaaaaa', description: '从 A 到 B' }),
      confirmed({ id: 'r-bbbbbb', description: '另一条' }),
    ]);
    expect([first.description, second.description]).toEqual(['从 A 到 B', '另一条']);
  });

  it('freezes the known set it was solved from, so the route stays explainable', async () => {
    const record = await confirmed({ known: ['c-a'] });
    expect(record.known).toEqual(['c-a']);
  });

  it('refuses a solve that never reported a finite cost', async () => {
    await expect(confirmed({ solution: { ...solution, cost: null } })).rejects.toThrow(/成本/);
  });

  it('carries no completion marker of any kind', async () => {
    const record = await confirmed();
    expect(Object.keys(record).sort()).toEqual([
      'basis', 'conceptIds', 'cost', 'derivationIds', 'description', 'id', 'known', 'order', 'targets',
    ]);
  });
});

describe('routeIsStale', () => {
  it('is fresh against the graph it was solved from', async () => {
    await expect(routeIsStale(graph(), await confirmed())).resolves.toBe(false);
  });

  it('is stale once a named object changes, without being re-solved or deleted', async () => {
    const record = await confirmed();
    const edited = graph({ points: [{ ...conceptA, data: { ...conceptA.data, label: 'A′' } }, conceptB] });
    await expect(routeIsStale(edited, record)).resolves.toBe(true);
  });

  it('is stale once a named object is gone', async () => {
    const record = await confirmed();
    await expect(routeIsStale(graph({ hyperedges: [] }), record)).resolves.toBe(true);
  });

  it('stays fresh after an unrelated edit, and after the manifest is rewritten with the same values', async () => {
    const record = await confirmed();
    const unrelated = graph({
      points: [conceptA, conceptB, conceptC],
      hyperedges: [derivation, { id: 'h-bc', weight: 1, tails: ['c-b'], head: 'c-c', data: { document: 'docs/h-bc' } }],
    });
    await expect(routeIsStale(unrelated, record)).resolves.toBe(false);
    await expect(routeIsStale(graphOf({ points: [conceptA, conceptB], hyperedges: [derivation] }, 4), record))
      .resolves.toBe(false);
  });
});

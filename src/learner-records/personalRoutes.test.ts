import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../ports/RouteSolver';
import { parseWorkspaceManifest, type ManifestGraph } from '../workspace/index';
import { confirmedRoute, personalRouteIsStale, withRouteBasis } from './personalRoutes';

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

const confirmed = (overrides: Partial<Parameters<typeof confirmedRoute>[0]> = {}) =>
  withRouteBasis(graph(), confirmedRoute({ id: 'r-k7f3q2', label: '从 A 到 B', solution, targets: ['c-b'], known: ['c-a'], ...overrides }));

describe('confirmedRoute', () => {
  it('writes the solve down as a personal route with its order fixed', () => {
    expect(confirmedRoute({ id: 'r-k7f3q2', label: '从 A 到 B', solution, targets: ['c-b'], known: ['c-a'] })).toEqual({
      id: 'r-k7f3q2', label: '从 A 到 B', known: ['c-a'], targets: ['c-b'], steps: ['h-ab'], ordered: true,
    });
  });

  it('freezes the known set it was solved from, so the route stays explainable', async () => {
    expect((await confirmed({ known: ['c-a'] })).known).toEqual(['c-a']);
  });
});

describe('personalRouteIsStale', () => {
  it('is fresh against the graph it was saved against', async () => {
    const route = await confirmed();
    expect(route.basis).toMatch(/^[0-9a-f]{64}$/);
    await expect(personalRouteIsStale(graph(), route)).resolves.toBe(false);
  });

  it('cannot be checked without a basis, and so is never fresh', async () => {
    const { basis: _basis, ...route } = await confirmed();
    await expect(personalRouteIsStale(graph(), route)).resolves.toBe(true);
  });

  it('is stale once a named object changes, without being re-solved or deleted', async () => {
    const route = await confirmed();
    const edited = graph({ points: [{ ...conceptA, data: { ...conceptA.data, label: 'A′' } }, conceptB] });
    await expect(personalRouteIsStale(edited, route)).resolves.toBe(true);
  });

  it('is stale once a named object is gone', async () => {
    const route = await confirmed();
    await expect(personalRouteIsStale(graph({ hyperedges: [] }), route)).resolves.toBe(true);
  });

  it('stays fresh after an unrelated edit, and after the manifest is rewritten with the same values', async () => {
    const route = await confirmed();
    const unrelated = graph({
      points: [conceptA, conceptB, conceptC],
      hyperedges: [derivation, { id: 'h-bc', weight: 1, tails: ['c-b'], head: 'c-c', data: { document: 'docs/h-bc' } }],
    });
    await expect(personalRouteIsStale(unrelated, route)).resolves.toBe(false);
    await expect(personalRouteIsStale(graphOf({ points: [conceptA, conceptB], hyperedges: [derivation] }, 4), route))
      .resolves.toBe(false);
  });
});

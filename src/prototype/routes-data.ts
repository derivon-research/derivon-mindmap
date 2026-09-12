/**
 * PROTOTYPE ONLY — throwaway, imported by nothing in the application.
 *
 * Sample confirmed route records for the multi-route selection prototype. The routes are
 * really solved against the bundled example graph with the greedy test solver, so the step
 * lists, labels, costs and subgraphs are real. The ids, descriptions, `basis` hashes and the
 * "confirmed earlier" framing are fabricated.
 */
import workspaceText from '../examples/math-reforged/.derivon/workspace.json?raw';
import type { RouteSolution } from '../ports/RouteSolver';
import { solveGreedily } from '../testing/routeSolver';
import { parseWorkspaceGraph, type WorkspaceGraph } from '../workspace/index';

export const graph: WorkspaceGraph = parseWorkspaceGraph(workspaceText);

/** Sources of the example graph: a learner who says they know these starts here. */
const FOUNDATIONS = ['foundation-fields', 'finite-tuple'];

export type SavedRoute = {
  readonly id: string;
  readonly description: string;
  readonly targets: readonly string[];
  /** The input snapshot of *that* solve, never the live known set. */
  readonly known: readonly string[];
  readonly basis: string;
  readonly solution: RouteSolution;
  /** `basis` no longer matches the current graph. Reported, never repaired automatically. */
  readonly stale: boolean;
};

/** A 64-hex `basis`, faked deterministically from a seed. */
const fakeBasis = (seed: string) => seed.repeat(Math.ceil(64 / seed.length)).slice(0, 64);

type RouteSeed = {
  readonly id: string;
  readonly description: string;
  readonly targets: readonly string[];
  readonly known: readonly string[];
  readonly basisSeed: string;
  readonly stale?: boolean;
};

const ROUTE_SEEDS: readonly RouteSeed[] = [
  {
    id: 'r-k7f3q2',
    description: '从线性无关走到 SVD',
    targets: ['svd'],
    known: [...FOUNDATIONS, 'span', 'independence', 'basis'],
    basisSeed: 'a1b2c3d4e5f6',
  },
  {
    id: 'r-m2p9ax',
    description: '特征值与对角化',
    targets: ['diagonalization'],
    known: [...FOUNDATIONS, 'eigen', 'characteristic', 'polynomial'],
    basisSeed: 'b2c3d4e5f6a1',
  },
  {
    id: 'r-z6h3cd',
    description: '商空间',
    targets: ['quotient'],
    known: [...FOUNDATIONS, 'subspace', 'linear-map', 'rank'],
    basisSeed: 'c3d4e5f6a1b2',
  },
  {
    id: 'r-b5n7yk',
    description: '行列式：交错型的一个读数',
    targets: ['determinant'],
    known: [...FOUNDATIONS, 'alternating', 'tensor'],
    basisSeed: 'd4e5f6a1b2c3',
  },
  {
    id: 'r-t4w8bn',
    description: '伪逆：SVD 的一个用法',
    targets: ['pseudoinverse'],
    known: [...FOUNDATIONS, 'svd', 'orthogonal-projection'],
    basisSeed: 'e5f6a1b2c3d4',
  },
  {
    id: 'r-q8v5er',
    description: '若当型与广义特征空间',
    targets: ['jordan-form'],
    known: [...FOUNDATIONS, 'generalized-eigenspace', 'nilpotent'],
    basisSeed: 'f6a1b2c3d4e5',
    stale: true,
  },
];

export const routes: readonly SavedRoute[] = ROUTE_SEEDS.map((seed) => ({
  id: seed.id,
  description: seed.description,
  targets: seed.targets,
  known: seed.known,
  basis: fakeBasis(seed.basisSeed),
  stale: seed.stale ?? false,
  solution: solveGreedily(graph, { targetConceptIds: seed.targets, knownConceptIds: seed.known }),
}));

/**
 * A `state.json` snapshot, as a map for the prototype. `complete` is the whole of "known";
 * `incomplete` means *asked, did not get there* and is deliberately a different thing from
 * an absent record.
 */
const COMPLETE = [
  'coordinate-space', 'vector-space', 'linear-map', 'inner-product', 'norm-orthogonal',
  'operator', 'orthogonality', 'subspace', 'linear-combination',
];
const INCOMPLETE = ['eigenvector'];

export const mastery: ReadonlyMap<string, 'complete' | 'incomplete'> = new Map([
  ...COMPLETE.map((id) => [id, 'complete'] as const),
  ...INCOMPLETE.map((id) => [id, 'incomplete'] as const),
]);

export const labelOf = (conceptId: string): string =>
  graph.points.find((point) => point.id === conceptId)?.data.label ?? conceptId;

export const labelsOf = (conceptIds: readonly string[]): string =>
  conceptIds.map(labelOf).join('、');

export const weightOf = (derivationId: string): number =>
  graph.hyperedges.find((edge) => edge.id === derivationId)?.weight ?? 0;

export type RouteProgress = {
  /** Derivations whose head concept is `complete`, counted from the front. */
  readonly done: number;
  readonly total: number;
  /** The first step that is not complete. `total` when the route is finished. */
  readonly currentIndex: number;
  readonly finished: boolean;
};

/**
 * The one place progress is computed, and the whole of it: there is no cursor and no stored
 * progress. "Where am I" is `state.json` composed with `routes.json` at display time.
 */
export function routeProgress(route: SavedRoute): RouteProgress {
  const heads = route.solution.order.map((derivationId) =>
    graph.hyperedges.find((edge) => edge.id === derivationId)?.head ?? '');
  const currentIndex = heads.findIndex((head) => mastery.get(head) !== 'complete');
  const total = heads.length;
  if (currentIndex === -1) return { done: total, total, currentIndex: total, finished: true };
  return { done: currentIndex, total, currentIndex, finished: false };
}

export const totalCost = (route: SavedRoute): number =>
  route.solution.order.reduce((sum, id) => sum + weightOf(id), 0);

/** Steps of a route in reading order, with the mastery mark that decides the current one. */
export function stepsOf(route: SavedRoute) {
  return route.solution.order.map((derivationId, index) => {
    const edge = graph.hyperedges.find((candidate) => candidate.id === derivationId);
    const conceptId = edge?.head ?? '';
    return {
      index: index + 1,
      derivationId,
      conceptId,
      label: labelOf(conceptId),
      requires: edge?.tails ?? [],
      weight: edge?.weight ?? 0,
      status: mastery.get(conceptId) ?? 'absent' as const,
    };
  });
}

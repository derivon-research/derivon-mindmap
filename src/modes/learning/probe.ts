/**
 * Which concepts are worth asking about next.
 *
 * Orientation does not walk the graph card by card asking "do you know this?" — it asks a
 * handful at a time, and picks them by what the answer would do to the route. A concept
 * several remaining steps lean on can remove those steps in one answer; a leaf near the
 * target cannot. Ranking by name or by how often a concept appears in the whole graph
 * would ask questions whose answers change nothing.
 */
import type { RouteSolution } from '../../ports/RouteSolver';
import type { WorkspaceGraph } from '../../workspace/index';
import type { OrientationRun } from './orientation';

/** How many concepts one round puts in front of the learner. */
export const PROBE_ROUND_SIZE = 6;

type Leverage = { readonly conceptId: string; steps: number; position: number };

/**
 * The concepts on this route whose answers would change it most, best first.
 *
 * Leverage is the number of remaining steps a concept takes part in, as a premise or as
 * the step's own result. Ties go to whichever appears earlier along the route, because an
 * earlier concept prunes everything downstream of it.
 */
export function routeProbeCandidates(
  graph: WorkspaceGraph,
  solution: RouteSolution,
  run: OrientationRun,
  size: number = PROBE_ROUND_SIZE,
): readonly string[] {
  const settled = new Set([...run.known, ...run.asked]);
  const derivations = new Map(graph.hyperedges.map((edge) => [edge.id, edge]));
  const leverage = new Map<string, Leverage>();
  const count = (conceptId: string, position: number) => {
    if (settled.has(conceptId)) return;
    const current = leverage.get(conceptId);
    if (current) current.steps += 1;
    else leverage.set(conceptId, { conceptId, steps: 1, position });
  };

  solution.order.forEach((derivationId, position) => {
    const derivation = derivations.get(derivationId);
    if (!derivation) return;
    for (const tail of derivation.tails) count(tail, position);
    count(derivation.head, position);
  });

  return [...leverage.values()]
    .sort((left, right) => right.steps - left.steps
      || left.position - right.position
      || (left.conceptId < right.conceptId ? -1 : 1))
    .slice(0, size)
    .map((entry) => entry.conceptId);
}

/**
 * The derivations that could take part in reaching these targets: walk backwards from the
 * targets, taking every derivation that produces something already needed. Anything
 * outside this set cannot appear on any route to the targets, so how popular it is in the
 * rest of the graph says nothing about what is worth asking.
 */
function derivationsFeeding(graph: WorkspaceGraph, targets: readonly string[]): ReadonlySet<string> {
  const needed = new Set(targets);
  const feeding = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const derivation of graph.hyperedges) {
      if (feeding.has(derivation.id) || !needed.has(derivation.head)) continue;
      feeding.add(derivation.id);
      grew = true;
      for (const tail of derivation.tails) needed.add(tail);
    }
  }
  return feeding;
}

/**
 * The same question when no route has been solved — on a host without a solver, or before
 * the learner has named a target. Leverage is then how many of the derivations that could
 * reach the targets lean on the concept: answering for one of those still prunes more than
 * answering for a leaf. Before any target is named there is nothing to aim at, so the whole
 * graph stands in for the route.
 *
 * A concept nothing is derived from is never offered. Its answer would change nothing.
 */
export function graphProbeCandidates(
  graph: WorkspaceGraph,
  run: OrientationRun,
  size: number = PROBE_ROUND_SIZE,
): readonly string[] {
  const settled = new Set([...run.known, ...run.asked]);
  const feeding = run.targets.length ? derivationsFeeding(graph, run.targets) : null;
  const leverage = new Map<string, number>();
  for (const derivation of graph.hyperedges) {
    if (feeding && !feeding.has(derivation.id)) continue;
    for (const tail of derivation.tails) {
      if (settled.has(tail)) continue;
      leverage.set(tail, (leverage.get(tail) ?? 0) + 1);
    }
  }
  return [...leverage.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left || (leftId < rightId ? -1 : 1))
    .slice(0, size)
    .map(([conceptId]) => conceptId);
}

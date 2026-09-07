import type { RouteRequest, RouteSolution, RouteSolver } from '../ports/RouteSolver';
import type { WorkspaceGraph } from '../workspace/index';

/**
 * A `RouteSolver` test double: it walks the graph greedily rather than optimising, which
 * is enough for a test that cares what the learning side does with a route, not how good
 * the route is.
 *
 * This lives under `src/testing/` on purpose. A host that ships no solver must keep
 * shipping none — an approximation good enough for a test is not good enough to hand a
 * learner and call a route.
 */
export function fixtureRouteSolver(): RouteSolver {
  return { solve: async (graph, request) => solveGreedily(graph, request) };
}

export function solveGreedily(graph: WorkspaceGraph, request: RouteRequest): RouteSolution {
  const have = new Set(request.knownConceptIds);
  const order: string[] = [];
  const derivationIds: string[] = [];
  // Repeatedly take any derivation whose premises are all in hand, until nothing else fires.
  for (let progress = true; progress;) {
    progress = false;
    for (const derivation of graph.hyperedges) {
      if (derivationIds.includes(derivation.id) || have.has(derivation.head)) continue;
      if (!derivation.tails.every((tail) => have.has(tail))) continue;
      derivationIds.push(derivation.id);
      order.push(derivation.id);
      have.add(derivation.head);
      progress = true;
    }
  }
  const reachable = request.targetConceptIds.every((id) => have.has(id));
  const used = keep(graph, order, request.targetConceptIds);
  return {
    reachable,
    conceptIds: [...new Set([...request.knownConceptIds, ...used.map((edge) => edge.head),
      ...used.flatMap((edge) => edge.tails)])],
    derivationIds: used.map((edge) => edge.id),
    order: used.map((edge) => edge.id),
    cost: used.reduce((total, edge) => total + edge.weight, 0),
    provenOptimal: false,
    blocked: reachable ? [] : request.targetConceptIds.filter((id) => !have.has(id))
      .map((targetConceptId) => ({ targetConceptId, blockingConceptIds: [], cycles: [] })),
  };
}

/** Trim the greedy closure back to the derivations the targets actually lean on. */
function keep(graph: WorkspaceGraph, order: readonly string[], targetConceptIds: readonly string[]) {
  const byId = new Map(graph.hyperedges.map((edge) => [edge.id, edge]));
  const wanted = new Set(targetConceptIds);
  const chosen = new Set<string>();
  for (const id of [...order].reverse()) {
    const edge = byId.get(id);
    if (!edge || !wanted.has(edge.head)) continue;
    chosen.add(id);
    for (const tail of edge.tails) wanted.add(tail);
  }
  return order.filter((id) => chosen.has(id)).map((id) => byId.get(id)!);
}

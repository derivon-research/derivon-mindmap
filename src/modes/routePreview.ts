/**
 * Route previews, shared by the two modes.
 *
 * A route subgraph appears on the learner's confirmation screen and in the author's
 * preview of an orientation configuration, so neither side may own this. The view model
 * carries structure and marks only — how a mark is drawn stays inside the renderer.
 */
import { useEffect, useState } from 'react';
import type { RouteSolution, RouteSolver } from '../ports/RouteSolver';
import type { GraphView } from '../rendering';
import type { WorkspaceGraph } from '../workspace/index';

export type RoutePreview =
  /** No host solver: say so rather than showing an invented route. */
  | { readonly status: 'unavailable' }
  | { readonly status: 'empty' }
  | { readonly status: 'solving' }
  | { readonly status: 'ready'; readonly solution: RouteSolution }
  | { readonly status: 'error'; readonly message: string };

export function useRoutePreview(
  solver: RouteSolver | undefined,
  graph: WorkspaceGraph,
  targetIds: readonly string[],
  knownIds: readonly string[],
): RoutePreview {
  const [preview, setPreview] = useState<RoutePreview>({ status: 'empty' });
  const targets = targetIds.join(' ');
  const known = knownIds.join(' ');
  useEffect(() => {
    if (!solver) { setPreview({ status: 'unavailable' }); return; }
    if (!targets) { setPreview({ status: 'empty' }); return; }
    let cancelled = false;
    setPreview({ status: 'solving' });
    void solver.solve(graph, { targetConceptIds: targets.split(' '), knownConceptIds: known ? known.split(' ') : [] })
      .then((solution) => { if (!cancelled) setPreview({ status: 'ready', solution }); })
      .catch((error: unknown) => {
        if (!cancelled) setPreview({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [graph, known, solver, targets]);
  return preview;
}

/** The solved route as a view model. Targets and known concepts keep their meaning. */
export function routeGraphView(
  graph: WorkspaceGraph,
  solution: RouteSolution,
  targetIds: readonly string[],
  knownIds: readonly string[],
): GraphView {
  const onRoute = new Set(solution.conceptIds);
  const derivations = new Set(solution.derivationIds);
  const targets = new Set(targetIds);
  const known = new Set(knownIds);
  return {
    kind: 'route',
    concepts: graph.points.filter((point) => onRoute.has(point.id)).map((point) => ({
      id: point.id,
      label: point.data.label,
      marks: [
        ...(targets.has(point.id) ? ['target' as const] : []),
        ...(known.has(point.id) ? ['known' as const] : []),
      ],
    })),
    hyperedges: graph.hyperedges.filter((edge) => derivations.has(edge.id)).map((edge) => ({
      id: edge.id, tails: edge.tails, head: edge.head, weight: edge.weight, marks: [],
    })),
  };
}

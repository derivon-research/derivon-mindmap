/**
 * Route previews, shared by the two modes: a route subgraph appears both on the learner's
 * confirmation screen and in the author's preview of an orientation configuration.
 */
import { useEffect, useState } from 'react';
import type { RouteRecord } from '../learner-records';
import type { RouteSolution, RouteSolver } from '../ports/RouteSolver';
import type { GraphView } from '../rendering';
import { conceptTags, type WorkspaceGraph } from '../workspace/index';

export type RoutePreview =
  /** The host offers no solver. */
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

/**
 * A confirmed route as the solved-route view model the views already take.
 *
 * The record carries no `provenOptimal` and no `blocked`, because both are facts about one
 * solve rather than about the route: walking a confirmed route asks neither question, and
 * inventing an answer here would be claiming something nobody proved.
 */
export function routeSolutionOf(record: RouteRecord): RouteSolution {
  return {
    reachable: true,
    conceptIds: [...record.conceptIds],
    derivationIds: [...record.derivationIds],
    order: [...record.order],
    cost: record.cost,
    provenOptimal: false,
    blocked: [],
  };
}

/** One derivation along a solved route, in the terms a reader of the route sees it. */
export type RouteStep = {
  /** One-based position along the route. */
  readonly index: number;
  readonly derivationId: string;
  /** The concept this step arrives at. */
  readonly conceptId: string;
  readonly label: string;
  /** The premises this step leans on — the reason it appears where it does. */
  readonly requires: readonly string[];
  readonly weight: number;
  readonly tags: readonly string[];
};

/** The route as a numbered reading order, for the preview screen and the route rail. */
export function routeSteps(graph: WorkspaceGraph, solution: RouteSolution): readonly RouteStep[] {
  const derivations = new Map(graph.hyperedges.map((edge) => [edge.id, edge]));
  const concepts = new Map(graph.points.map((point) => [point.id, point]));
  const steps: RouteStep[] = [];
  for (const derivationId of solution.order) {
    const derivation = derivations.get(derivationId);
    if (!derivation) continue;
    const concept = concepts.get(derivation.head);
    steps.push({
      index: steps.length + 1,
      derivationId,
      conceptId: derivation.head,
      label: concept?.data.label ?? derivation.head,
      requires: derivation.tails,
      weight: derivation.weight,
      tags: concept ? conceptTags(concept) : [],
    });
  }
  return steps;
}

/** How far along the route the learner has got, when the route is being walked. */
export type RouteProgress = {
  readonly completedIds: readonly string[];
  readonly currentId: string | null;
};

/**
 * The solved route as a view model, with targets and known concepts marked.
 *
 * Progress marks are optional because the same view serves the confirmation screen, where
 * there is no progress yet and a "current step" would be a lie.
 */
export function routeGraphView(
  graph: WorkspaceGraph,
  solution: RouteSolution,
  targetIds: readonly string[],
  knownIds: readonly string[],
  progress?: RouteProgress,
): GraphView {
  const onRoute = new Set(solution.conceptIds);
  const derivations = new Set(solution.derivationIds);
  const targets = new Set(targetIds);
  const known = new Set(knownIds);
  const completed = new Set(progress?.completedIds ?? []);
  return {
    kind: 'route',
    concepts: graph.points.filter((point) => onRoute.has(point.id)).map((point) => ({
      id: point.id,
      label: point.data.label,
      marks: [
        ...(targets.has(point.id) ? ['target' as const] : []),
        ...(known.has(point.id) ? ['known' as const] : []),
        ...(completed.has(point.id) ? ['completed' as const] : []),
        ...(point.id === progress?.currentId ? ['current' as const] : []),
      ],
    })),
    hyperedges: graph.hyperedges.filter((edge) => derivations.has(edge.id)).map((edge) => ({
      id: edge.id, tails: edge.tails, head: edge.head, weight: edge.weight, marks: [],
    })),
  };
}

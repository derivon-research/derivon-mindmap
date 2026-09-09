import type { RouteSolution } from '../../ports/RouteSolver';
import type { WorkspaceGraph } from '../../workspace/index';
import type { TaskCompletion } from './progress';

export type AcceptedRoute = {
  readonly solution: RouteSolution;
  readonly graphText: string;
  readonly signature: string;
};

export type LearningWalkState = {
  readonly acceptedRoute: AcceptedRoute | null;
  readonly cursor: number;
  readonly revealed: readonly string[];
  readonly taskCompletions: readonly TaskCompletion[];
  readonly routeInvalidReason: 'changed' | 'target' | null;
};

export function initialLearningWalkState(): LearningWalkState {
  return {
    acceptedRoute: null,
    cursor: 0,
    revealed: [],
    taskCompletions: [],
    routeInvalidReason: null,
  };
}

export function holdRoute(
  state: LearningWalkState,
  graph: WorkspaceGraph,
  solution: RouteSolution,
  graphText: string,
): LearningWalkState {
  if (state.acceptedRoute) return state;
  return {
    ...state,
    acceptedRoute: { solution, graphText, signature: routeSignature(graph, solution) },
    cursor: 0,
    routeInvalidReason: null,
  };
}

export function leaveRoute(state: LearningWalkState): LearningWalkState {
  return state.acceptedRoute ? { ...state, acceptedRoute: null } : state;
}

export function restartRoute(state: LearningWalkState): LearningWalkState {
  return state.acceptedRoute || state.routeInvalidReason !== null || state.cursor !== 0
    ? { ...state, acceptedRoute: null, cursor: 0, routeInvalidReason: null }
    : state;
}

export function invalidateRoute(
  state: LearningWalkState,
  reason: NonNullable<LearningWalkState['routeInvalidReason']>,
): LearningWalkState {
  return state.routeInvalidReason === reason ? state : { ...state, routeInvalidReason: reason };
}

export function clearRouteInvalidation(state: LearningWalkState): LearningWalkState {
  return state.routeInvalidReason === null ? state : { ...state, routeInvalidReason: null };
}

export function revealDefinition(
  state: LearningWalkState,
  conceptId: string,
): LearningWalkState {
  return state.revealed.includes(conceptId) ? state
    : { ...state, revealed: [...state.revealed, conceptId] };
}

export function moveLearningCursor(state: LearningWalkState, index: number): LearningWalkState {
  return state.cursor === index ? state : { ...state, cursor: index };
}

export function recordTaskCompletion(
  state: LearningWalkState,
  completion: TaskCompletion,
): LearningWalkState {
  return {
    ...state,
    taskCompletions: [
      ...state.taskCompletions.filter((item) => !(
      item.routeKey === completion.routeKey
      && item.graphText === completion.graphText
      && item.conceptId === completion.conceptId
      && item.derivationId === completion.derivationId
      )),
      completion,
    ],
  };
}

function graphObjects(graph: WorkspaceGraph) {
  return {
    concepts: new Map(graph.points.map((point) => [point.id, point])),
    derivations: new Map(graph.hyperedges.map((edge) => [edge.id, edge])),
  };
}

export function routeSignature(graph: WorkspaceGraph, solution: RouteSolution): string {
  const { derivations } = graphObjects(graph);
  return JSON.stringify({
    order: solution.order,
    cost: solution.cost,
    reachable: solution.reachable,
    steps: solution.order.map((derivationId) => {
      const derivation = derivations.get(derivationId);
      return derivation && {
        derivationId,
        tails: derivation.tails,
        head: derivation.head,
        weight: derivation.weight,
      };
    }),
  });
}

export function missingTargetIds(
  graph: WorkspaceGraph,
  targetIds: readonly string[],
): readonly string[] {
  const { concepts } = graphObjects(graph);
  return targetIds.filter((targetId) => !concepts.has(targetId));
}

import type { RouteSolution } from '../../ports/RouteSolver';
import { objectSourcePath, type WorkspaceGraph } from '../../workspace/index';

export type LearningTaskRecord = {
  readonly conceptId: string;
  readonly derivationId: string;
  readonly conceptDocument: DocumentVersion;
  readonly derivationDocument: DocumentVersion;
};

export type DocumentVersion = {
  readonly path: string;
  readonly version: string;
};

export type RouteDocumentVersions = Readonly<Record<string, string>>;

export type AcceptedRoute = {
  readonly solution: RouteSolution;
  readonly graphText: string;
  readonly signature: string;
};

export type LearningWalkState = {
  readonly acceptedRoute: AcceptedRoute | null;
  readonly cursor: number;
  readonly revealed: readonly string[];
  readonly taskRecords: readonly LearningTaskRecord[];
  readonly routeInvalidReason: 'changed' | 'target' | null;
};

export function initialLearningWalkState(): LearningWalkState {
  return {
    acceptedRoute: null,
    cursor: 0,
    revealed: [],
    taskRecords: [],
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

export function submitTask(
  state: LearningWalkState,
  graph: WorkspaceGraph,
  derivationId: string,
  versions: RouteDocumentVersions,
): LearningWalkState {
  const record = completeTask(graph, derivationId, versions);
  return {
    ...state,
    taskRecords: [...state.taskRecords.filter((item) => item.conceptId !== record.conceptId), record],
  };
}

function graphObjects(graph: WorkspaceGraph) {
  return {
    concepts: new Map(graph.points.map((point) => [point.id, point])),
    derivations: new Map(graph.hyperedges.map((edge) => [edge.id, edge])),
  };
}

export function documentVersion(text: string): string {
  let upper = 0x811c9dc5;
  let lower = 0x01000193;
  for (let index = 0; index < text.length; index++) {
    const byte = text.charCodeAt(index);
    upper = (upper ^ byte) >>> 0;
    upper = Math.imul(upper, 0x01000193) >>> 0;
    lower = (lower + upper) >>> 0;
  }
  return `${upper.toString(16)}-${lower.toString(16)}`;
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

export function completeTask(
  graph: WorkspaceGraph,
  derivationId: string,
  versions: RouteDocumentVersions,
): LearningTaskRecord {
  const { concepts, derivations } = graphObjects(graph);
  const derivation = derivations.get(derivationId);
  const concept = derivation && concepts.get(derivation.head);
  if (!derivation || !concept) throw new Error(`路线中不存在推导 ${derivationId}`);

  const conceptDocumentPath = objectSourcePath(concept.data);
  const derivationDocumentPath = objectSourcePath(derivation.data);
  return {
    conceptId: concept.id,
    derivationId: derivation.id,
    conceptDocument: { path: conceptDocumentPath, version: versions[conceptDocumentPath] ?? '' },
    derivationDocument: { path: derivationDocumentPath, version: versions[derivationDocumentPath] ?? '' },
  };
}

export function taskRecordIsCurrent(
  record: LearningTaskRecord,
  versions: RouteDocumentVersions,
): boolean {
  return versions[record.conceptDocument.path] === record.conceptDocument.version
    && versions[record.derivationDocument.path] === record.derivationDocument.version;
}

export function missingTargetIds(
  graph: WorkspaceGraph,
  targetIds: readonly string[],
): readonly string[] {
  const { concepts } = graphObjects(graph);
  return targetIds.filter((targetId) => !concepts.has(targetId));
}

export function routeDocumentPaths(graph: WorkspaceGraph, solution: RouteSolution): readonly string[] {
  const { concepts, derivations } = graphObjects(graph);
  const paths = new Set<string>();
  for (const derivationId of solution.order) {
    const derivation = derivations.get(derivationId);
    const concept = derivation && concepts.get(derivation.head);
    if (!derivation || !concept) continue;
    paths.add(objectSourcePath(concept.data));
    paths.add(objectSourcePath(derivation.data));
  }
  return [...paths];
}

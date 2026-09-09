import type { TextResource, WorkspaceContent } from '../../workspace/index';
import type { RouteSolution } from '../../ports/RouteSolver';
import type { RouteStep } from '../routePreview';

export function routeKey(solution: RouteSolution): string {
  return solution.order.join(' ');
}

export type TaskVerification = {
  readonly graphText: string;
  readonly routeKey: string;
  readonly step: RouteStep;
  readonly task: string;
  readonly documentBasis: string | null;
};

export type TaskCompletion = {
  readonly graphText: string;
  readonly routeKey: string;
  readonly conceptId: string;
  readonly derivationId: string;
  readonly task: string;
  readonly documentBasis: string;
};

function sameTaskSubject(completion: TaskCompletion, verification: TaskVerification): boolean {
  return completion.routeKey === verification.routeKey
    && completion.conceptId === verification.step.conceptId
    && completion.derivationId === verification.step.derivationId
    && completion.task === verification.task;
}

function objectDocumentPath(
  object: { readonly id: string; readonly data: { readonly document: string } } | undefined,
): string | null {
  return object ? `${object.data.document}/document.md` : null;
}

export function stepDocumentPaths(content: WorkspaceContent, step: RouteStep): readonly string[] {
  const derivation = content.graph.hyperedges.find(({ id }) => id === step.derivationId);
  const concept = content.graph.points.find(({ id }) => id === step.conceptId);
  return [objectDocumentPath(derivation), objectDocumentPath(concept)]
    .filter((path): path is string => path !== null);
}

function objectResource(
  object: { readonly id: string; readonly data: { readonly document: string } } | undefined,
  content: WorkspaceContent,
  resources: Readonly<Record<string, TextResource>> | undefined,
): string | null {
  const path = objectDocumentPath(object);
  if (!path) return null;
  const resource = resources?.[path] ?? content.documents[path];
  return resource ? JSON.stringify([path, resource]) : null;
}

/**
 * A task verifies the derivation and the definition it unlocks. A completion is valid only
 * while the graph basis, task and both documents are unchanged.
 */
export function stepDocumentBasis(
  content: WorkspaceContent,
  step: RouteStep,
  resources?: Readonly<Record<string, TextResource>>,
): string | null {
  const derivation = content.graph.hyperedges.find(({ id }) => id === step.derivationId);
  const concept = content.graph.points.find(({ id }) => id === step.conceptId);
  const derivationBasis = objectResource(derivation, content, resources);
  const conceptBasis = objectResource(concept, content, resources);
  return derivationBasis !== null && conceptBasis !== null
    ? JSON.stringify([derivationBasis, conceptBasis])
    : null;
}

export function isTaskComplete(completions: readonly TaskCompletion[], verification: TaskVerification): boolean {
  return verification.documentBasis !== null && completions.some((completion) =>
    sameTaskSubject(completion, verification)
    && completion.graphText === verification.graphText
    && completion.documentBasis === verification.documentBasis);
}

export function hasStaleTaskCompletion(completions: readonly TaskCompletion[], verification: TaskVerification): boolean {
  return completions.some((completion) =>
    sameTaskSubject(completion, verification)
    && (completion.graphText !== verification.graphText
      || completion.documentBasis !== verification.documentBasis));
}

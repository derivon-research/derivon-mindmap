/**
 * Graph view models for free exploration, shared by both modes: the whole-graph overview
 * and the one-step neighbourhood around a focus. Each returns a complete `GraphView`, so
 * the renderer keeps deciding how a mark looks and neither mode reaches past the boundary.
 *
 * The overview carries only the marks a user set deliberately — targets and known
 * concepts. Route highlighting belongs to the route view
 * (`docs/adr/0003-the-overview-is-not-meant-to-be-readable.md`).
 */
import type { GraphConcept, GraphMark, GraphView } from '../rendering';
import type { ConceptPoint, WorkspaceGraph } from '../workspace/index';

export type ConceptMarks = {
  readonly targetIds?: readonly string[];
  readonly knownIds?: readonly string[];
  readonly selectedId?: string | null;
};

function marker(marks: ConceptMarks): (point: ConceptPoint, extra?: GraphMark) => GraphConcept {
  const targets = new Set(marks.targetIds ?? []);
  const known = new Set(marks.knownIds ?? []);
  return (point, extra) => ({
    id: point.id,
    label: point.data.label,
    marks: [
      ...(targets.has(point.id) ? ['target' as const] : []),
      ...(known.has(point.id) ? ['known' as const] : []),
      ...(point.id === marks.selectedId ? ['selected' as const] : []),
      ...(extra ? [extra] : []),
    ],
  });
}

export function overviewGraphView(graph: WorkspaceGraph, marks: ConceptMarks): GraphView {
  const mark = marker(marks);
  return {
    kind: 'overview',
    concepts: graph.points.map((point) => mark(point)),
    hyperedges: graph.hyperedges.map((edge) => ({
      id: edge.id, tails: edge.tails, head: edge.head, weight: edge.weight, marks: [],
    })),
  };
}

/**
 * One step around a concept: every derivation it takes part in, and the concepts at their
 * far ends. Opening another concept from here moves the focus rather than widening it.
 */
export function neighbourhoodGraphView(graph: WorkspaceGraph, focusId: string, marks: ConceptMarks): GraphView {
  const focus = graph.points.find((point) => point.id === focusId);
  if (!focus) return { kind: 'neighbourhood', concepts: [], hyperedges: [] };
  const edges = graph.hyperedges.filter((edge) => edge.head === focusId || edge.tails.includes(focusId));
  const members = new Set([focusId, ...edges.flatMap((edge) => [edge.head, ...edge.tails])]);
  const mark = marker(marks);
  return {
    kind: 'neighbourhood',
    concepts: graph.points.filter((point) => members.has(point.id))
      .map((point) => mark(point, point.id === focusId ? 'current' : undefined)),
    hyperedges: edges.map((edge) => ({
      id: edge.id, tails: edge.tails, head: edge.head, weight: edge.weight, marks: [],
    })),
  };
}

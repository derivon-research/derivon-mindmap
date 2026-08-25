import type { AuthoringDocument, Hyperedge, ViewReplacement } from './domain';

export type ReplacementControl = {
  replaceWith: string;
  show: ViewReplacement['show'];
  label: string;
};

export type ProjectedPoint = {
  id: string;
  depth: number;
  controls: ReplacementControl[];
};

export type GraphProjection = {
  points: ProjectedPoint[];
  hyperedges: Hyperedge[];
  visibleIds: Set<string>;
};

export function projectDocument(document: AuthoringDocument): GraphProjection {
  const replacementByTarget = new Map(document.view.replacements.map((item) => [item.replaceWith, item]));
  const ownerByPoint = new Map<string, ViewReplacement>();
  document.view.replacements.forEach((replacement) => {
    replacement.points.forEach((id) => ownerByPoint.set(id, replacement));
  });

  const points: ProjectedPoint[] = [];
  const visited = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const ownReplacement = replacementByTarget.get(id);
    if (ownReplacement?.show === 'points') {
      ownReplacement.points.forEach((point) => visit(point, depth + 1));
      return;
    }

    const controls: ReplacementControl[] = [];
    if (ownReplacement?.show === 'replacement') {
      controls.push({
        replaceWith: id,
        show: 'points',
        label: `${ownReplacement.points.length} 点`,
      });
    }
    const owner = ownerByPoint.get(id);
    if (owner?.show === 'points') {
      controls.push({
        replaceWith: owner.replaceWith,
        show: 'replacement',
        label: `→ ${owner.replaceWith}`,
      });
    }
    points.push({ id, depth, controls });
  };

  document.graph.points
    .filter((point) => !ownerByPoint.has(point.id))
    .forEach((point) => visit(point.id, 0));

  const pointOrder = new Map(document.graph.points.map((point, index) => [point.id, index]));
  points.sort((left, right) => pointOrder.get(left.id)! - pointOrder.get(right.id)!);
  const visiblePointIds = new Set(points.map((point) => point.id));
  const hyperedges = document.graph.hyperedges.filter((hyperedge) =>
    visiblePointIds.has(hyperedge.head)
    && hyperedge.tails.every((tail) => visiblePointIds.has(tail)),
  );
  return {
    points,
    hyperedges,
    visibleIds: new Set([...visiblePointIds, ...hyperedges.map((item) => item.id)]),
  };
}

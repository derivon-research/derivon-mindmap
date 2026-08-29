import type { AuthoringDocument, Hyperedge, ViewReplacement } from './domain';

export type ReplacementViewMode = ViewReplacement['show'] | 'compare';
export type ReplacementRoleKind = 'member' | 'aggregate';

export type ProjectionRuntimeView = {
  detachedReplacementIds?: ReadonlySet<string>;
};

export type ReplacementControl = {
  replaceWith: string;
  role: ReplacementRoleKind;
  mode: ReplacementViewMode;
  sourceCount: number;
  label: string;
};

export type ProjectedReplacementRole = {
  replaceWith: string;
  role: ReplacementRoleKind;
  mode: ReplacementViewMode;
  sourceCount: number;
};

export type ProjectedPoint = {
  id: string;
  depth: number;
  controls: ReplacementControl[];
  replacementRoles: ProjectedReplacementRole[];
};

export type ProjectedReplacementAssist = {
  id: string;
  replaceWith: string;
  targetId: string;
  memberIds: string[];
};

export type GraphProjection = {
  points: ProjectedPoint[];
  hyperedges: Hyperedge[];
  replacementAssists: ProjectedReplacementAssist[];
  visibleIds: Set<string>;
};

export function projectDocument(
  document: AuthoringDocument,
  runtimeView: ProjectionRuntimeView = {},
): GraphProjection {
  const detachedIds = runtimeView.detachedReplacementIds ?? new Set<string>();
  const replacementByTarget = new Map(document.view.replacements.map((item) => [item.replaceWith, item]));
  const ownerByPoint = new Map<string, ViewReplacement>();
  document.view.replacements.forEach((replacement) => {
    replacement.points.forEach((id) => ownerByPoint.set(id, replacement));
  });

  const points: ProjectedPoint[] = [];
  const replacementAssists: ProjectedReplacementAssist[] = [];
  const visited = new Set<string>();
  const modeFor = (replacement: ViewReplacement): ReplacementViewMode =>
    detachedIds.has(replacement.replaceWith) ? 'compare' : replacement.show;

  const visit = (id: string, depth: number): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const ownReplacement = replacementByTarget.get(id);
    const ownMode = ownReplacement ? modeFor(ownReplacement) : null;
    if (ownReplacement && ownMode === 'points') {
      return ownReplacement.points.flatMap((point) => visit(point, depth + 1));
    }

    const controls: ReplacementControl[] = [];
    const replacementRoles: ProjectedReplacementRole[] = [];
    if (ownReplacement && (ownMode === 'replacement' || ownMode === 'compare')) {
      const role: ProjectedReplacementRole = {
        replaceWith: id,
        role: 'aggregate',
        mode: ownMode,
        sourceCount: ownReplacement.points.length,
      };
      replacementRoles.push(role);
      controls.push({
        ...role,
        label: `展开为 ${ownReplacement.points.length} 个概念`,
      });
    }
    const owner = ownerByPoint.get(id);
    const ownerMode = owner ? modeFor(owner) : null;
    if (owner && (ownerMode === 'points' || ownerMode === 'compare')) {
      const role: ProjectedReplacementRole = {
        replaceWith: owner.replaceWith,
        role: 'member',
        mode: ownerMode,
        sourceCount: owner.points.length,
      };
      replacementRoles.push(role);
      controls.push({
        ...role,
        label: `可折叠为 ${owner.replaceWith}`,
      });
    }
    points.push({ id, depth, controls, replacementRoles });

    if (ownReplacement && ownMode === 'compare') {
      const memberIds = ownReplacement.points.flatMap((point) => visit(point, depth + 1));
      replacementAssists.push({
        id: `replacement-assist:${ownReplacement.replaceWith}`,
        replaceWith: ownReplacement.replaceWith,
        targetId: ownReplacement.replaceWith,
        memberIds,
      });
    }
    return [id];
  };

  document.graph.points
    .filter((point) => !ownerByPoint.has(point.id))
    .forEach((point) => visit(point.id, 0));

  const pointOrder = new Map(document.graph.points.map((point, index) => [point.id, index]));
  points.sort((left, right) => pointOrder.get(left.id)! - pointOrder.get(right.id)!);
  replacementAssists.sort((left, right) =>
    (pointOrder.get(left.targetId) ?? 0) - (pointOrder.get(right.targetId) ?? 0),
  );
  const visiblePointIds = new Set(points.map((point) => point.id));
  const hyperedges = document.graph.hyperedges.filter((hyperedge) =>
    visiblePointIds.has(hyperedge.head)
    && hyperedge.tails.every((tail) => visiblePointIds.has(tail)),
  );
  return {
    points,
    hyperedges,
    replacementAssists,
    visibleIds: new Set([...visiblePointIds, ...hyperedges.map((item) => item.id)]),
  };
}

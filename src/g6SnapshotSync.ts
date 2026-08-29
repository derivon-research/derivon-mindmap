import type { G6SceneEdge, G6SceneNode, G6SceneSnapshot } from './g6SceneSnapshot';

export type CurrentG6Edge = Pick<G6SceneEdge, 'id' | 'source' | 'target'>;

export type G6SnapshotSyncPlan = {
  removedEdgeIds: string[];
  removedNodeIds: string[];
  addedNodes: G6SceneNode[];
  updatedNodes: G6SceneNode[];
  addedEdges: G6SceneEdge[];
  updatedEdges: G6SceneEdge[];
};

function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Plans against G6's live model because removing a node can cascade-delete edges
 * before a queued React snapshot is applied.
 */
export function planG6SnapshotSync(
  previous: G6SceneSnapshot | null,
  next: G6SceneSnapshot,
  currentNodeIds: Iterable<string>,
  currentEdges: Iterable<CurrentG6Edge>,
): G6SnapshotSyncPlan {
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const previousEdges = new Map((previous?.edges ?? []).map((edge) => [edge.id, edge]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));
  const liveNodeIds = new Set(currentNodeIds);
  const liveEdges = new Map(Array.from(currentEdges, (edge) => [edge.id, edge]));
  const replacedEdgeIds = new Set(Array.from(liveEdges.values()).flatMap((edge) => {
    const replacement = nextEdges.get(edge.id);
    return replacement && (replacement.source !== edge.source || replacement.target !== edge.target)
      ? [edge.id]
      : [];
  }));

  return {
    removedEdgeIds: Array.from(liveEdges.keys()).filter((id) => !nextEdges.has(id) || replacedEdgeIds.has(id)),
    removedNodeIds: Array.from(liveNodeIds).filter((id) => !nextNodes.has(id)),
    addedNodes: next.nodes.filter((node) => !liveNodeIds.has(node.id)),
    updatedNodes: next.nodes.filter((node) => {
      if (!liveNodeIds.has(node.id)) return false;
      const old = previousNodes.get(node.id);
      return !old || !sameData(old.data, node.data) || !sameData(old.style, node.style);
    }),
    addedEdges: next.edges.filter((edge) => !liveEdges.has(edge.id) || replacedEdgeIds.has(edge.id)),
    updatedEdges: next.edges.filter((edge) => {
      if (!liveEdges.has(edge.id) || replacedEdgeIds.has(edge.id)) return false;
      const old = previousEdges.get(edge.id);
      return !old || !sameData(old.data, edge.data);
    }),
  };
}

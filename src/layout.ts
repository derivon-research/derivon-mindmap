import dagre from '@dagrejs/dagre';
import type { AuthoringDocument, Position } from './domain';
import { groupHyperedges } from './hyperedgeGroups';

const CONCEPT_WIDTH = 136;
const CONCEPT_HEIGHT = 64;
const DERIVATION_SIZE = 54;

type LayoutOptions = {
  nodeIds?: ReadonlySet<string>;
  direction?: 'LR' | 'TB';
  compact?: boolean;
};

export function layoutDocument(
  document: AuthoringDocument,
  { nodeIds, direction = 'LR', compact = false }: LayoutOptions = {},
): Record<string, Position> {
  const included = (id: string) => !nodeIds || nodeIds.has(id);
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranker: compact ? 'tight-tree' : 'network-simplex',
    acyclicer: 'greedy',
    ranksep: compact ? 68 : 95,
    nodesep: compact ? 26 : 38,
    edgesep: compact ? 12 : 18,
    marginx: compact ? 20 : 40,
    marginy: compact ? 20 : 40,
  });

  document.graph.points
    .filter((point) => included(point.id))
    .forEach((point) => graph.setNode(point.id, { width: CONCEPT_WIDTH, height: CONCEPT_HEIGHT }));
  const includedGroups = groupHyperedges(document.graph.hyperedges)
    .map((group) => ({ ...group, members: group.members.filter((member) => included(member.id)) }))
    .filter((group) => group.members.length > 0)
    .map((group) => ({
      ...group,
      layoutId: group.members.some((member) => member.id === group.nodeId) ? group.nodeId : group.members[0].id,
    }));
  includedGroups.forEach((group) => {
    const hyperedge = group.members[0];
    graph.setNode(group.layoutId, { width: DERIVATION_SIZE, height: DERIVATION_SIZE });
    hyperedge.tails.filter(included).forEach((tail) => graph.setEdge(tail, group.layoutId));
    if (included(hyperedge.head)) graph.setEdge(group.layoutId, hyperedge.head);
  });
  dagre.layout(graph);

  const groupByLayoutId = new Map(includedGroups.map((group) => [group.layoutId, group]));
  const positions: Record<string, Position> = {};
  graph.nodes().forEach((id) => {
    const node = graph.node(id);
    const group = groupByLayoutId.get(id);
    const width = group ? DERIVATION_SIZE : CONCEPT_WIDTH;
    const height = group ? DERIVATION_SIZE : CONCEPT_HEIGHT;
    const position = { x: node.x - width / 2, y: node.y - height / 2 };
    if (group) group.members.forEach((member) => { positions[member.id] = position; });
    else positions[id] = position;
  });
  return positions;
}

export function layoutNeighborhood(
  document: AuthoringDocument,
  nodeIds: ReadonlySet<string>,
  anchorId?: string,
): Record<string, Position> {
  const positions = layoutDocument(document, { nodeIds, compact: true });
  if (!anchorId || !positions[anchorId] || !document.view.positions[anchorId]) return positions;

  const offset = {
    x: document.view.positions[anchorId].x - positions[anchorId].x,
    y: document.view.positions[anchorId].y - positions[anchorId].y,
  };
  return Object.fromEntries(
    Object.entries(positions).map(([id, position]) => [
      id,
      { x: position.x + offset.x, y: position.y + offset.y },
    ]),
  );
}

import dagre from '@dagrejs/dagre';
import type { AuthoringDocument, Position } from './domain';

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
  document.graph.hyperedges
    .filter((hyperedge) => included(hyperedge.id))
    .forEach((hyperedge) => {
      graph.setNode(hyperedge.id, { width: DERIVATION_SIZE, height: DERIVATION_SIZE });
      hyperedge.tails.filter(included).forEach((tail) => graph.setEdge(tail, hyperedge.id));
      if (included(hyperedge.head)) graph.setEdge(hyperedge.id, hyperedge.head);
    });
  dagre.layout(graph);

  const hyperedgeIds = new Set(document.graph.hyperedges.map((item) => item.id));
  const positions: Record<string, Position> = {};
  graph.nodes().forEach((id) => {
    const node = graph.node(id);
    const isHyperedge = hyperedgeIds.has(id);
    const width = isHyperedge ? DERIVATION_SIZE : CONCEPT_WIDTH;
    const height = isHyperedge ? DERIVATION_SIZE : CONCEPT_HEIGHT;
    positions[id] = { x: node.x - width / 2, y: node.y - height / 2 };
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

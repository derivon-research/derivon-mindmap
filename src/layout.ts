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

  document.graph.concepts
    .filter((concept) => included(concept.id))
    .forEach((concept) => graph.setNode(concept.id, { width: CONCEPT_WIDTH, height: CONCEPT_HEIGHT }));
  document.graph.derivations
    .filter((derivation) => included(derivation.id))
    .forEach((derivation) => {
      graph.setNode(derivation.id, { width: DERIVATION_SIZE, height: DERIVATION_SIZE });
      derivation.premises.filter(included).forEach((premise) => graph.setEdge(premise, derivation.id));
      if (included(derivation.conclusion)) graph.setEdge(derivation.id, derivation.conclusion);
    });
  dagre.layout(graph);

  const derivationIds = new Set(document.graph.derivations.map((item) => item.id));
  const positions: Record<string, Position> = {};
  graph.nodes().forEach((id) => {
    const node = graph.node(id);
    const isDerivation = derivationIds.has(id);
    const width = isDerivation ? DERIVATION_SIZE : CONCEPT_WIDTH;
    const height = isDerivation ? DERIVATION_SIZE : CONCEPT_HEIGHT;
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

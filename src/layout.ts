import dagre from '@dagrejs/dagre';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { AuthoringDocument, Position } from './domain';
import { groupHyperedges } from './hyperedgeGroups';

const CONCEPT_WIDTH = 136;
const CONCEPT_HEIGHT = 64;
const DERIVATION_SIZE = 54;
export const FORCE_LAYOUT_THRESHOLD = 400;

type ForceNode = SimulationNodeDatum & {
  id: string;
  kind: 'concept' | 'derivation';
  memberIds: string[];
};

type ForceLink = SimulationLinkDatum<ForceNode> & {
  kind: 'premise' | 'conclusion';
  tailCount: number;
  weight: number;
};

type LayoutOptions = {
  nodeIds?: ReadonlySet<string>;
  compact?: boolean;
};

const FORCE_NODE_GAP = 12;

function nodeDimensions(node: ForceNode): { width: number; height: number } {
  return node.kind === 'concept'
    ? { width: CONCEPT_WIDTH, height: CONCEPT_HEIGHT }
    : { width: DERIVATION_SIZE, height: DERIVATION_SIZE };
}

function separateRectangles(nodes: ForceNode[]): void {
  const cellWidth = CONCEPT_WIDTH + FORCE_NODE_GAP;
  const bins = new Map<number, ForceNode[]>();
  const sorted = [...nodes].sort((left, right) =>
    (left.x ?? 0) - (right.x ?? 0)
    || (left.y ?? 0) - (right.y ?? 0)
    || left.id.localeCompare(right.id),
  );

  for (const node of sorted) {
    const dimensions = nodeDimensions(node);
    const minimumBin = Math.floor(((node.x ?? 0) - dimensions.width / 2 - FORCE_NODE_GAP) / cellWidth);
    const maximumBin = Math.floor(((node.x ?? 0) + dimensions.width / 2 + FORCE_NODE_GAP) / cellWidth);
    const candidates = new Set<ForceNode>();
    for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
      bins.get(bin)?.forEach((candidate) => candidates.add(candidate));
    }

    let settledY = node.y ?? 0;
    const orderedCandidates = [...candidates].sort((left, right) =>
      (left.y ?? 0) - (right.y ?? 0) || left.id.localeCompare(right.id),
    );
    for (const candidate of orderedCandidates) {
      const other = nodeDimensions(candidate);
      const horizontalDistance = Math.abs((node.x ?? 0) - (candidate.x ?? 0));
      const verticalDistance = Math.abs(settledY - (candidate.y ?? 0));
      const horizontalLimit = (dimensions.width + other.width) / 2 + FORCE_NODE_GAP;
      const verticalLimit = (dimensions.height + other.height) / 2 + FORCE_NODE_GAP;
      if (horizontalDistance >= horizontalLimit || verticalDistance >= verticalLimit) continue;
      settledY = (candidate.y ?? 0) + verticalLimit;
    }
    node.y = settledY;
    for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
      const items = bins.get(bin) ?? [];
      items.push(node);
      bins.set(bin, items);
    }
  }
}

function seededRandom(seed = 0x2f6e2b1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function calculateForceLayout(
  document: AuthoringDocument,
  nodeIds?: ReadonlySet<string>,
): Record<string, Position> {
  const included = (id: string) => !nodeIds || nodeIds.has(id);
  const points = document.graph.points.filter((point) => included(point.id));
  const columns = Math.max(1, Math.ceil(Math.sqrt(points.length)));
  const nodes: ForceNode[] = points.map((point, index) => ({
    id: point.id,
    kind: 'concept',
    memberIds: [point.id],
    x: (index % columns) * 160,
    y: Math.floor(index / columns) * 90,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = groupHyperedges(document.graph.hyperedges)
    .map((group) => ({ ...group, members: group.members.filter((member) => included(member.id)) }))
    .filter((group) => group.members.length > 0)
    .map((group) => ({
      ...group,
      layoutId: group.members.some((member) => member.id === group.nodeId) ? group.nodeId : group.members[0].id,
    }));
  const links: ForceLink[] = [];

  groups.forEach((group, index) => {
    const hyperedge = group.members[0];
    const neighbors = [...hyperedge.tails, hyperedge.head]
      .map((id) => nodeById.get(id))
      .filter((node): node is ForceNode => !!node);
    const center = neighbors.length
      ? {
          x: neighbors.reduce((sum, node) => sum + (node.x ?? 0), 0) / neighbors.length,
          y: neighbors.reduce((sum, node) => sum + (node.y ?? 0), 0) / neighbors.length,
        }
      : { x: (index % columns) * 160 + 80, y: Math.floor(index / columns) * 90 + 45 };
    const node: ForceNode = {
      id: group.layoutId,
      kind: 'derivation',
      memberIds: group.members.map((member) => member.id),
      x: center.x,
      y: center.y,
    };
    nodes.push(node);
    nodeById.set(node.id, node);
    hyperedge.tails.filter(included).forEach((tail) => {
      links.push({
        source: tail,
        target: node.id,
        kind: 'premise',
        tailCount: Math.max(1, hyperedge.tails.length),
        weight: hyperedge.weight,
      });
    });
    if (included(hyperedge.head)) {
      links.push({
        source: node.id,
        target: hyperedge.head,
        kind: 'conclusion',
        tailCount: Math.max(1, hyperedge.tails.length),
        weight: hyperedge.weight,
      });
    }
  });

  const iterations = nodes.length > 1600 ? 100 : nodes.length > 800 ? 130 : 170;
  const simulation = forceSimulation<ForceNode>(nodes)
    .randomSource(seededRandom())
    .alpha(1)
    .alphaMin(0.001)
    .alphaDecay(1 - Math.pow(0.001, 1 / iterations))
    .velocityDecay(0.38)
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id((node) => node.id)
      .distance((link) => link.kind === 'premise'
        ? 150
        : 158 + Math.min(150, Math.sqrt(Math.max(0, link.weight)) * 34))
      .strength((link) => link.kind === 'premise' ? 0.42 / link.tailCount : 0.62))
    .force('charge', forceManyBody<ForceNode>().strength(-260).distanceMax(760))
    .force('collision', forceCollide<ForceNode>().radius((node) => node.kind === 'concept' ? 82 : 44).strength(1).iterations(1))
    .force('x', forceX<ForceNode>(0).strength(0.018))
    .force('y', forceY<ForceNode>(0).strength(0.018))
    .stop();
  for (let index = 0; index < iterations; index += 1) simulation.tick();
  separateRectangles(nodes);

  const finiteNodes = nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  const minimumX = Math.min(...finiteNodes.map((node) => node.x ?? 0));
  const minimumY = Math.min(...finiteNodes.map((node) => node.y ?? 0));
  const positions: Record<string, Position> = {};
  finiteNodes.forEach((node) => {
    const width = node.kind === 'concept' ? CONCEPT_WIDTH : DERIVATION_SIZE;
    const height = node.kind === 'concept' ? CONCEPT_HEIGHT : DERIVATION_SIZE;
    const position = {
      x: (node.x ?? 0) - minimumX + 40 - width / 2,
      y: (node.y ?? 0) - minimumY + 40 - height / 2,
    };
    node.memberIds.forEach((id) => { positions[id] = position; });
  });
  return positions;
}

function calculateDagreLayout(
  document: AuthoringDocument,
  nodeIds?: ReadonlySet<string>,
  compact = false,
): Record<string, Position> {
  const included = (id: string) => !nodeIds || nodeIds.has(id);
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
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
  const groups = groupHyperedges(document.graph.hyperedges)
    .map((group) => ({ ...group, members: group.members.filter((member) => included(member.id)) }))
    .filter((group) => group.members.length > 0)
    .map((group) => ({
      ...group,
      layoutId: group.members.some((member) => member.id === group.nodeId) ? group.nodeId : group.members[0].id,
    }));
  groups.forEach((group) => {
    const hyperedge = group.members[0];
    graph.setNode(group.layoutId, { width: DERIVATION_SIZE, height: DERIVATION_SIZE });
    hyperedge.tails.filter(included).forEach((tail) => graph.setEdge(tail, group.layoutId));
    if (included(hyperedge.head)) graph.setEdge(group.layoutId, hyperedge.head);
  });
  dagre.layout(graph);

  const groupByLayoutId = new Map(groups.map((group) => [group.layoutId, group]));
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

export function layoutDocument(
  document: AuthoringDocument,
  { nodeIds, compact = false }: LayoutOptions = {},
): Record<string, Position> {
  const visualNodeCount = nodeIds
    ? document.graph.points.filter((point) => nodeIds.has(point.id)).length
      + document.graph.hyperedges.filter((edge) => nodeIds.has(edge.id)).length
    : document.graph.points.length + document.graph.hyperedges.length;
  return visualNodeCount >= FORCE_LAYOUT_THRESHOLD
    ? calculateForceLayout(document, nodeIds)
    : calculateDagreLayout(document, nodeIds, compact);
}

export function layoutNeighborhood(
  document: AuthoringDocument,
  nodeIds: ReadonlySet<string>,
  anchorId?: string,
  overviewPositions: Record<string, Position> = {},
): Record<string, Position> {
  const positions = layoutDocument(document, { nodeIds, compact: true });
  if (!anchorId || !positions[anchorId] || !overviewPositions[anchorId]) return positions;

  const offset = {
    x: overviewPositions[anchorId].x - positions[anchorId].x,
    y: overviewPositions[anchorId].y - positions[anchorId].y,
  };
  return Object.fromEntries(
    Object.entries(positions).map(([id, position]) => [
      id,
      { x: position.x + offset.x, y: position.y + offset.y },
    ]),
  );
}

import { DragCanvas } from '@antv/g6/esm/behaviors/drag-canvas';
import { DragElement } from '@antv/g6/esm/behaviors/drag-element';
import { OptimizeViewportTransform } from '@antv/g6/esm/behaviors/optimize-viewport-transform';
import { ZoomCanvas } from '@antv/g6/esm/behaviors/zoom-canvas';
import { Line } from '@antv/g6/esm/elements/edges/line';
import { Circle } from '@antv/g6/esm/elements/nodes/circle';
import { Diamond } from '@antv/g6/esm/elements/nodes/diamond';
import { register } from '@antv/g6/esm/registry/register';
import { Graph } from '@antv/g6/esm/runtime/graph';
import { light } from '@antv/g6/esm/themes/light';
import { ArrangeDrawOrder } from '@antv/g6/esm/transforms/arrange-draw-order';
import { GetEdgeActualEnds } from '@antv/g6/esm/transforms/get-edge-actual-ends';
import { UpdateRelatedEdge } from '@antv/g6/esm/transforms/update-related-edge';
import type { EdgeData, GraphData, NodeData } from '@antv/g6/esm/spec/data';

type BenchmarkTimings = {
  entryStarted: number;
  dataReady: number;
  graphConstructed: number;
  renderStarted: number;
  renderFinished: number;
};

const timings: BenchmarkTimings = {
  entryStarted: performance.now(),
  dataReady: 0,
  graphConstructed: 0,
  renderStarted: 0,
  renderFinished: 0,
};

register('behavior', 'drag-canvas', DragCanvas);
register('behavior', 'drag-element', DragElement);
register('behavior', 'optimize-viewport-transform', OptimizeViewportTransform);
register('behavior', 'zoom-canvas', ZoomCanvas);
register('edge', 'line', Line);
register('node', 'circle', Circle);
register('node', 'diamond', Diamond);
register('theme', 'light', light);
register('transform', 'arrange-draw-order', ArrangeDrawOrder);
register('transform', 'get-edge-actual-ends', GetEdgeActualEnds);
register('transform', 'update-related-edges', UpdateRelatedEdge);

type BenchmarkApi = {
  ready: boolean;
  timings: BenchmarkTimings;
  concepts: number;
  visualNodes: number;
  renderedNodes: number;
  visualEdges: number;
  renderedEdges: number;
  hoverNode: (id: string) => Promise<void>;
  openRouteMode: () => void;
  closeRouteMode: () => void;
  focusNode: (id: string) => void;
  highlightRoute: (count?: number) => Promise<void>;
  destroy: () => void;
};

declare global {
  interface Window {
    __g6Benchmark?: BenchmarkApi;
  }
}

type BenchmarkNodeData = {
  kind: 'concept' | 'derivation';
  label: string;
  weight?: number;
};

type BenchmarkEdgeData = {
  kind: 'premise' | 'conclusion';
  derivationId: string;
};

const params = new URLSearchParams(window.location.search);
const concepts = Math.max(4, Number(params.get('concepts') ?? 64));
const showLabels = params.get('labels') !== 'none';
const showOverviewEdges = params.get('edges') !== 'none';
const showDerivations = params.get('derivations') !== 'none';
const requestedBatchSize = Number(params.get('batch') ?? Number.POSITIVE_INFINITY);
const batchSize = Number.isSafeInteger(requestedBatchSize) && requestedBatchSize > 0
  ? requestedBatchSize
  : Number.POSITIVE_INFINITY;
const columns = Math.ceil(Math.sqrt(concepts));

function position(index: number) {
  return {
    x: (index % columns) * 72,
    y: Math.floor(index / columns) * 58,
  };
}

const nodes: NodeData[] = [];
const edges: EdgeData[] = [];
const incidentIds = new Map<string, Set<string>>();

function addIncident(nodeId: string, elementId: string) {
  const ids = incidentIds.get(nodeId) ?? new Set<string>();
  ids.add(elementId);
  incidentIds.set(nodeId, ids);
}

for (let index = 0; index < concepts; index += 1) {
  const conceptPosition = position(index);
  const derivationPosition = { x: conceptPosition.x + 38, y: conceptPosition.y + 3 };
  const weight = (index % 6) + 0.5;
  nodes.push({
    id: `p-${index}`,
    data: { kind: 'concept', label: `Concept ${index}` } satisfies BenchmarkNodeData,
    style: { ...conceptPosition },
  });
  nodes.push({
    id: `h-${index}`,
    data: { kind: 'derivation', label: String(weight), weight } satisfies BenchmarkNodeData,
    style: { ...derivationPosition },
  });

  const tails = [index, (index + concepts - 1) % concepts];
  for (const tail of tails) {
    const edgeId = `premise:h-${index}:p-${tail}`;
    edges.push({
      id: edgeId,
      source: `p-${tail}`,
      target: `h-${index}`,
      data: { kind: 'premise', derivationId: `h-${index}` } satisfies BenchmarkEdgeData,
    });
    addIncident(`p-${tail}`, edgeId);
    addIncident(`h-${index}`, edgeId);
  }
  const conclusionId = `head:h-${index}`;
  const headId = `p-${(index + 1) % concepts}`;
  edges.push({
    id: conclusionId,
    source: `h-${index}`,
    target: headId,
    data: { kind: 'conclusion', derivationId: `h-${index}` } satisfies BenchmarkEdgeData,
  });
  addIncident(`h-${index}`, conclusionId);
  addIncident(headId, conclusionId);
}

const renderedNodes = showDerivations
  ? nodes
  : nodes.filter((node) => (node.data as BenchmarkNodeData).kind === 'concept');
const initialNodes = renderedNodes.slice(0, batchSize);
const deferredNodes = renderedNodes.slice(batchSize);
const initialEdges = showOverviewEdges && showDerivations ? edges : [];
const data: GraphData = { nodes: initialNodes, edges: initialEdges };
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
const materializedNodeIds = new Set(initialNodes.map((node) => node.id));
const materializedEdgeIds = new Set(initialEdges.map((edge) => edge.id));
timings.dataReady = performance.now();

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`benchmark element ${selector} is missing`);
  return element;
}

const container = requireElement('#g6-container');
const routePanel = requireElement('#route-panel');

const graph = new Graph({
  container,
  data,
  animation: false,
  autoFit: { type: 'view', animation: false },
  zoomRange: [0.02, 3],
  node: {
    type: (datum) => (datum.data as BenchmarkNodeData).kind === 'derivation' ? 'diamond' : 'circle',
    style: (datum) => {
      const nodeData = datum.data as BenchmarkNodeData;
      const concept = nodeData.kind === 'concept';
      return {
        size: concept ? 18 : 12,
        fill: concept ? '#f9fbf9' : '#fff3ef',
        stroke: concept ? '#59625e' : '#a44f3f',
        lineWidth: concept ? 1.2 : 1,
        labelText: showLabels ? nodeData.label : '',
        labelPlacement: concept ? 'bottom' : 'center',
        labelFill: concept ? '#26312c' : '#873c30',
        labelFontSize: concept ? 9 : 7,
        labelMaxWidth: concept ? 68 : 18,
        labelWordWrap: false,
      };
    },
    state: {
      hover: { stroke: '#1f5c48', lineWidth: 2.4, halo: true, haloStroke: '#1f5c48', haloLineWidth: 5 },
      focused: { stroke: '#1f5c48', lineWidth: 2.4 },
      route: { stroke: '#2f7087', lineWidth: 2.4, fill: '#edf7f9' },
    },
    animation: false,
  },
  edge: {
    type: 'line',
    style: (datum) => {
      const edgeData = datum.data as BenchmarkEdgeData;
      const premise = edgeData.kind === 'premise';
      return {
        stroke: premise ? '#2f7087' : '#a44f3f',
        lineWidth: 0.8,
        opacity: 0.24,
        endArrow: true,
        endArrowType: 'simple',
        endArrowSize: 4,
      };
    },
    state: {
      hover: { opacity: 1, lineWidth: 1.8 },
      route: { opacity: 1, lineWidth: 2 },
    },
    animation: false,
  },
  behaviors: [
    'drag-canvas',
    { type: 'zoom-canvas', animation: false },
    { type: 'drag-element', animation: false },
    { type: 'optimize-viewport-transform', debounce: 120 },
  ],
});
timings.graphConstructed = performance.now();

let hoveredIds = new Set<string>();
let focusedId: string | null = null;
let routeIds = new Set<string>();

async function updateState(previous: Set<string>, next: Set<string>, state: string) {
  const updates: Record<string, string[]> = {};
  for (const id of previous) {
    if (!next.has(id)) updates[id] = [];
  }
  for (const id of next) {
    if (!previous.has(id)) updates[id] = [state];
  }
  if (Object.keys(updates).length) await graph.setElementState(updates, false);
}

async function hoverNode(id: string) {
  const next = new Set([id, ...(showOverviewEdges && showDerivations ? incidentIds.get(id) ?? [] : [])]);
  await updateState(hoveredIds, next, 'hover');
  hoveredIds = next;
}

function openRouteMode() {
  routePanel.dataset.mode = 'route';
}

function closeRouteMode() {
  routePanel.dataset.mode = 'inspector';
}

function focusNode(id: string) {
  focusedId = id;
}

async function materializeRouteSubgraph(ids: Set<string>) {
  const addedNodes: NodeData[] = [];
  const addedEdges: EdgeData[] = [];
  for (const id of ids) {
    const node = nodeById.get(id);
    if (node && !materializedNodeIds.has(id)) {
      materializedNodeIds.add(id);
      addedNodes.push(node);
    }
    const edge = edgeById.get(id);
    if (edge && !materializedEdgeIds.has(id)) {
      materializedEdgeIds.add(id);
      addedEdges.push(edge);
    }
  }
  if (addedNodes.length) {
    graph.addNodeData(addedNodes);
    await graph.draw();
  }
  for (let offset = 0; offset < addedEdges.length; offset += 96) {
    await new Promise(requestAnimationFrame);
    graph.addEdgeData(addedEdges.slice(offset, offset + 96));
    await graph.draw();
  }
}

async function highlightRoute(count = 64) {
  const next = new Set<string>();
  const length = Math.min(concepts, count);
  for (let index = 0; index < length; index += 1) {
    next.add(`p-${index}`);
    next.add(`h-${index}`);
    next.add(`premise:h-${index}:p-${index}`);
    next.add(`premise:h-${index}:p-${(index + concepts - 1) % concepts}`);
    next.add(`head:h-${index}`);
  }
  await materializeRouteSubgraph(next);
  await updateState(routeIds, next, 'route');
  routeIds = next;
}

async function drawInBatches() {
  await graph.draw();
  for (let offset = 0; offset < deferredNodes.length; offset += batchSize) {
    await new Promise(requestAnimationFrame);
    const batch = deferredNodes.slice(offset, offset + batchSize);
    batch.forEach((node) => materializedNodeIds.add(node.id));
    graph.addNodeData(batch);
    await graph.draw();
  }
}

timings.renderStarted = performance.now();
void drawInBatches().then(() => {
  timings.renderFinished = performance.now();
  window.__g6Benchmark = {
    ready: true,
    timings,
    concepts,
    visualNodes: nodes.length,
    renderedNodes: renderedNodes.length,
    visualEdges: edges.length,
    renderedEdges: showOverviewEdges ? edges.length : 0,
    hoverNode,
    openRouteMode,
    closeRouteMode,
    focusNode,
    highlightRoute,
    destroy: () => graph.destroy(),
  };

  // Keep this read observable so benchmark code can verify focus does not trigger a layout or redraw.
  void focusedId;
}).catch((error: unknown) => {
  window.setTimeout(() => { throw error; });
});

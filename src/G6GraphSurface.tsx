import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Circle as GCircle, Path as GPath, Polygon as GPolygon, Rect as GRect, Text as GText } from '@antv/g';
import { Maximize, Minus, Plus, Replace } from 'lucide-react';
import { DragCanvas } from '@antv/g6/esm/behaviors/drag-canvas';
import { DragElement } from '@antv/g6/esm/behaviors/drag-element';
import { ZoomCanvas } from '@antv/g6/esm/behaviors/zoom-canvas';
import { CanvasEvent } from '@antv/g6/esm/constants/events/canvas';
import { CommonEvent } from '@antv/g6/esm/constants/events/common';
import { GraphEvent } from '@antv/g6/esm/constants/events/graph';
import { NodeEvent } from '@antv/g6/esm/constants/events/node';
import { DerivonConceptNode, DerivonCubicEdge, DerivonDerivationNode } from './g6Elements';
import { register } from '@antv/g6/esm/registry/register';
import { Graph } from '@antv/g6/esm/runtime/graph';
import type { EdgeData, NodeData } from '@antv/g6/esm/spec/data';
import { light } from '@antv/g6/esm/themes/light';
import { ArrangeDrawOrder } from '@antv/g6/esm/transforms/arrange-draw-order';
import { GetEdgeActualEnds } from '@antv/g6/esm/transforms/get-edge-actual-ends';
import { UpdateRelatedEdge } from '@antv/g6/esm/transforms/update-related-edge';
import type { IElementEvent, IPointerEvent } from '@antv/g6/esm/types/event';
import type { Position } from './domain';
import type { ReplacementViewMode } from './projection';
import {
  DERIVATION_SIZE,
  compoundPreview,
  connectionKind,
  cubicPoints,
  hitPort,
  marqueeIntersects,
  nodeBounds,
  portPosition,
  replacementAssistPath,
  sourcePort,
  targetPort,
  type GraphConnectionKind,
  type GraphNodeKind,
} from './graphGeometry';
import type { GraphSceneRuntime } from './graphSceneRuntime';
import {
  createG6SceneSnapshot,
  type G6ReplacementAssist,
  type G6SceneEdge,
  type G6SceneNode,
  type G6SceneSnapshot,
} from './g6SceneSnapshot';
import { planG6SnapshotSync } from './g6SnapshotSync';

register('behavior', 'derivon-drag-canvas', DragCanvas);
register('behavior', 'derivon-drag-element', DragElement);
register('behavior', 'derivon-zoom-canvas', ZoomCanvas);
register('edge', 'derivon-cubic', DerivonCubicEdge);
register('node', 'derivon-concept', DerivonConceptNode);
register('node', 'derivon-derivation', DerivonDerivationNode);
register('theme', 'derivon-light', light);
register('transform', 'derivon-arrange-draw-order', ArrangeDrawOrder);
register('transform', 'derivon-edge-ends', GetEdgeActualEnds);
register('transform', 'derivon-related-edges', UpdateRelatedEdge);

export type G6PointerModifiers = {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export type G6GraphSurfaceHandle = {
  fitView: (ids?: string[]) => Promise<void>;
  fitInitialView: () => Promise<void>;
  focusElement: (ids: string | string[]) => Promise<void>;
  whenIdle: () => Promise<void>;
  clientToGraph: (position: Position) => Position;
  zoomBy: (ratio: number) => Promise<void>;
};

export type G6GraphSurfaceProps = {
  runtime: GraphSceneRuntime;
  onNodeHover: (id: string | null) => void;
  onNodeClick: (id: string, modifiers: G6PointerModifiers) => void;
  onNodeContextMenu: (id: string, modifiers: G6PointerModifiers) => void;
  onNodeDragEnd: (nodes: Array<{ id: string; position: Position }>) => void;
  onConnect: (source: string, target: string, kind: GraphConnectionKind) => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPaneClick: () => void;
  onInteractionChange: (active: boolean) => void;
  onReplacementModeChange: (replaceWith: string, mode: ReplacementViewMode) => void;
  replacementControlsDisabled?: boolean;
  fitViewIds?: string[];
  onError: (error: unknown) => void;
};

type CallbackProps = Omit<G6GraphSurfaceProps, 'runtime'>;

type ReplacementPopoverState = {
  nodeId: string;
  replaceWith: string;
};

const NODE_BATCH_SIZE = 300;
const EDGE_BATCH_SIZE = 96;
const STATE_BATCH_SIZE = 240;
const INITIAL_OVERVIEW_MIN_ZOOM = 0.28;
const REPLACEMENT_MODES: Array<{ mode: ReplacementViewMode; label: string }> = [
  { mode: 'points', label: '原概念' },
  { mode: 'replacement', label: '替换概念' },
  { mode: 'compare', label: '对照' },
];

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function nodeDatum(node: G6SceneNode): NodeData {
  return { id: node.id, data: node.data, style: node.style };
}

function edgeDatum(edge: G6SceneEdge): EdgeData {
  return { id: edge.id, source: edge.source, target: edge.target, data: edge.data };
}

function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function fitGraphElements(
  graph: Graph,
  ids: string[] | undefined,
  duration: number,
  minimumZoom = 0,
): Promise<void> {
  const visibleIds = ids?.filter((id) => graph.hasNode(id)) ?? [];
  if (visibleIds.length) {
    await graph.focusElement(visibleIds, { duration });
  } else if (graph.getNodeData().length) {
    await graph.fitView({ when: 'always' }, { duration });
    if (minimumZoom > 0 && graph.getZoom() < minimumZoom) {
      await graph.zoomTo(minimumZoom, false);
    }
  }
}

async function syncSnapshot(
  graph: Graph,
  previous: G6SceneSnapshot | null,
  next: G6SceneSnapshot,
): Promise<void> {
  if (graph.destroyed) return;
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const previousEdges = new Map((previous?.edges ?? []).map((edge) => [edge.id, edge]));
  const plan = planG6SnapshotSync(
    previous,
    next,
    graph.getNodeData().map((node) => node.id),
    graph.getEdgeData().flatMap((edge) => edge.id
      ? [{ id: edge.id, source: edge.source, target: edge.target }]
      : []),
  );
  const {
    removedEdgeIds,
    removedNodeIds,
    addedNodes,
    updatedNodes,
    addedEdges,
    updatedEdges,
  } = plan;
  let changed = false;

  if (removedEdgeIds.length) {
    graph.removeEdgeData(removedEdgeIds);
    changed = true;
  }
  if (removedNodeIds.length) {
    graph.removeNodeData(removedNodeIds);
    changed = true;
  }
  if (updatedNodes.length) {
    graph.updateNodeData(updatedNodes.map(nodeDatum));
    changed = true;
  }
  if (addedNodes.length <= NODE_BATCH_SIZE) {
    if (addedNodes.length) {
      graph.addNodeData(addedNodes.map(nodeDatum));
      changed = true;
    }
  } else {
    for (let offset = 0; offset < addedNodes.length; offset += NODE_BATCH_SIZE) {
      if (offset > 0) await nextFrame();
      if (graph.destroyed) return;
      graph.addNodeData(addedNodes.slice(offset, offset + NODE_BATCH_SIZE).map(nodeDatum));
      changed = true;
    }
  }
  if (updatedEdges.length) {
    graph.updateEdgeData(updatedEdges.map(edgeDatum));
    changed = true;
  }
  if (addedEdges.length <= EDGE_BATCH_SIZE) {
    if (addedEdges.length) {
      graph.addEdgeData(addedEdges.map(edgeDatum));
      changed = true;
    }
  } else {
    for (let offset = 0; offset < addedEdges.length; offset += EDGE_BATCH_SIZE) {
      await nextFrame();
      if (graph.destroyed) return;
      graph.addEdgeData(addedEdges.slice(offset, offset + EDGE_BATCH_SIZE).map(edgeDatum));
      changed = true;
    }
  }

  const recreatedNodeIds = new Set(addedNodes.map((node) => node.id));
  const recreatedEdgeIds = new Set(addedEdges.map((edge) => edge.id));
  const stateUpdates: Record<string, string[]> = {};
  for (const node of next.nodes) {
    const old = previousNodes.get(node.id);
    if ((recreatedNodeIds.has(node.id) && node.states.length)
      || (!old && node.states.length)
      || (old && !sameData(old.states, node.states))) stateUpdates[node.id] = node.states;
  }
  for (const edge of next.edges) {
    const old = previousEdges.get(edge.id);
    if ((recreatedEdgeIds.has(edge.id) && edge.states.length)
      || (!old && edge.states.length)
      || (old && !sameData(old.states, edge.states))) stateUpdates[edge.id] = edge.states;
  }
  if (graph.destroyed) return;
  const stateEntries = Object.entries(stateUpdates);
  if (stateEntries.length > STATE_BATCH_SIZE && changed) {
    await graph.draw();
    changed = false;
    for (let offset = 0; offset < stateEntries.length; offset += STATE_BATCH_SIZE) {
      await nextFrame();
      if (graph.destroyed) return;
      await graph.setElementState(Object.fromEntries(stateEntries.slice(offset, offset + STATE_BATCH_SIZE)), false);
    }
  } else if (stateEntries.length) {
    await graph.setElementState(stateUpdates, false);
    changed = false;
  }
  if (changed) await graph.draw();
}

function modifiers(event: Pick<IElementEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>): G6PointerModifiers {
  return {
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  };
}

function hasMeaningfulLayout(snapshot: G6SceneSnapshot): boolean {
  if (snapshot.nodes.length <= 1) return true;
  const positions = new Set(snapshot.nodes.slice(0, 32).map((node) => `${Math.round(node.style.x)},${Math.round(node.style.y)}`));
  return positions.size > 1;
}

function assistPathForGraph(graph: Graph, assist: G6ReplacementAssist) {
  if (!graph.hasNode(assist.targetId)) return assist.path;
  const targetPosition = graph.getElementPosition(assist.targetId);
  const members = assist.memberIds.flatMap((id) => {
    if (!graph.hasNode(id)) return [];
    const position = graph.getElementPosition(id);
    return [{ x: position[0], y: position[1] }];
  });
  return replacementAssistPath({ x: targetPosition[0], y: targetPosition[1] }, members);
}

function syncReplacementAssistShapes(
  graph: Graph,
  snapshot: G6SceneSnapshot,
  shapes: Map<string, GPath>,
): void {
  const nextIds = new Set(snapshot.replacementAssists.map((assist) => assist.id));
  shapes.forEach((shape, id) => {
    if (nextIds.has(id)) return;
    shape.remove();
    shapes.delete(id);
  });
  snapshot.replacementAssists.forEach((assist) => {
    const style = {
      d: assistPathForGraph(graph, assist) as never,
      fill: 'none',
      stroke: '#70867a',
      lineWidth: 1.2,
      lineDash: [6, 5],
      endArrow: true,
      endArrowType: 'simple' as const,
      endArrowSize: 6,
      opacity: assist.opacity,
      pointerEvents: 'none' as const,
      zIndex: -10,
    };
    const existing = shapes.get(assist.id);
    if (existing) existing.attr(style);
    else {
      const shape = new GPath({ id: assist.id, style });
      graph.getCanvas().appendChild(shape);
      shapes.set(assist.id, shape);
    }
  });
}

function renderStyleSample(graph: Graph, snapshot: G6SceneSnapshot): string {
  return [
    ...snapshot.nodes.slice(0, 32).flatMap((node) => graph.hasNode(node.id) ? [node.id] : []),
    ...snapshot.edges.slice(0, 32).flatMap((edge) => graph.hasEdge(edge.id) ? [edge.id] : []),
  ].map((id) => {
    const style = graph.getElementRenderStyle(id);
    return `${id}:${Number(style.opacity ?? 1)}:${Number(style.zIndex ?? 0)}`;
  }).join('|');
}

function bezierPath(points: ReturnType<typeof cubicPoints>, color: string, opacity = 0.82): GPath {
  return new GPath({
    style: {
      d: [
        ['M', points.source.x, points.source.y],
        ['C', points.control1.x, points.control1.y, points.control2.x, points.control2.y, points.target.x, points.target.y],
      ],
      fill: 'none',
      stroke: color,
      lineWidth: 1.6,
      opacity,
      pointerEvents: 'none',
      zIndex: 100,
    },
  });
}

const G6GraphSurface = forwardRef<G6GraphSurfaceHandle, G6GraphSurfaceProps>(function G6GraphSurface(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const callbacksRef = useRef<CallbackProps>(props);
  const syncQueueRef = useRef(Promise.resolve());
  const snapshot = useMemo(() => createG6SceneSnapshot(props.runtime), [props.runtime]);
  const snapshotRef = useRef<G6SceneSnapshot | null>(null);
  const replacementAssistShapesRef = useRef(new Map<string, GPath>());
  const connectionActiveRef = useRef(false);
  const marqueeActiveRef = useRef(false);
  const portTooltipVisibleRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [portTooltip, setPortTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [portSample, setPortSample] = useState('');
  const [renderSample, setRenderSample] = useState('');
  const [viewportSample, setViewportSample] = useState('');
  const [fitRequestCount, setFitRequestCount] = useState(0);
  const [replacementAnchor, setReplacementAnchor] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [replacementPopover, setReplacementPopover] = useState<ReplacementPopoverState | null>(null);
  const replacementButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const replacementHoverTimerRef = useRef<number | null>(null);
  const [replacementHoverId, setReplacementHoverId] = useState<string | null>(null);
  const activeReplacementNodeRef = useRef<G6SceneNode | null>(null);
  callbacksRef.current = props;

  const activeReplacementNode = useMemo(() => {
    if (props.replacementControlsDisabled) return null;
    const eligible = snapshot.nodes.filter((node) =>
      node.data.kind === 'concept'
      && node.data.interactive
      && node.data.replacementControls.length > 0,
    );
    return eligible.find((node) => node.id === replacementHoverId)
      ?? eligible.find((node) => node.states.includes('hovered'))
      ?? eligible.find((node) => node.states.includes('selected'))
      ?? null;
  }, [props.replacementControlsDisabled, replacementHoverId, snapshot.nodes]);
  activeReplacementNodeRef.current = activeReplacementNode;
  const activeReplacementControls = useMemo(() => {
    const controls = activeReplacementNode?.data.replacementControls ?? [];
    return controls.filter((control, index) =>
      controls.findIndex((candidate) => candidate.replaceWith === control.replaceWith) === index,
    ).slice(0, 2);
  }, [activeReplacementNode]);
  const updateReplacementAnchor = useCallback(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    const activeNode = activeReplacementNodeRef.current;
    if (!graph || graph.destroyed || !activeNode || !graph.hasNode(activeNode.id) || !container) {
      setReplacementAnchor(null);
      return;
    }
    const center = graph.getElementPosition(activeNode.id);
    const client = graph.getClientByCanvas([center[0] + 48, center[1] - 42]);
    const bounds = container.getBoundingClientRect();
    setReplacementAnchor({
      nodeId: activeNode.id,
      x: client[0] - bounds.left,
      y: client[1] - bounds.top,
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    updateReplacementAnchor();
  }, [portSample, ready, snapshot, updateReplacementAnchor]);

  useEffect(() => {
    if (!replacementPopover) return;
    if (replacementAnchor?.nodeId !== replacementPopover.nodeId
      || !activeReplacementControls.some((control) => control.replaceWith === replacementPopover.replaceWith)) {
      setReplacementPopover(null);
    }
  }, [activeReplacementControls, replacementAnchor?.nodeId, replacementPopover]);

  useEffect(() => {
    if (!replacementPopover) return;
    const close = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('.g6-replacement-overlay')) return;
      setReplacementPopover(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setReplacementPopover(null);
      replacementButtonRefs.current.get(replacementPopover.replaceWith)?.focus();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [replacementPopover]);

  const synchronizedGraph = useCallback(async (): Promise<Graph | null> => {
    let pending = syncQueueRef.current;
    await pending;
    while (pending !== syncQueueRef.current) {
      pending = syncQueueRef.current;
      await pending;
    }
    const graph = graphRef.current;
    return !graph || graph.destroyed || !ready ? null : graph;
  }, [ready]);

  const fitSynchronizedGraph = useCallback(async (
    ids: string[] | undefined,
    duration: number,
    minimumZoom = 0,
  ) => {
    try {
      const graph = await synchronizedGraph();
      if (graph) {
        await fitGraphElements(graph, ids, duration, minimumZoom);
        const position = graph.getPosition();
        setViewportSample(`${graph.getZoom().toFixed(6)}:${position[0].toFixed(3)},${position[1].toFixed(3)}`);
      }
    } catch (error) {
      callbacksRef.current.onError(error);
    }
  }, [synchronizedGraph]);

  useImperativeHandle(ref, () => ({
    async fitView(ids) {
      setReplacementPopover(null);
      setFitRequestCount((current) => current + 1);
      await fitSynchronizedGraph(ids, 260);
    },
    async fitInitialView() {
      setReplacementPopover(null);
      setFitRequestCount((current) => current + 1);
      await fitSynchronizedGraph(undefined, 0, INITIAL_OVERVIEW_MIN_ZOOM);
    },
    async focusElement(ids) {
      setReplacementPopover(null);
      try {
        const graph = await synchronizedGraph();
        if (!graph) return;
        const visibleIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => graph.hasNode(id));
        if (visibleIds.length) await graph.focusElement(visibleIds, { duration: 260 });
      } catch (error) {
        callbacksRef.current.onError(error);
      }
    },
    async whenIdle() {
      await synchronizedGraph();
    },
    clientToGraph(position) {
      const graph = graphRef.current;
      if (!graph || graph.destroyed || !ready) return position;
      const canvasPosition = graph.getCanvasByClient([position.x, position.y]);
      return { x: canvasPosition[0] - 68, y: canvasPosition[1] - 32 };
    },
    async zoomBy(ratio) {
      setReplacementPopover(null);
      const graph = graphRef.current;
      if (!graph || graph.destroyed || !ready) return;
      await graph.zoomBy(ratio, { duration: 160 });
    },
  }), [fitSynchronizedGraph, ready, synchronizedGraph]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    snapshotRef.current = null;
    syncQueueRef.current = Promise.resolve();
    initialFitDoneRef.current = false;
    setReady(false);
    let disposed = false;
    let initialized = false;
    const renderableSnapshot: G6SceneSnapshot = hasMeaningfulLayout(snapshot)
      ? snapshot
      : { ...snapshot, nodes: [], edges: [], replacementAssists: [] };
    const initialNodes = renderableSnapshot.nodes.slice(0, NODE_BATCH_SIZE);
    const initialNodeIds = new Set(initialNodes.map((node) => node.id));
    const initialEdges = renderableSnapshot.edges.filter((edge) =>
      initialNodeIds.has(edge.source) && initialNodeIds.has(edge.target),
    );
    const initialSnapshot: G6SceneSnapshot = {
      ...renderableSnapshot,
      nodes: initialNodes,
      edges: initialEdges,
    };
    const graph = new Graph({
      container,
      data: {
        nodes: initialNodes.map(nodeDatum),
        edges: initialEdges.map(edgeDatum),
      },
      animation: false,
      zoomRange: [0.08, 2],
      padding: [36, 36, 76, 36],
      theme: 'derivon-light',
      transforms: [
        'derivon-arrange-draw-order',
        'derivon-edge-ends',
        'derivon-related-edges',
      ],
      node: {
        type: (datum) => datum.data?.kind === 'derivation' ? 'derivon-derivation' : 'derivon-concept',
        style: (datum) => {
          const data = datum.data as G6SceneNode['data'];
          const concept = data.kind === 'concept';
          return {
            size: concept ? [136, 64] : [54, 54],
            fill: concept ? '#fafbf9' : '#fff9f7',
            stroke: concept ? '#6f7973' : '#8d5147',
            lineWidth: 1,
            radius: concept ? 2 : 0,
            cursor: data.interactive ? 'pointer' : 'default',
            draggable: data.draggable,
            pointerEvents: data.interactive ? 'auto' : 'none',
            opacity: data.opacity,
            zIndex: data.zIndex,
            labelText: data.showLabel ? data.label : '',
            labelPlacement: 'center',
            labelOffsetY: concept ? -8 : 0,
            labelFill: concept ? '#252a27' : '#78392f',
            labelFontFamily: concept ? 'system-ui, sans-serif' : 'ui-monospace, SFMono-Regular, Menlo, monospace',
            labelFontSize: concept ? 13 : 12,
            labelFontWeight: concept ? 650 : 700,
            labelMaxWidth: concept ? 112 : 40,
            labelMaxLines: 1,
            labelWordWrap: true,
            labelTextOverflow: 'ellipsis',
            labelPointerEvents: 'none',
            identityText: data.identity,
            showIdentity: data.showIdentity,
            replacementDepth: data.replacementDepth,
            replacementRoles: data.replacementRoles,
            stackDepth: data.stackDepth,
            ports: data.showPorts ? (concept ? [
              { key: 'concept-in', placement: 'left', r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: data.portsEnabled ? 'auto' : 'none' },
              { key: 'concept-out', placement: 'right', r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: data.portsEnabled ? 'auto' : 'none' },
            ] : [
              { key: 'premise-in', placement: 'left', r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: data.portsEnabled ? 'auto' : 'none' },
              { key: 'conclusion-out', placement: 'right', r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: data.portsEnabled ? 'auto' : 'none' },
            ]) : [],
            port: data.showPorts,
            portLinkToCenter: true,
          };
        },
        state: {
          selected: { stroke: '#1f5c48', lineWidth: 2.4, halo: true, haloStroke: '#1f5c48', haloLineWidth: 4 },
          hovered: { transform: [['translate', 0, -2]], shadowColor: 'rgba(30, 38, 34, 0.18)', shadowBlur: 12, shadowOffsetY: 5, portR: 6.5 },
          emphasized: {},
          dimmed: {},
          'route-member': { stroke: '#4a765f', fill: '#f3f8f4', lineWidth: 2 },
          'route-start': { stroke: '#2f7087', fill: '#f0f7f9', lineWidth: 2.4 },
          'route-target': { stroke: '#a44f3f', fill: '#fff6f3', lineWidth: 2.4 },
          'route-start-target': { stroke: '#a44f3f', fill: '#edf6f4', lineWidth: 2.8 },
        },
        animation: false,
      },
      edge: {
        type: 'derivon-cubic',
        style: (datum) => {
          const data = datum.data as G6SceneEdge['data'];
          const premise = data.kind === 'premise';
          return {
            stroke: premise ? '#2f7087' : '#a44f3f',
            lineWidth: premise ? 1.1 : 1.2,
            opacity: data.opacity,
            endArrow: true,
            endArrowType: 'simple',
            endArrowSize: 6,
            sourcePort: data.sourcePort,
            targetPort: data.targetPort,
            pointerEvents: 'none',
          };
        },
        state: {
          emphasized: { lineWidth: 2 },
          dimmed: {},
          route: { lineWidth: 2.2 },
        },
        animation: false,
      },
      behaviors: [
        {
          type: 'derivon-drag-canvas',
          enable: (event: IPointerEvent) => !disposed
            && event.targetType === 'canvas'
            && !event.shiftKey
            && !connectionActiveRef.current
            && !marqueeActiveRef.current,
        },
        { type: 'derivon-zoom-canvas', animation: false },
        {
          type: 'derivon-drag-element',
          animation: false,
          enable: (event: IElementEvent) => {
            if (disposed || graph.destroyed || connectionActiveRef.current || marqueeActiveRef.current) return false;
            if (!graph.hasNode(event.target.id)) return false;
            const data = graph.getNodeData(event.target.id).data as G6SceneNode['data'];
            return !!data?.draggable;
          },
          onFinish: (ids: string[]) => {
            if (disposed || graph.destroyed) return;
            const moved = ids.flatMap((id) => {
              if (!graph.hasNode(id)) return [];
              const center = graph.getElementPosition(id);
              const data = graph.getNodeData(id).data as G6SceneNode['data'];
              return [{
                id,
                position: {
                  x: center[0] - (data.kind === 'concept' ? 68 : 27),
                  y: center[1] - (data.kind === 'concept' ? 32 : 27),
                },
              }];
            });
            callbacksRef.current.onInteractionChange(false);
            if (moved.length) callbacksRef.current.onNodeDragEnd(moved);
          },
        },
      ],
    });
    graphRef.current = graph;

    type ConnectionGesture = {
      sourceId: string;
      sourceKind: GraphNodeKind;
      targetId: string | null;
      targetKind: GraphNodeKind | null;
      kind: GraphConnectionKind | null;
    };
    type MarqueeGesture = {
      startCanvas: Position;
      startClient: Position;
      endCanvas: Position;
      active: boolean;
      shape: GRect | null;
    };
    let connection: ConnectionGesture | null = null;
    let marquee: MarqueeGesture | null = null;
    let transientShapes: Array<{ remove: () => void }> = [];
    let tooltipTimer: number | null = null;
    let suppressClickUntil = 0;
    let nodeDragging = false;

    const currentSnapshot = () => snapshotRef.current ?? snapshot;
    let initialFitPromise: Promise<void> | null = null;
    const fitInitialView = (): Promise<void> => {
      if (disposed || initialFitDoneRef.current || initialFitPromise || graph.destroyed) {
        return initialFitPromise ?? Promise.resolve();
      }
      const bounds = container.getBoundingClientRect();
      const current = currentSnapshot();
      if (bounds.width <= 0 || bounds.height <= 0 || !graph.getNodeData().length || !hasMeaningfulLayout(current)) {
        return Promise.resolve();
      }
      graph.setSize(Math.floor(bounds.width), Math.floor(bounds.height));
      initialFitPromise = fitGraphElements(graph, undefined, 0, INITIAL_OVERVIEW_MIN_ZOOM).then(() => {
        if (!disposed && !graph.destroyed) initialFitDoneRef.current = true;
      }).finally(() => { initialFitPromise = null; });
      return initialFitPromise;
    };
    const snapshotNode = (id: string) => {
      if (disposed || graph.destroyed || !graph.hasNode(id)) return undefined;
      return currentSnapshot().nodes.find((node) => node.id === id);
    };
    const refreshPortSample = () => {
      if (disposed || graph.destroyed) return;
      const value = currentSnapshot().nodes.slice(0, 16).flatMap((node) => {
        if (!graph.hasNode(node.id)) return [];
        const kind = node.data.kind as GraphNodeKind;
        const center = graph.getElementPosition(node.id);
        const leftPosition = portPosition({ x: center[0], y: center[1] }, kind, targetPort(kind));
        const rightPosition = portPosition({ x: center[0], y: center[1] }, kind, sourcePort(kind));
        const left = graph.getClientByCanvas([leftPosition.x, leftPosition.y]);
        const right = graph.getClientByCanvas([rightPosition.x, rightPosition.y]);
        return [`${node.id}:${Math.round(left[0])},${Math.round(left[1])},${Math.round(right[0])},${Math.round(right[1])}`];
      }).join('|');
      setPortSample(value);
      const position = graph.getPosition();
      setViewportSample(`${graph.getZoom().toFixed(6)}:${position[0].toFixed(3)},${position[1].toFixed(3)}`);
    };
    const panAtViewportEdge = (event: IPointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const edge = 36;
      const speed = 9;
      const dx = event.client.x < bounds.left + edge
        ? speed
        : event.client.x > bounds.right - edge ? -speed : 0;
      const dy = event.client.y < bounds.top + edge
        ? speed
        : event.client.y > bounds.bottom - edge ? -speed : 0;
      if (dx || dy) void graph.translateBy([dx, dy], false);
    };
    const clearTooltip = () => {
      if (tooltipTimer !== null) window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
      portTooltipVisibleRef.current = false;
      setPortTooltip(null);
    };
    const clearTransientShapes = () => {
      transientShapes.forEach((shape) => shape.remove());
      transientShapes = [];
    };
    const appendTransient = <T extends { remove: () => void }>(shape: T): T => {
      graph.getCanvas().appendChild(shape as never);
      transientShapes.push(shape);
      return shape;
    };
    const finishConnection = (commit: boolean) => {
      const completed = connection;
      connection = null;
      connectionActiveRef.current = false;
      clearTransientShapes();
      clearTooltip();
      callbacksRef.current.onInteractionChange(false);
      suppressClickUntil = performance.now() + 180;
      if (commit && completed?.targetId && completed.kind) {
        callbacksRef.current.onConnect(completed.sourceId, completed.targetId, completed.kind);
      }
    };
    const targetForPointer = (event: IPointerEvent): G6SceneNode | null => {
      if (!connection || event.targetType !== 'node') return null;
      const candidate = snapshotNode((event.target as { id: string }).id);
      if (!candidate || candidate.id === connection.sourceId || !candidate.data.portsEnabled) return null;
      const kind = candidate.data.kind as GraphNodeKind;
      const center = graph.getElementPosition(candidate.id);
      const pointer = { x: event.canvas.x, y: event.canvas.y };
      return hitPort(pointer, { x: center[0], y: center[1] }, kind, targetPort(kind), graph.getZoom())
        && connectionKind(connection.sourceKind, kind)
        ? candidate
        : null;
    };
    const drawConnection = (event: IPointerEvent) => {
      if (!connection) return;
      if (!graph.hasNode(connection.sourceId)) {
        finishConnection(false);
        return;
      }
      clearTransientShapes();
      const sourceCenter = graph.getElementPosition(connection.sourceId);
      const source = portPosition(
        { x: sourceCenter[0], y: sourceCenter[1] },
        connection.sourceKind,
        sourcePort(connection.sourceKind),
      );
      const targetNode = targetForPointer(event);
      const targetKind = targetNode?.data.kind as GraphNodeKind | undefined;
      const targetCenter = targetNode ? graph.getElementPosition(targetNode.id) : null;
      const target = targetNode && targetKind && targetCenter
        ? portPosition({ x: targetCenter[0], y: targetCenter[1] }, targetKind, targetPort(targetKind))
        : { x: event.canvas.x, y: event.canvas.y };
      const kind = targetNode && targetKind ? connectionKind(connection.sourceKind, targetKind) : null;
      connection.targetId = targetNode?.id ?? null;
      connection.targetKind = targetKind ?? null;
      connection.kind = kind;

      if (kind === 'compound') {
        const preview = compoundPreview(source, target);
        appendTransient(bezierPath(preview.premise, '#2f7087', 0.72));
        appendTransient(bezierPath(preview.conclusion, '#a44f3f', 0.72));
        appendTransient(new GPolygon({ style: {
          points: [
            [preview.junction.x, preview.junction.y - DERIVATION_SIZE / 2],
            [preview.junction.x + DERIVATION_SIZE / 2, preview.junction.y],
            [preview.junction.x, preview.junction.y + DERIVATION_SIZE / 2],
            [preview.junction.x - DERIVATION_SIZE / 2, preview.junction.y],
          ],
          fill: '#fff9f7',
          stroke: '#8d5147',
          lineWidth: 1,
          opacity: 0.72,
          pointerEvents: 'none',
          zIndex: 101,
        } }));
        appendTransient(new GText({ style: {
          x: preview.junction.x,
          y: preview.junction.y,
          text: '1.0',
          fill: '#78392f',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          textBaseline: 'middle',
          opacity: 0.82,
          pointerEvents: 'none',
          zIndex: 102,
        } }));
      } else {
        appendTransient(bezierPath(
          cubicPoints(source, target),
          connection.sourceKind === 'concept' ? '#2f7087' : '#a44f3f',
        ));
      }
      if (targetNode) {
        appendTransient(new GCircle({ style: {
          cx: target.x,
          cy: target.y,
          r: 10,
          fill: 'transparent',
          stroke: targetKind === 'concept' ? '#a44f3f' : '#2f7087',
          lineWidth: 2,
          opacity: 0.72,
          pointerEvents: 'none',
          zIndex: 103,
        } }));
      }
    };
    const clearMarquee = () => {
      marquee?.shape?.remove();
      marquee = null;
      marqueeActiveRef.current = false;
      callbacksRef.current.onInteractionChange(false);
    };
    const startPointer = (event: IPointerEvent) => {
      if (disposed || graph.destroyed || event.button !== 0) return;
      if (event.shiftKey && event.targetType === 'canvas') {
        marquee = {
          startCanvas: { x: event.canvas.x, y: event.canvas.y },
          startClient: { x: event.client.x, y: event.client.y },
          endCanvas: { x: event.canvas.x, y: event.canvas.y },
          active: false,
          shape: null,
        };
        marqueeActiveRef.current = true;
        callbacksRef.current.onInteractionChange(true);
        return;
      }
      if (event.targetType !== 'node') return;
      const sourceNode = snapshotNode((event.target as { id: string }).id);
      if (!sourceNode?.data.portsEnabled) return;
      const kind = sourceNode.data.kind as GraphNodeKind;
      const center = graph.getElementPosition(sourceNode.id);
      if (!hitPort(
        { x: event.canvas.x, y: event.canvas.y },
        { x: center[0], y: center[1] },
        kind,
        sourcePort(kind),
        graph.getZoom(),
      )) return;
      connection = {
        sourceId: sourceNode.id,
        sourceKind: kind,
        targetId: null,
        targetKind: null,
        kind: null,
      };
      connectionActiveRef.current = true;
      clearTooltip();
      callbacksRef.current.onInteractionChange(true);
      drawConnection(event);
    };
    const movePointer = (event: IPointerEvent) => {
      if (disposed || graph.destroyed) return;
      if (connection) {
        panAtViewportEdge(event);
        drawConnection(event);
        return;
      }
      if (marquee) {
        marquee.endCanvas = { x: event.canvas.x, y: event.canvas.y };
        const distance = Math.hypot(event.client.x - marquee.startClient.x, event.client.y - marquee.startClient.y);
        if (!marquee.active && distance >= 4) {
          marquee.active = true;
          marquee.shape = new GRect({ style: {
            x: marquee.startCanvas.x,
            y: marquee.startCanvas.y,
            width: 0,
            height: 0,
            fill: '#1f5c48',
            fillOpacity: 0.08,
            stroke: '#1f5c48',
            lineWidth: 1 / graph.getZoom(),
            pointerEvents: 'none',
            zIndex: 120,
          } });
          graph.getCanvas().appendChild(marquee.shape);
        }
        if (marquee.active && marquee.shape) {
          marquee.shape.attr({
            x: Math.min(marquee.startCanvas.x, marquee.endCanvas.x),
            y: Math.min(marquee.startCanvas.y, marquee.endCanvas.y),
            width: Math.abs(marquee.endCanvas.x - marquee.startCanvas.x),
            height: Math.abs(marquee.endCanvas.y - marquee.startCanvas.y),
          });
        }
        return;
      }
      if (nodeDragging) panAtViewportEdge(event);
      if (event.targetType !== 'node') {
        clearTooltip();
        return;
      }
      const node = snapshotNode((event.target as { id: string }).id);
      if (!node?.data.showPorts) {
        clearTooltip();
        return;
      }
      const kind = node.data.kind as GraphNodeKind;
      const center = graph.getElementPosition(node.id);
      const pointer = { x: event.canvas.x, y: event.canvas.y };
      const output = hitPort(pointer, { x: center[0], y: center[1] }, kind, sourcePort(kind), graph.getZoom());
      const input = hitPort(pointer, { x: center[0], y: center[1] }, kind, targetPort(kind), graph.getZoom());
      if (!output && !input) {
        clearTooltip();
        return;
      }
      if (tooltipTimer !== null || portTooltipVisibleRef.current) return;
      const text = kind === 'concept'
        ? output ? '作为前提开始推导' : '接收推导结论'
        : output ? '设置结论' : '添加前提';
      const bounds = container.getBoundingClientRect();
      tooltipTimer = window.setTimeout(() => {
        tooltipTimer = null;
        portTooltipVisibleRef.current = true;
        setPortTooltip({ text, x: event.client.x - bounds.left, y: event.client.y - bounds.top });
      }, 350);
    };
    const endPointer = (event: IPointerEvent) => {
      if (disposed || graph.destroyed) return;
      if (connection) {
        drawConnection(event);
        finishConnection(!!connection.targetId && !!connection.kind);
        return;
      }
      if (!marquee) return;
      const completed = marquee;
      if (completed.active) {
        const ids = currentSnapshot().nodes.flatMap((node) => {
          if (!node.data.interactive) return [];
          const bounds = nodeBounds(node.style, node.data.kind as GraphNodeKind);
          return marqueeIntersects(bounds, completed.startCanvas, completed.endCanvas) ? [node.id] : [];
        });
        callbacksRef.current.onMarqueeSelect(ids);
        suppressClickUntil = performance.now() + 180;
      }
      clearMarquee();
    };
    const showPortTooltip = movePointer;

    graph.on(GraphEvent.AFTER_TRANSFORM, () => window.requestAnimationFrame(refreshPortSample));
    graph.on(CommonEvent.POINTER_DOWN, startPointer);
    graph.on(CommonEvent.POINTER_MOVE, (event: IPointerEvent) => {
      if (disposed || graph.destroyed) return;
      showPortTooltip(event);
      if (nodeDragging) {
        syncReplacementAssistShapes(graph, currentSnapshot(), replacementAssistShapesRef.current);
      }
    });
    graph.on(CommonEvent.POINTER_UP, endPointer);
    graph.on(NodeEvent.POINTER_ENTER, (event: IElementEvent) => {
      if (disposed || graph.destroyed) return;
      const node = snapshotNode(event.target.id);
      if (!node?.data.interactive) return;
      if (replacementHoverTimerRef.current !== null) window.clearTimeout(replacementHoverTimerRef.current);
      replacementHoverTimerRef.current = null;
      setReplacementHoverId(node.data.replacementControls.length ? event.target.id : null);
      callbacksRef.current.onNodeHover(event.target.id);
    });
    graph.on(GraphEvent.BEFORE_TRANSFORM, () => {
      if (!disposed && !graph.destroyed) setReplacementPopover(null);
    });
    graph.on(GraphEvent.AFTER_TRANSFORM, () => {
      if (!disposed && !graph.destroyed) updateReplacementAnchor();
    });
    graph.on(NodeEvent.POINTER_LEAVE, () => {
      if (disposed || graph.destroyed) return;
      clearTooltip();
      if (replacementHoverTimerRef.current !== null) window.clearTimeout(replacementHoverTimerRef.current);
      replacementHoverTimerRef.current = window.setTimeout(() => {
        replacementHoverTimerRef.current = null;
        setReplacementHoverId(null);
        callbacksRef.current.onNodeHover(null);
      }, 120);
    });
    graph.on(NodeEvent.CLICK, (event: IElementEvent) => {
      if (disposed || graph.destroyed || performance.now() < suppressClickUntil) return;
      const node = snapshotNode(event.target.id);
      if (node?.data.interactive) callbacksRef.current.onNodeClick(event.target.id, modifiers(event));
      else callbacksRef.current.onPaneClick();
    });
    graph.on(NodeEvent.CONTEXT_MENU, (event: IElementEvent) => {
      if (disposed || graph.destroyed) return;
      const node = snapshotNode(event.target.id);
      if (node?.data.interactive) callbacksRef.current.onNodeContextMenu(event.target.id, modifiers(event));
    });
    graph.on(NodeEvent.DRAG_START, (event: IElementEvent) => {
      if (disposed || graph.destroyed) return;
      setReplacementPopover(null);
      const node = snapshotNode(event.target.id);
      if (!connectionActiveRef.current && node?.data.draggable) {
        nodeDragging = true;
        clearTooltip();
        callbacksRef.current.onInteractionChange(true);
      }
    });
    graph.on(NodeEvent.DRAG_END, () => {
      if (!disposed && !graph.destroyed) nodeDragging = false;
    });
    graph.on(CanvasEvent.CLICK, (event: IPointerEvent) => {
      if (disposed || graph.destroyed || performance.now() < suppressClickUntil) return;
      const pointer = { x: event.canvas.x, y: event.canvas.y };
      const zoomPadding = 2 / Math.max(0.08, graph.getZoom());
      const hit = currentSnapshot().nodes
        .filter((node) => node.data.interactive && graph.hasNode(node.id))
        .map((node) => {
          const position = graph.getElementPosition(node.id);
          const center = { x: position[0], y: position[1] };
          const bounds = nodeBounds(center, node.data.kind as GraphNodeKind);
          const contains = pointer.x >= bounds.left - zoomPadding
            && pointer.x <= bounds.right + zoomPadding
            && pointer.y >= bounds.top - zoomPadding
            && pointer.y <= bounds.bottom + zoomPadding;
          return contains ? { node, distance: Math.hypot(pointer.x - center.x, pointer.y - center.y) } : null;
        })
        .filter((candidate): candidate is { node: G6SceneNode; distance: number } => !!candidate)
        .sort((left, right) => right.node.data.zIndex - left.node.data.zIndex || left.distance - right.distance)[0]?.node;
      if (hit) callbacksRef.current.onNodeClick(hit.id, modifiers(event));
      else callbacksRef.current.onPaneClick();
    });
    graph.on(CanvasEvent.DRAG_START, () => {
      if (disposed || graph.destroyed) return;
      setReplacementPopover(null);
      if (!marqueeActiveRef.current && !connectionActiveRef.current) callbacksRef.current.onInteractionChange(true);
    });
    graph.on(CanvasEvent.DRAG_END, () => {
      if (disposed || graph.destroyed) return;
      if (!marqueeActiveRef.current && !connectionActiveRef.current && !nodeDragging) {
        callbacksRef.current.onInteractionChange(false);
      }
    });
    const cancelGestures = () => {
      if (connection) finishConnection(false);
      if (marquee) clearMarquee();
      clearTooltip();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelGestures();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', cancelGestures);

    const initialWithoutStates: G6SceneSnapshot = {
      ...initialSnapshot,
      nodes: initialSnapshot.nodes.map((node) => ({ ...node, states: [] })),
      edges: initialSnapshot.edges.map((edge) => ({ ...edge, states: [] })),
    };
    const initializationPromise = graph.draw().then(() => {
      if (disposed || graph.destroyed) return;
      return syncSnapshot(graph, initialWithoutStates, snapshotRef.current ?? renderableSnapshot);
    }).then(async () => {
      if (disposed || graph.destroyed) return;
      snapshotRef.current = snapshotRef.current ?? renderableSnapshot;
      syncReplacementAssistShapes(graph, snapshotRef.current, replacementAssistShapesRef.current);
      await fitInitialView();
      if (!disposed) {
        const sample = (snapshotRef.current ?? snapshot).nodes.slice(0, 16).flatMap((node) => {
          if (!graph.hasNode(node.id)) return [];
          const kind = node.data.kind as GraphNodeKind;
          const center = graph.getElementPosition(node.id);
          const leftPosition = portPosition({ x: center[0], y: center[1] }, kind, targetPort(kind));
          const rightPosition = portPosition({ x: center[0], y: center[1] }, kind, sourcePort(kind));
          const left = graph.getClientByCanvas([leftPosition.x, leftPosition.y]);
          const right = graph.getClientByCanvas([rightPosition.x, rightPosition.y]);
          return [`${node.id}:${Math.round(left[0])},${Math.round(left[1])},${Math.round(right[0])},${Math.round(right[1])}`];
        }).join('|');
        setPortSample(sample);
        const position = graph.getPosition();
        setViewportSample(`${graph.getZoom().toFixed(6)}:${position[0].toFixed(3)},${position[1].toFixed(3)}`);
        setRenderSample(renderStyleSample(graph, snapshotRef.current ?? snapshot));
        initialized = true;
        setReady(true);
      }
    });
    void initializationPromise.catch((error: unknown) => {
      if (!disposed) callbacksRef.current.onError(error);
    });

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (disposed) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      graph.setSize(width, height);
      if (initialized && !initialFitDoneRef.current) void fitInitialView();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', cancelGestures);
      clearTooltip();
      if (replacementHoverTimerRef.current !== null) window.clearTimeout(replacementHoverTimerRef.current);
      replacementHoverTimerRef.current = null;
      clearTransientShapes();
      replacementAssistShapesRef.current.forEach((shape) => shape.remove());
      replacementAssistShapesRef.current.clear();
      marquee?.shape?.remove();
      connectionActiveRef.current = false;
      marqueeActiveRef.current = false;
      graphRef.current = null;
      const pendingSync = syncQueueRef.current;
      void Promise.allSettled([initializationPromise, pendingSync]).then(() => {
        if (!graph.destroyed) graph.destroy();
      });
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready || snapshotRef.current === snapshot) return;
    const waitingForInitialLayout = !initialFitDoneRef.current
      && !graph.getNodeData().length
      && snapshot.nodes.length > 1
      && !hasMeaningfulLayout(snapshot);
    if (waitingForInitialLayout) return;
    syncQueueRef.current = syncQueueRef.current.then(async () => {
      if (graphRef.current !== graph || graph.destroyed) return;
      await syncSnapshot(graph, snapshotRef.current, snapshot);
      if (graphRef.current !== graph || graph.destroyed) return;
      snapshotRef.current = snapshot;
      syncReplacementAssistShapes(graph, snapshot, replacementAssistShapesRef.current);
      if (!initialFitDoneRef.current) {
        const container = containerRef.current;
        const bounds = container?.getBoundingClientRect();
        if (container && bounds && bounds.width > 0 && bounds.height > 0
          && graph.getNodeData().length && hasMeaningfulLayout(snapshot)) {
          graph.setSize(Math.floor(bounds.width), Math.floor(bounds.height));
          await fitGraphElements(graph, undefined, 0, INITIAL_OVERVIEW_MIN_ZOOM);
          initialFitDoneRef.current = true;
        }
      }
      const sample = snapshot.nodes.slice(0, 16).flatMap((node) => {
        if (!graph.hasNode(node.id)) return [];
        const kind = node.data.kind as GraphNodeKind;
        const center = graph.getElementPosition(node.id);
        const leftPosition = portPosition({ x: center[0], y: center[1] }, kind, targetPort(kind));
        const rightPosition = portPosition({ x: center[0], y: center[1] }, kind, sourcePort(kind));
        const left = graph.getClientByCanvas([leftPosition.x, leftPosition.y]);
        const right = graph.getClientByCanvas([rightPosition.x, rightPosition.y]);
        return [`${node.id}:${Math.round(left[0])},${Math.round(left[1])},${Math.round(right[0])},${Math.round(right[1])}`];
      }).join('|');
      setPortSample(sample);
      const position = graph.getPosition();
      setViewportSample(`${graph.getZoom().toFixed(6)}:${position[0].toFixed(3)},${position[1].toFixed(3)}`);
      setRenderSample(renderStyleSample(graph, snapshot));
    }).catch((error: unknown) => {
      if (graphRef.current === graph && !graph.destroyed) callbacksRef.current.onError(error);
    });
  }, [ready, snapshot]);

  return (
    <div
      className="g6-graph-surface"
      data-renderer="g6"
      data-ready={ready ? 'true' : 'false'}
      data-overview-lod={snapshot.overviewLod ? 'true' : 'false'}
      data-rendered-nodes={snapshot.nodes.length}
      data-rendered-edges={snapshot.edges.length}
      data-labeled-nodes={snapshot.nodes.filter((node) => node.data.showLabel).length}
      data-replacement-assists={snapshot.replacementAssists.length}
      data-replacement-assist-arrow={snapshot.replacementAssists.length ? 'true' : 'false'}
      data-replacement-assist-path={snapshot.replacementAssists.map((assist) => `${assist.id}:${assist.path.map((command) => command.join(',')).join(';')}`).join('|')}
      data-selected-nodes={snapshot.nodes.filter((node) => node.states.includes('selected')).map((node) => node.id).join(',')}
      data-draggable-nodes={snapshot.nodes.filter((node) => node.data.draggable).map((node) => node.id).join(',')}
      data-dimmed-nodes={snapshot.nodes.filter((node) => node.states.includes('dimmed')).map((node) => node.id).join(',')}
      data-route-nodes={snapshot.nodes.filter((node) => node.states.some((state) => state.startsWith('route-'))).map((node) => node.id).join(',')}
      data-emphasized-edges={snapshot.edges.filter((edge) => edge.states.includes('emphasized')).map((edge) => edge.id).join(',')}
      data-layout-sample={snapshot.nodes.slice(0, 12).map((node) => `${node.id}:${Math.round(node.style.x)},${Math.round(node.style.y)}`).join('|')}
      data-port-sample={portSample}
      data-render-style-sample={renderSample}
      data-viewport-sample={viewportSample}
      data-fit-requests={fitRequestCount}
      role="application"
      aria-label="知识图画布"
    >
      <div
        className="g6-graph-canvas"
        ref={containerRef}
        onContextMenuCapture={(event) => event.preventDefault()}
        onWheelCapture={() => setReplacementPopover(null)}
      />
      {replacementAnchor && activeReplacementNode && replacementAnchor.nodeId === activeReplacementNode.id && (
        <div
          className="g6-replacement-overlay"
          style={{ left: replacementAnchor.x, top: replacementAnchor.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerEnter={() => {
            if (replacementHoverTimerRef.current !== null) window.clearTimeout(replacementHoverTimerRef.current);
            replacementHoverTimerRef.current = null;
          }}
          onPointerLeave={() => {
            if (replacementPopover) return;
            replacementHoverTimerRef.current = window.setTimeout(() => {
              replacementHoverTimerRef.current = null;
              setReplacementHoverId(null);
              callbacksRef.current.onNodeHover(null);
            }, 120);
          }}
        >
          <div className="g6-replacement-triggers" role="group" aria-label="替换视图控制">
            {activeReplacementControls.map((control) => (
              <button
                key={control.replaceWith}
                ref={(element) => {
                  if (element) replacementButtonRefs.current.set(control.replaceWith, element);
                  else replacementButtonRefs.current.delete(control.replaceWith);
                }}
                type="button"
                title={control.label}
                aria-label={`${control.label}，打开显示方式`}
                aria-expanded={replacementPopover?.replaceWith === control.replaceWith}
                onClick={() => setReplacementPopover({ nodeId: activeReplacementNode.id, replaceWith: control.replaceWith })}
              >
                <Replace size={13} />
              </button>
            ))}
          </div>
          {replacementPopover && (() => {
            const control = activeReplacementControls.find((item) => item.replaceWith === replacementPopover.replaceWith);
            if (!control) return null;
            return (
              <div className="g6-replacement-popover" role="radiogroup" aria-label={`${control.replaceWith} 显示方式`}>
                {REPLACEMENT_MODES.map(({ mode, label }, index) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={control.mode === mode}
                    className={control.mode === mode ? 'is-active' : ''}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const nextIndex = event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? REPLACEMENT_MODES.length - 1
                          : (index + (event.key === 'ArrowRight' ? 1 : -1) + REPLACEMENT_MODES.length) % REPLACEMENT_MODES.length;
                      (event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined)?.focus();
                    }}
                    onClick={() => {
                      props.onReplacementModeChange(control.replaceWith, mode);
                      setReplacementPopover(null);
                    }}
                  >{label}</button>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {portTooltip && (
        <div className="g6-port-tooltip" role="tooltip" style={{ left: portTooltip.x, top: portTooltip.y }}>
          {portTooltip.text}
        </div>
      )}
      <div className="g6-viewport-controls" role="group" aria-label="画布缩放">
        <button type="button" title="放大" aria-label="放大" onClick={() => { setReplacementPopover(null); void graphRef.current?.zoomBy(1.2, { duration: 160 }); }}><Plus size={15} /></button>
        <button type="button" title="缩小" aria-label="缩小" onClick={() => { setReplacementPopover(null); void graphRef.current?.zoomBy(0.8, { duration: 160 }); }}><Minus size={15} /></button>
        <button type="button" title="适应视图" aria-label="适应视图" onClick={() => {
          setReplacementPopover(null);
          setFitRequestCount((current) => current + 1);
          void fitSynchronizedGraph(props.fitViewIds, 220);
        }}><Maximize size={15} /></button>
      </div>
    </div>
  );
});

export default G6GraphSurface;

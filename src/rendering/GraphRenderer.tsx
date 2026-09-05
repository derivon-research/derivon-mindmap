import { Graph, type EdgeData, type GraphData, type IElementEvent, type NodeData } from '@antv/g6';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GraphMark, GraphObject, GraphRendererProps, GraphView } from './index';

// Namespaces also protect arbitrary IDs containing separators and parallel hyperedges.
const conceptId = (id: string) => JSON.stringify(['concept', id]);
const derivationId = (id: string) => JSON.stringify(['derivation', id]);

function markStyle(marks: readonly GraphMark[], derivation = false, overview = false) {
  const has = (mark: GraphMark) => marks.includes(mark)
    && (!overview || mark === 'known' || mark === 'target');
  return {
    fill: has('completed') ? '#15803d' : has('known') ? '#2563eb' : derivation ? '#d97706' : '#168b72',
    stroke: has('selected') ? '#9333ea' : has('current') ? '#dc2626' : has('target') ? '#d97706' : '#ffffff',
    lineWidth: has('selected') || has('current') || has('target') ? 3 : 1,
    opacity: has('muted') ? 0.35 : 1,
  };
}

/** The view-specific hypergraph translation never leaves this module. */
function drawable(view: GraphView): GraphData {
  const overview = view.kind === 'overview';
  const nodes: NodeData[] = view.concepts.map((concept) => ({
    id: conceptId(concept.id),
    type: overview ? 'circle' : 'rect',
    data: { object: { kind: 'concept', id: concept.id }, label: concept.label },
    style: {
      ...markStyle(concept.marks, false, overview),
      size: overview ? 14 : [176, 56],
      radius: 6,
      labelText: overview ? '' : concept.label,
      labelPlacement: 'center',
      labelFill: '#ffffff',
      labelFontSize: 13,
      labelWordWrap: true,
      labelMaxWidth: 152,
      labelMaxLines: 2,
      labelTextOverflow: 'ellipsis',
      cursor: 'pointer',
    },
  }));
  const edges: EdgeData[] = [];
  for (const hyperedge of view.hyperedges) {
    if (!overview) {
      nodes.push({
        id: derivationId(hyperedge.id),
        type: 'diamond',
        data: { object: { kind: 'derivation', id: hyperedge.id } },
        style: {
          ...markStyle(hyperedge.marks, true), size: 28,
          labelText: String(hyperedge.weight), labelPlacement: 'bottom',
          labelFill: '#475569', labelFontSize: 11, cursor: 'pointer',
        },
      });
      edges.push({ id: JSON.stringify(['head', hyperedge.id]), source: derivationId(hyperedge.id), target: conceptId(hyperedge.head) });
    }
    const marked = markStyle(hyperedge.marks, false, overview);
    hyperedge.tails.forEach((tail, index) => {
      edges.push({
        id: JSON.stringify(['tail', hyperedge.id, index]),
        source: conceptId(tail),
        target: overview ? conceptId(hyperedge.head) : derivationId(hyperedge.id),
        style: overview ? {
          stroke: marked.lineWidth > 1 ? marked.stroke
            : hyperedge.marks.includes('known') ? marked.fill : '#94a3b8',
          lineWidth: marked.lineWidth,
          opacity: marked.opacity * 0.12,
        } : undefined,
      });
    });
  }
  return { nodes, edges };
}

function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Diff data by ID and distinguish topology from label/mark changes. */
function update(graph: Graph, next: GraphData, previous: GraphData) {
  const nodes = new Map(previous.nodes!.map((node) => [node.id, node]));
  const edges = new Map(previous.edges!.map((edge) => [edge.id, edge]));
  const nextNodes = new Set(next.nodes!.map((node) => node.id));
  const nextEdges = new Set(next.edges!.map((edge) => edge.id));
  const topologyChanged = nextNodes.size !== nodes.size || nextEdges.size !== edges.size
    || next.nodes!.some((node) => !nodes.has(node.id))
    || next.edges!.some((edge) => {
      const old = edges.get(edge.id);
      return !old || old.source !== edge.source || old.target !== edge.target;
    });
  graph.removeData({
    edges: previous.edges!.filter((edge) => !nextEdges.has(edge.id)).map((edge) => edge.id!),
    nodes: previous.nodes!.filter((node) => !nextNodes.has(node.id)).map((node) => node.id),
  });
  graph.addData({
    nodes: next.nodes!.filter((node) => !nodes.has(node.id)),
    // Removing a node also removes its incident edges in G6, even if their IDs survive.
    edges: next.edges!.filter((edge) => !graph.hasEdge(edge.id!)),
  });
  graph.updateData({
    nodes: next.nodes!.filter((node) => nodes.has(node.id) && JSON.stringify(nodes.get(node.id)) !== JSON.stringify(node)),
    edges: next.edges!.filter((edge) => edges.has(edge.id) && JSON.stringify(edges.get(edge.id)) !== JSON.stringify(edge)),
  });
  return topologyChanged;
}

export function GraphRenderer({ view, onEvent }: GraphRendererProps) {
  const container = useRef<HTMLDivElement>(null);
  const emit = useRef(onEvent);
  const latest = useRef(view);
  useLayoutEffect(() => {
    emit.current = onEvent;
    latest.current = view;
  }, [view, onEvent]);
  const refresh = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    const host = container.current!;
    let disposed = false;
    let appliedView = latest.current;
    let previous = drawable(appliedView);
    const overview = view.kind === 'overview';
    setBusy(true);
    setFailure(undefined);
    const graph = new Graph({
      container: host,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      animation: false,
      autoFit: { type: 'view', options: { when: 'overflow' }, animation: false },
      padding: 32,
      zoomRange: [0.05, 4],
      data: previous,
      node: {
        type: (node) => node.type as string,
        state: {
          source: { fill: '#b45309', stroke: '#b45309', lineWidth: 2 },
          downstream: { fill: '#0369a1' },
          hovered: { labelText: (node) => String(node.data?.label ?? ''), labelPlacement: 'top', labelFill: '#111827' },
        },
      },
      edge: { type: 'line', style: (edge) => ({ stroke: '#94a3b8', lineWidth: 1, opacity: 0.7, endArrow: !overview, ...edge.style }) },
      layout: overview
        ? { type: 'd3-force', animation: false, iterations: 40, manyBody: { strength: -80 }, link: { distance: 45 } }
        : { type: 'dagre', rankdir: host.clientHeight > host.clientWidth ? 'TB' : 'LR', nodesep: 24, ranksep: 48 },
      behaviors: ['drag-canvas', 'zoom-canvas', 'optimize-viewport-transform'],
    });
    const objectOf = (event: IElementEvent) => graph.getNodeData(event.target.id).data?.object as GraphObject;
    graph.on('node:click', (event: IElementEvent) => emit.current({ type: 'select', object: objectOf(event) }));
    graph.on('node:dblclick', (event: IElementEvent) => emit.current({ type: 'activate', object: objectOf(event) }));
    graph.on('canvas:click', () => emit.current({ type: 'select', object: null }));

    const fail = (error: unknown) => { if (!disposed) { setBusy(false); setFailure(String(error)); } };
    // Serialize initial render, updates and teardown. StrictMode may unmount during layout.
    let work = graph.render().then(afterPaint).then(() => { if (!disposed) setBusy(false); }).catch(fail);
    let hoverIds: string[] = [];
    let pendingHover: string | null = null;
    let hoverQueued = false;
    const highlight = (id: string | null) => {
      pendingHover = id;
      if (hoverQueued) return;
      hoverQueued = true;
      work = work.then(async () => {
        hoverQueued = false;
        if (disposed) return;
        const id = pendingHover;
        const states: Record<string, string[]> = Object.fromEntries(hoverIds.map((key) => [key, []]));
        if (id !== null && graph.hasNode(id)) {
          // G6 owns adjacency. These are structural relationships, not a solved route
          // or a claim that one tail alone satisfies a multi-tail derivation.
          for (const direction of ['in', 'out'] as const) {
            const seen = new Set([id]);
            const pending = [id];
            // Bound hover detail even when one cyclic component is the entire graph.
            for (let cursor = 0; cursor < pending.length && seen.size < 65; cursor++) {
              for (const edge of graph.getRelatedEdgesData(pending[cursor], direction)) {
                if (seen.size >= 65) break;
                const next = direction === 'in' ? edge.source : edge.target;
                if (seen.has(next)) continue;
                seen.add(next);
                pending.push(next);
                (states[next] ??= []).push(direction === 'in' ? 'source' : 'downstream');
              }
            }
          }
          states[id] = ['hovered'];
        }
        hoverIds = Object.keys(states).filter((key) => states[key].length);
        await graph.setElementState(states, false);
      }).catch(fail);
    };
    if (overview) {
      graph.on('node:pointerenter', (event: IElementEvent) => highlight(event.target.id));
      graph.on('node:pointerleave', () => highlight(null));
    }
    refresh.current = () => {
      work = work.then(async () => {
        if (disposed || appliedView === latest.current) return;
        const nextView = latest.current;
        const next = drawable(nextView);
        const topologyChanged = update(graph, next, previous);
        previous = next;
        appliedView = nextView;
        if (topologyChanged) {
          setBusy(true);
          const survivors = hoverIds.filter((id) => graph.hasNode(id));
          await graph.setElementState(Object.fromEntries(survivors.map((id) => [id, []])), false);
          hoverIds = [];
          pendingHover = null;
        }
        await graph.draw();
        if (topologyChanged && !disposed) {
          await graph.layout();
          await graph.fitView({ when: 'overflow' }, false);
          await afterPaint();
          if (!disposed) setBusy(false);
        }
      }).catch(fail);
    };
    const observer = new ResizeObserver(() => {
      if (disposed || host.clientWidth === 0 || host.clientHeight === 0) return;
      graph.setSize(host.clientWidth, host.clientHeight);
    });
    observer.observe(host);
    return () => {
      disposed = true;
      refresh.current = () => {};
      observer.disconnect();
      void work.finally(() => graph.destroy());
    };
  }, [view.kind]);

  useEffect(() => { refresh.current(); }, [view]);

  return <div style={{ width: '100%', height: '100%', position: 'relative', minWidth: 0 }}>
    <div ref={container} role="img" aria-label="Knowledge graph" aria-busy={busy}
      style={{ width: '100%', height: '100%', pointerEvents: busy ? 'none' : 'auto' }} />
    {failure && <p role="alert" style={{ position: 'absolute', inset: 16 }}>{failure}</p>}
  </div>;
}

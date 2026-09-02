// PROTOTYPE — throwaway. Markdown rendering and small graph layouts shared by the variants.
import { useMemo } from 'react';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import dagre from '@dagrejs/dagre';
import { documents, edgeById, labelOf, tagOf, type Edge } from './data';

const marked = new Marked();
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

export function DocumentBody({ id, fallback = '（这个节点没有文档）' }: { id: string; fallback?: string }) {
  const html = useMemo(() => {
    const source = documents[id];
    if (!source) return `<p class="doc-missing">${fallback}</p>`;
    return marked.parse(source) as string;
  }, [id, fallback]);
  return <div className="doc-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export type LaidOutNode = {
  id: string;
  kind: 'point' | 'derivation';
  label: string;
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type LaidOutEdge = { from: string; to: string; points: Array<{ x: number; y: number }> };
export type Layout = { nodes: LaidOutNode[]; links: LaidOutEdge[]; width: number; height: number };

/**
 * Lay out a small sub-hypergraph with dagre. Hyperedges become their own little
 * junction nodes, so a multi-tail derivation reads as one derivation, not as
 * several independent arrows (the AND/OR distinction the model rests on).
 */
export function layoutSubgraph(edgeIds: string[], extraPoints: string[] = [], direction = 'TB'): Layout {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: direction, nodesep: 18, ranksep: 34, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));

  const pointIds = new Set(extraPoints);
  const chosen: Edge[] = [];
  for (const id of edgeIds) {
    const edge = edgeById.get(id);
    if (!edge) continue;
    chosen.push(edge);
    pointIds.add(edge.head);
    edge.tails.forEach((tail) => pointIds.add(tail));
  }
  for (const id of pointIds) {
    graph.setNode(id, { width: Math.min(190, 30 + labelOf(id).length * 15), height: 34, kind: 'point' });
  }
  for (const edge of chosen) {
    graph.setNode(edge.id, { width: 12, height: 12, kind: 'derivation' });
    edge.tails.forEach((tail, index) => graph.setEdge(tail, edge.id, {}, `${edge.id}-${index}`));
    graph.setEdge(edge.id, edge.head, {}, `${edge.id}-head`);
  }
  dagre.layout(graph);

  const nodes: LaidOutNode[] = graph.nodes().map((id) => {
    const node = graph.node(id);
    return {
      id,
      kind: node.kind,
      label: node.kind === 'point' ? labelOf(id) : '',
      tag: node.kind === 'point' ? tagOf(id) : '',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  });
  const links: LaidOutEdge[] = graph.edges().map((edge) => ({
    from: edge.v,
    to: edge.w,
    points: graph.edge(edge).points ?? [],
  }));
  const size = graph.graph();
  return { nodes, links, width: size.width ?? 800, height: size.height ?? 600 };
}

export function polyline(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
}

export const TAG_COLORS: Record<string, string> = {
  '抽象向量空间': '#6366f1',
  '矩阵与消元': '#0ea5e9',
  '四个基本子空间': '#14b8a6',
  '行列式': '#f59e0b',
  '特征值与相似': '#ef4444',
  '内积与正交': '#8b5cf6',
  'SVD 与数据': '#ec4899',
  '复数与 Fourier': '#06b6d4',
  '数值计算': '#84cc16',
  '概率与统计': '#f97316',
  '应用与网络模型': '#64748b',
  '其他': '#94a3b8',
};

export const colorOf = (tag: string) => TAG_COLORS[tag] ?? '#94a3b8';

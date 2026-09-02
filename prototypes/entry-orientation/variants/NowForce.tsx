// PROTOTYPE variant 0 — the control: today's behaviour, so the other three have something to beat.
import { useMemo, useState } from 'react';
import { forceCenter, forceLink, forceManyBody, forceSimulation, forceCollide } from 'd3-force';
import { edges, labelOf, points, tagOf } from '../data';
import { colorOf } from '../render';

type Node = { id: string; x: number; y: number };

export const name = '现状（对照）';

export default function NowForce() {
  const [picked, setPicked] = useState<string[]>([]);
  const laidOut = useMemo(() => {
    const nodes: Array<Node & { index?: number }> = points.map((point) => ({ id: point.id, x: 0, y: 0 }));
    const links = edges.flatMap((edge) => edge.tails.map((tail) => ({ source: tail, target: edge.head })));
    const simulation = forceSimulation(nodes as never[])
      .force('link', forceLink(links as never[]).id((node: never) => (node as Node).id).distance(40).strength(0.6))
      .force('charge', forceManyBody().strength(-90))
      .force('collide', forceCollide(14))
      .force('center', forceCenter(0, 0))
      .stop();
    simulation.tick(320);
    return { nodes: nodes as Node[], links };
  }, []);

  const position = new Map(laidOut.nodes.map((node) => [node.id, node]));
  const xs = laidOut.nodes.map((node) => node.x);
  const ys = laidOut.nodes.map((node) => node.y);
  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const width = Math.max(...xs) - minX + 40;
  const height = Math.max(...ys) - minY + 40;

  return (
    <div className="now-root">
      <div className="now-toolbar">
        <strong>math-reforged</strong>
        <span>293 个概念 · 340 条推导 · force 布局</span>
        <span className="now-task">路线模式：请在图上点出「你已经会的」和「你想学会的」</span>
        <span className="now-picked">已选 {picked.length} 个</span>
        {picked.length > 0 && <button type="button" onClick={() => setPicked([])}>清空</button>}
      </div>
      <svg className="now-canvas" viewBox={`${minX} ${minY} ${width} ${height}`}>
        {laidOut.links.map((link, index) => {
          const from = position.get((link.source as unknown as Node).id ?? (link.source as unknown as string));
          const to = position.get((link.target as unknown as Node).id ?? (link.target as unknown as string));
          if (!from || !to) return null;
          return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#cbd5e1" strokeWidth={0.7} />;
        })}
        {laidOut.nodes.map((node) => (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={picked.includes(node.id) ? 8 : 5}
            fill={picked.includes(node.id) ? '#111827' : colorOf(tagOf(node.id))}
            opacity={0.85}
            onClick={() => setPicked((current) => current.includes(node.id)
              ? current.filter((id) => id !== node.id)
              : [...current, node.id])}
          >
            <title>{labelOf(node.id)}</title>
          </circle>
        ))}
      </svg>
      <p className="now-note">
        这是今天打开一张 293 点的图会看到的东西。壮观，但没有任何地方可以开始：
        标签要 hover 才看得见，「我已经会什么」要逐点点选，而你并不知道自己在看哪里。
      </p>
    </div>
  );
}

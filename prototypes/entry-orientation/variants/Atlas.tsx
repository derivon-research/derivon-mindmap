// PROTOTYPE variant B — 分区地图：图始终在，但从不以 293 点乱麻的形式出现。
// 已知集合按「块」批量设定，而不是逐点点选。
import { useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { pointsByTag, routeSteps, solveRoute, tagLinks, tags, labelOf, tagOf } from '../data';
import { DocumentBody, colorOf, polyline } from '../render';

export const name = '分区地图';

const ROOTS = ['foundation-fields', 'finite-tuple'];

function useTagLayout() {
  return useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 70, marginx: 20, marginy: 20 });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const tag of tags) {
      const count = pointsByTag.get(tag)?.length ?? 0;
      graph.setNode(tag, { width: 150, height: 44 + Math.min(26, count / 3) });
    }
    for (const link of tagLinks) graph.setEdge(link.from, link.to, {});
    dagre.layout(graph);
    return {
      nodes: tags.map((tag) => ({ tag, ...graph.node(tag) })),
      links: graph.edges().map((edge) => ({ ...edge, points: graph.edge(edge).points ?? [] })),
      width: graph.graph().width ?? 900,
      height: graph.graph().height ?? 400,
    };
  }, []);
}

export default function Atlas() {
  const layout = useTagLayout();
  const [known, setKnown] = useState<Set<string>>(new Set(ROOTS));
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const route = useMemo(() => (target ? solveRoute(known, target) : null), [target, known]);
  const steps = useMemo(() => (route ? routeSteps(route, known) : []), [route, known]);
  const touchedTags = useMemo(() => new Set(steps.map((step) => step.tag)), [steps]);
  const stepsByTag = useMemo(() => {
    const grouped = new Map<string, typeof steps>();
    for (const step of steps) grouped.set(step.tag, [...(grouped.get(step.tag) ?? []), step]);
    return grouped;
  }, [steps]);

  const toggleBlock = (tag: string) => {
    const blockPoints = (pointsByTag.get(tag) ?? []).map((point) => point.id);
    setKnown((current) => {
      const next = new Set(current);
      const allKnown = blockPoints.every((id) => next.has(id));
      blockPoints.forEach((id) => (allKnown ? next.delete(id) : next.add(id)));
      ROOTS.forEach((id) => next.add(id));
      return next;
    });
  };

  const knownInTag = (tag: string) => (pointsByTag.get(tag) ?? []).filter((point) => known.has(point.id)).length;

  return (
    <div className="atlas-root">
      <aside className="atlas-side">
        <h3>我已经会什么</h3>
        <p className="atlas-hint">按块勾。整块勾掉比逐点点选快两个数量级 —— 但块是谁划的？</p>
        {tags.map((tag) => {
          const total = pointsByTag.get(tag)?.length ?? 0;
          const mine = knownInTag(tag);
          return (
            <div key={tag} className="atlas-block">
              <button type="button" className="atlas-block-head" onClick={() => toggleBlock(tag)}>
                <span className="dot" style={{ background: colorOf(tag) }} />
                <span>{tag}</span>
                <em>{mine}/{total}</em>
              </button>
              <button type="button" className="atlas-block-more" onClick={() => setOpenTag(openTag === tag ? null : tag)}>
                {openTag === tag ? '收起' : '逐点'}
              </button>
              {openTag === tag && (
                <ul className="atlas-points">
                  {(pointsByTag.get(tag) ?? []).map((point) => (
                    <li key={point.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={known.has(point.id)}
                          onChange={() => setKnown((current) => {
                            const next = new Set(current);
                            if (next.has(point.id)) next.delete(point.id);
                            else next.add(point.id);
                            return next;
                          })}
                        />
                        {point.label}
                      </label>
                      <button type="button" onClick={() => { setTarget(point.id); setReading(null); }}>设为目标</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <p className="atlas-known-count">已知 {known.size} 个概念</p>
      </aside>

      <main className={reading ? 'atlas-main has-drawer' : 'atlas-main'}>
        <div className="atlas-map">
          <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: '100%', height: 320 }}>
            {layout.links.map((link, index) => (
              <path key={index} d={polyline(link.points)} fill="none" stroke="#e2e8f0" strokeWidth={1.6} />
            ))}
            {layout.nodes.map((node) => {
              const total = pointsByTag.get(node.tag)?.length ?? 0;
              const mine = knownInTag(node.tag);
              const touched = touchedTags.has(node.tag);
              return (
                <g key={node.tag} onClick={() => setOpenTag(node.tag)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={node.x - node.width / 2}
                    y={node.y - node.height / 2}
                    width={node.width}
                    height={node.height}
                    rx={10}
                    fill={touched ? colorOf(node.tag) : '#fff'}
                    fillOpacity={touched ? 0.16 : 1}
                    stroke={colorOf(node.tag)}
                    strokeWidth={touched ? 2.4 : 1.2}
                  />
                  <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize={13} fontWeight={600}>{node.tag}</text>
                  <text x={node.x} y={node.y + 15} textAnchor="middle" fontSize={11} fill="#64748b">
                    {mine}/{total} 已会{touched ? ` · 路线经过 ${stepsByTag.get(node.tag)?.length ?? 0}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="atlas-route">
          {!target && <p className="atlas-empty">先在左边勾出你会的块，再展开任意一块把某个概念「设为目标」。</p>}
          {target && route && (
            <>
              <h3>
                {labelOf(target)} · {steps.length} 步 · 成本 {route.cost}
                <span className="atlas-exact">{route.exact ? '精确解' : '近似解（自定义已知集合）'}</span>
              </h3>
              <div className="atlas-step-groups">
                {[...stepsByTag.entries()].map(([tag, group]) => (
                  <section key={tag}>
                    <h4><span className="dot" style={{ background: colorOf(tag) }} />{tag}</h4>
                    {group.map((step) => (
                      <button key={step.pointId} type="button" className="atlas-step" onClick={() => setReading(step.pointId)}>
                        <span>{step.index}</span> {step.label}
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {reading && (
        <aside className="atlas-drawer">
          <header>
            <strong>{labelOf(reading)}</strong>
            <span className="atlas-drawer-tag">{tagOf(reading)}</span>
            <button type="button" onClick={() => setReading(null)}>关闭</button>
          </header>
          <DocumentBody id={reading} />
          <footer>
            <button type="button" onClick={() => {
              const index = steps.findIndex((step) => step.pointId === reading);
              const next = steps[index + 1];
              if (next) setReading(next.pointId);
            }}>下一步 →</button>
            <button type="button" onClick={() => {
              setKnown((current) => new Set(current).add(reading));
            }}>标记为已会</button>
          </footer>
        </aside>
      )}
    </div>
  );
}

// PROTOTYPE variant D — 融合稿：C 的对话入口 + A 的即时资料 + B 的路线子图 + 大图退为独立浏览模式。
// 三个模式，不是三块并列的面板：定向 → 学习 ⇄ 浏览。
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import {
  documents, edges, edgeById, labelOf, points, routeSteps, searchPoints, solveRoute, tagOf, type Step,
} from '../data';
import { DocumentBody, colorOf, layoutSubgraph, polyline } from '../render';

export const name = '融合稿';

const ROOTS = ['foundation-fields', 'finite-tuple'];

type Turn =
  | { kind: 'agent'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'card'; pointId: string }
  | { kind: 'reasons' }
  | { kind: 'targets'; ids: string[] }
  | { kind: 'probe'; ids: string[]; round: number };

/** C 的预设问答保留下来：不想打字的人全程点点就行。 */
const REASONS = [
  { text: '要看懂一篇用到 SVD 的论文', targets: ['svd'] },
  { text: '课上讲到谱定理，跟不上', targets: ['spectral-theorem'] },
  { text: '想搞明白 PCA 到底在干什么', targets: ['principal-component-analysis'] },
  { text: '工作里要用 Kalman 滤波', targets: ['kalman-filter'] },
  { text: '我还不确定，先随便逛逛', targets: [] },
];

let cachedLayout: Array<{ id: string; x: number; y: number }> | null = null;
function forceLayout() {
  if (cachedLayout) return cachedLayout;
  const nodes = points.map((point) => ({ id: point.id, x: 0, y: 0 }));
  const links = edges.flatMap((edge) => edge.tails.map((tail) => ({ source: tail, target: edge.head })));
  forceSimulation(nodes as never[])
    .force('link', forceLink(links as never[]).id((node: never) => (node as { id: string }).id).distance(34).strength(0.7))
    .force('charge', forceManyBody().strength(-70))
    .force('collide', forceCollide(10))
    .force('center', forceCenter(0, 0))
    .stop()
    .tick(300);
  cachedLayout = nodes;
  return cachedLayout;
}

/** One-line plain-text excerpt of a concept's document, for the tutor's quick answers. */
function excerpt(id: string): string {
  const line = (documents[id] ?? '')
    .split('\n')
    .find((text) => text.trim() && !text.startsWith('#') && !text.startsWith('>'));
  if (!line) return '（这个节点没有文档）';
  return `${line.replace(/\$+/g, '').replace(/[*_`]/g, '').slice(0, 130)}…`;
}

/** Probe the points the current route leans on hardest: the ones the most later steps depend on. */
function probeCandidates(steps: Step[], known: Set<string>, asked: Set<string>, size = 6): string[] {
  const leverage = new Map<string, number>();
  for (const step of steps) {
    for (const tail of step.requires) {
      if (known.has(tail) || asked.has(tail)) continue;
      leverage.set(tail, (leverage.get(tail) ?? 0) + 1);
    }
    if (!asked.has(step.pointId) && !known.has(step.pointId)) {
      leverage.set(step.pointId, (leverage.get(step.pointId) ?? 0) + 1);
    }
  }
  return [...leverage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([id]) => id);
}

export default function Fusion() {
  const nodes = forceLayout();
  const [mode, setMode] = useState<'navigate' | 'learn' | 'browse'>('navigate');
  const [turns, setTurns] = useState<Turn[]>([
    { kind: 'agent', text: '这张图有 293 个概念。别看图 —— 先告诉我你为什么来。不想打字就点下面，想直接查某个概念就在下面打它的名字。' },
    { kind: 'reasons' },
  ]);
  const [draft, setDraft] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set(ROOTS));
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [teachTurns, setTeachTurns] = useState<Turn[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const activeNode = useRef<SVGGElement>(null);

  const route = useMemo(() => (targets.length ? solveRoute(known, targets) : null), [targets, known]);
  const steps = useMemo(() => (route ? routeSteps(route, known) : []), [route, known]);
  const routePoints = useMemo(() => new Set(steps.map((step) => step.pointId)), [steps]);
  const current = steps[cursor];

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }); }, [turns, teachTurns]);
  useEffect(() => { activeNode.current?.scrollIntoView({ block: 'center', inline: 'center' }); }, [cursor, mode]);

  const say = (...items: Turn[]) => setTurns((value) => [...value, ...items]);

  const suggestions = searchPoints(draft, 6);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft('');
    say({ kind: 'user', text: trimmed });
    const hit = searchPoints(trimmed, 1)[0];
    if (!hit) {
      say({ kind: 'agent', text: '图里没有直接对上的概念。换个说法，或者从下面的联想里挑一个。' });
      return;
    }
    say(
      { kind: 'agent', text: `「${hit.label}」的资料在这儿。要把它加进目标，还是你本来就会？` },
      { kind: 'card', pointId: hit.id },
    );
  };

  /** 目标可以不只一个。先收齐目标，再一轮轮问已知 —— 路线不在点一下就定下来。 */
  const addTarget = (ids: string[]) => {
    if (!ids.length) {
      say({ kind: 'agent', text: '那先去逐逐看。看到想学的就点「设为目标」，回来我接着问。' });
      setMode('browse');
      return;
    }
    const merged = [...new Set([...targets, ...ids])];
    setTargets(merged);
    setCursor(0);
    say(
      { kind: 'agent', text: `目标记下了：${merged.map((id) => `「${labelOf(id)}」`).join('、')}。还要连带学会别的吗？跟它们同领域的有这几个。` },
      { kind: 'targets', ids: neighbourTargets(merged) },
    );
  };

  const finishTargets = () => {
    const first = routeSteps(solveRoute(known, targets), known);
    say(
      { kind: 'agent', text: `就这 ${targets.length} 个目标。按你现在告诉我的，还差 ${first.length} 步 —— 但我还不知道你会什么。下面这几个，会的点亮。` },
      { kind: 'probe', ids: probeCandidates(first, known, asked), round: 1 },
    );
  };

  const answerProbe = (id: string) => {
    setAsked((value) => new Set(value).add(id));
    setKnown((value) => {
      const next = new Set(value);
      solveRoute(ROOTS, id).pointIds.forEach((pointId) => next.add(pointId));
      next.add(id);
      return next;
    });
  };

  /** 与当前目标同领域、且不在路线上的几个点，给人“顺手再学一个”的机会。 */
  function neighbourTargets(chosen: string[]): string[] {
    const wanted = new Set(chosen);
    const sameTag = new Set(chosen.map((id) => tagOf(id)));
    return points
      .filter((point) => sameTag.has(point.tag) && !wanted.has(point.id))
      .slice(0, 4)
      .map((point) => point.id);
  }

  const askAgain = (round: number) => {
    const next = probeCandidates(steps, known, asked);
    if (!next.length) {
      say({ kind: 'agent', text: '没有更值得问的了 —— 再问下去也不会改变路线。' });
      return;
    }
    say(
      { kind: 'agent', text: `路线变成 ${steps.length} 步了。再来一轮，这次问的是这条路线现在最吃重的几个。` },
      { kind: 'probe', ids: next, round: round + 1 },
    );
  };

  const routeGraph = useMemo(
    () => (route && route.order.length ? layoutSubgraph(route.order, [], 'TB') : null),
    [route],
  );

  // ------------------------------------------------------------------ 浏览模式
  if (mode === 'browse') {
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    return (
      <div className="fusion-browse">
        <div className="fusion-browse-bar">
          <strong>大图浏览</strong>
          <span>随便逛。看到感兴趣的点开，可以直接设为目标，或者标记成你已经会的。</span>
          <button type="button" onClick={() => { setInspecting(null); setMode(steps.length && cursor > 0 ? 'learn' : 'navigate'); }}>
            ← 回{steps.length && cursor > 0 ? '学习' : '对话'}
          </button>
        </div>
        <svg viewBox={`${Math.min(...xs) - 30} ${Math.min(...ys) - 30} ${Math.max(...xs) - Math.min(...xs) + 60} ${Math.max(...ys) - Math.min(...ys) + 60}`}>
          {edges.flatMap((edge) => edge.tails.map((tail, index) => {
            const from = nodes.find((node) => node.id === tail);
            const to = nodes.find((node) => node.id === edge.head);
            if (!from || !to) return null;
            return <line key={`${edge.id}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#e5e7eb" strokeWidth={0.6} />;
          }))}
          {nodes.map((node) => {
            const isKnown = known.has(node.id);
            const onRoute = routePoints.has(node.id);
            return (
              <g key={node.id} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onClick={() => setInspecting(node.id)}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={hovered === node.id ? 8 : onRoute ? 5.5 : 4}
                  fill={targets.includes(node.id) ? '#ef4444' : onRoute ? colorOf(tagOf(node.id)) : isKnown ? '#22c55e' : '#cbd5e1'}
                />
                {(hovered === node.id || inspecting === node.id) && (
                  <text x={node.x + 10} y={node.y + 4} fontSize={11}>{labelOf(node.id)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {inspecting && (
          <aside className="fusion-inspect">
            <header>
              <strong>{labelOf(inspecting)}</strong>
              <button type="button" onClick={() => setInspecting(null)}>关闭</button>
            </header>
            <div className="fusion-inspect-body"><DocumentBody id={inspecting} /></div>
            <footer>
              <button type="button" onClick={() => { addTarget([inspecting]); setInspecting(null); setMode('navigate'); }}>设为目标</button>
              <button type="button" onClick={() => { answerProbe(inspecting); setInspecting(null); }}>这个我会</button>
            </footer>
          </aside>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ 学习模式
  if (mode === 'learn' && route) {
    return (
      <div className="fusion-learn">
        <aside className="fusion-tutor">
          <header>Agent · 教学</header>
          <div className="fusion-tutor-thread">
            <div className="bubble agent"><p>还是我。刚才把路线算出来了，现在我往下讲 —— 卡住就问，我只按图上的前置回答，不跑题。</p></div>
            {teachTurns.map((turn, index) => (
              <div key={index} className={`bubble ${turn.kind === 'user' ? 'user' : 'agent'}`}>
                <p>{'text' in turn ? turn.text : ''}</p>
              </div>
            ))}
            {current && (
              <div className="fusion-tutor-quick">
                {current.requires.slice(0, 3).map((id) => (
                  <button key={id} type="button" onClick={() => setTeachTurns((value) => [
                    ...value,
                    { kind: 'user', text: `「${labelOf(id)}」是什么来着？` },
                    { kind: 'agent', text: `${labelOf(id)}：${excerpt(id)}` },
                  ])}>
                    「{labelOf(id)}」是什么来着？
                  </button>
                ))}
                <button type="button" onClick={() => setTeachTurns((value) => [
                  ...value,
                  { kind: 'user', text: '这一步我早就会了' },
                  { kind: 'agent', text: `那跳过「${current.label}」。后面的路线会重算。` },
                ]) || answerProbe(current.pointId)}>
                  这一步我早就会了
                </button>
              </div>
            )}
            <div ref={threadEnd} />
          </div>
          <footer className="fusion-tutor-foot">
            <button type="button" onClick={() => setMode('navigate')}>← 改目标 / 已知</button>
            <button type="button" onClick={() => setMode('browse')}>⤢ 大图浏览</button>
          </footer>
        </aside>

        <nav className="fusion-rail">
          <div className="fusion-rail-head">
            <span>{targets.map((id) => labelOf(id)).join('、')}</span>
            <em>{Math.min(cursor + 1, steps.length)} / {steps.length}</em>
          </div>
          {routeGraph && (
            <div className="fusion-rail-scroll">
            <svg width={routeGraph.width} height={routeGraph.height} viewBox={`0 0 ${routeGraph.width} ${routeGraph.height}`}>
              {routeGraph.links.map((link, index) => (
                <path key={index} d={polyline(link.points)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
              ))}
              {routeGraph.nodes.map((node) => {
                if (node.kind === 'derivation') return <circle key={node.id} cx={node.x} cy={node.y} r={3} fill="#cbd5e1" />;
                const index = steps.findIndex((step) => step.pointId === node.id);
                const done = index > -1 && index < cursor;
                const active = index === cursor;
                return (
                  <g key={node.id} ref={active ? activeNode : undefined} onClick={() => index > -1 && setCursor(index)} style={{ cursor: index > -1 ? 'pointer' : 'default' }}>
                    <rect
                      x={node.x - node.width / 2}
                      y={node.y - node.height / 2}
                      width={node.width}
                      height={node.height}
                      rx={7}
                      fill={active ? '#4f46e5' : done ? '#eef2ff' : '#fff'}
                      stroke={active ? '#4f46e5' : index > -1 ? colorOf(tagOf(node.id)) : '#e2e8f0'}
                    />
                    <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize={11} fill={active ? '#fff' : '#111827'}>
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            </div>
          )}
          <p className="fusion-rail-note">路线子图 · 点哪一步就跳到哪一步</p>
        </nav>

        <article className="fusion-text">
          {current ? (
            <>
              <header>
                <span>第 {current.index} / {steps.length} 步</span>
                <h2>{current.label}</h2>
                <p>因为 {current.requires.map((id) => labelOf(id)).join(' + ')} → {current.label}</p>
              </header>
              <DocumentBody id={current.pointId} />
              <details className="fusion-derivation">
                <summary>这一步的推导</summary>
                <DocumentBody id={current.edgeId} />
              </details>
              <div className="fusion-text-actions">
                <button type="button" onClick={() => setCursor((value) => value + 1)}>读完了，下一步 →</button>
                <button type="button" onClick={() => setTeachTurns((value) => [...value, { kind: 'agent', text: `我们停在「${current.label}」。它依赖 ${current.requires.map((id) => labelOf(id)).join('、')} —— 你想让我从哪一个重讲？` }])}>
                  没看懂，问 Agent
                </button>
              </div>
            </>
          ) : (
            <div className="fusion-done">
              <h2>这条路线走完了</h2>
              <p>{steps.length} 步，总学习成本 {route.cost}。要不要记住你现在会的东西，下次接着来？</p>
            </div>
          )}
        </article>
      </div>
    );
  }

  // ------------------------------------------------------------------ 定向模式
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  return (
    <div className="fusion-navigate">
      <section className="fusion-chat">
        <div className="fusion-chat-thread">
          {turns.map((turn, index) => {
            if (turn.kind === 'agent' || turn.kind === 'user') {
              return <div key={index} className={`bubble ${turn.kind}`}><p>{turn.text}</p></div>;
            }
            if (turn.kind === 'card') {
              return (
                <div key={index} className="fusion-card">
                  <div className="fusion-card-doc"><DocumentBody id={turn.pointId} /></div>
                  <div className="fusion-card-actions">
                    <button type="button" onClick={() => addTarget([turn.pointId])}>加进目标 →</button>
                    <button type="button" onClick={() => answerProbe(turn.pointId)}>我已经会了</button>
                  </div>
                </div>
              );
            }
            if (turn.kind === 'reasons') {
              return (
                <div key={index} className="choices">
                  {REASONS.map((reason) => (
                    <button key={reason.text} type="button" onClick={() => {
                      say({ kind: 'user', text: reason.text });
                      addTarget(reason.targets);
                    }}>
                      {reason.text}
                    </button>
                  ))}
                </div>
              );
            }
            if (turn.kind === 'targets') {
              return (
                <div key={index} className="fusion-probe">
                  <div className="fusion-probe-grid">
                    {turn.ids.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={targets.includes(id) ? 'is-yes' : ''}
                        onClick={() => setTargets((value) => [...new Set([...value, id])])}
                      >
                        <span className="dot" style={{ background: colorOf(tagOf(id)) }} />
                        {labelOf(id)}
                      </button>
                    ))}
                  </div>
                  {index === turns.length - 1 && (
                    <div className="fusion-probe-actions">
                      <button type="button" className="primary" onClick={finishTargets}>
                        就这{targets.length > 1 ? ` ${targets.length} 个` : '一个'}，问我会什么吧
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={index} className="fusion-probe">
                <span className="fusion-probe-round">第 {turn.round} 轮 · 会的点一下</span>
                <div className="fusion-probe-grid">
                  {turn.ids.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={known.has(id) ? 'is-yes' : ''}
                      onClick={() => answerProbe(id)}
                    >
                      <span className="dot" style={{ background: colorOf(tagOf(id)) }} />
                      {labelOf(id)}
                    </button>
                  ))}
                </div>
                {index === turns.length - 1 && (
                  <div className="fusion-probe-actions">
                    <button type="button" onClick={() => askAgain(turn.round)}>再问我一轮，路线会更准</button>
                    <button type="button" className="primary" onClick={() => { setCursor(0); setMode('learn'); }}>
                      够了，开始学（{steps.length} 步）
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={threadEnd} />
        </div>

        <div className="fusion-composer">
          {draft && suggestions.length > 0 && (
            <div className="fusion-suggest">
              {suggestions.map((point) => (
                <button key={point.id} type="button" onClick={() => submit(point.label)}>
                  <span className="dot" style={{ background: colorOf(point.tag) }} />
                  {point.label}
                  <em>{point.tag}</em>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); submit(draft); }}>
            <input
              autoFocus
              value={draft}
              placeholder="问一个概念，或说出你想学会什么…"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit">发送</button>
          </form>
        </div>
      </section>

      <section className="fusion-graph">
        <svg viewBox={`${Math.min(...xs) - 30} ${Math.min(...ys) - 30} ${Math.max(...xs) - Math.min(...xs) + 60} ${Math.max(...ys) - Math.min(...ys) + 60}`}>
          {nodes.map((node) => {
            const isKnown = known.has(node.id);
            const onRoute = routePoints.has(node.id);
            const isTarget = targets.includes(node.id);
            return (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={isTarget ? 9 : onRoute ? 6 : 3.5}
                fill={isTarget ? '#ef4444' : onRoute ? colorOf(tagOf(node.id)) : isKnown ? '#22c55e' : '#e2e8f0'}
                opacity={isTarget || onRoute || isKnown ? 0.95 : 0.5}
              >
                <title>{labelOf(node.id)}</title>
              </circle>
            );
          })}
        </svg>
        <div className="fusion-graph-legend">
          <span><i style={{ background: '#22c55e' }} />已会 {known.size}</span>
          <span><i style={{ background: '#6366f1' }} />路线 {steps.length}</span>
          <span><i style={{ background: '#ef4444' }} />目标</span>
          <button type="button" onClick={() => setMode('browse')}>⤢ 自己逛</button>
        </div>
      </section>
    </div>
  );
}

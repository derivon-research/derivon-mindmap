// PROTOTYPE variant D — 融合稿：C 的对话入口 + A 的即时资料 + B 的路线子图 + 大图退为独立浏览模式。
// 三个模式，不是三块并列的面板：定向 → 学习 ⇄ 浏览。
// 对话是**一条**会话，跨模式延续：定向态问出来的目标与已知，学习态接着往下讲。
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import {
  documents, edges, edgeById, labelOf, points, routeSteps, searchPoints, solveRoute, tagOf, type Step,
} from '../data';
import { DocumentBody, MarkdownBody, colorOf, displayFormula, layoutSubgraph, polyline } from '../render';

export const name = '融合稿';

const ROOTS = ['foundation-fields', 'finite-tuple'];

type Turn =
  | { kind: 'agent'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'card'; pointId: string }
  | { kind: 'reasons' }
  | { kind: 'targets'; ids: string[] }
  | { kind: 'probe'; ids: string[]; round: number }
  // 富文本回答：整行公式与可交互组件。它们一出现就把对话栏撑开。
  | { kind: 'formula'; text: string; tex: string }
  | { kind: 'widget'; text: string };

type PanelState = 'expanded' | 'default' | 'hidden';
type Mode = 'navigate' | 'learn' | 'browse';

const isRich = (turn: Turn) => turn.kind === 'formula' || turn.kind === 'widget';

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

/** 展开 / 折叠 / 隐藏 三态的控件。 */
function PanelControls({ state, onChange, expandLabel }: {
  state: PanelState;
  onChange: (state: PanelState) => void;
  expandLabel: string;
}) {
  return (
    <span className="panel-controls">
      {state === 'expanded' ? (
        <button type="button" title="收回默认宽度" onClick={() => onChange('default')}>–</button>
      ) : (
        <button type="button" title={expandLabel} onClick={() => onChange('expanded')}>⤢</button>
      )}
      <button type="button" title="隐藏" onClick={() => onChange('hidden')}>×</button>
    </span>
  );
}

/** 占位用的交互组件：数据是假的，存在的意义只是“回答里可以有拖得动的东西”。 */
function TruncationDemo() {
  const values = [9.1, 6.4, 4.8, 3.1, 2.2, 1.4, 0.9, 0.5];
  const [k, setK] = useState(3);
  const total = values.reduce((sum, value) => sum + value * value, 0);
  const kept = values.slice(0, k).reduce((sum, value) => sum + value * value, 0);
  return (
    <div className="tutor-widget">
      <p className="tutor-widget-title">拖动 k，看秩-k 截断保留了多少能量<em>示意，假数据</em></p>
      <div className="tutor-widget-bars">
        {values.map((value, index) => (
          <span key={index} style={{ height: `${value * 7}px`, background: index < k ? '#4f46e5' : '#e2e8f0' }} />
        ))}
      </div>
      <input type="range" min={1} max={values.length} value={k} onChange={(event) => setK(Number(event.target.value))} />
      <p className="tutor-widget-read">k = {k}，保留 {(100 * kept / total).toFixed(1)}% 的能量</p>
    </div>
  );
}

/** 一行纯文本摘要，给对话里的快速回答用。 */
function excerpt(id: string): string {
  const line = (documents[id] ?? '')
    .split('\n')
    .find((text) => text.trim() && !text.startsWith('#') && !text.startsWith('>'));
  if (!line) return '（这个节点没有文档）';
  return `${line.replace(/\$+/g, '').replace(/[*_`]/g, '').slice(0, 130)}…`;
}

/** 探测当前路线最吃重的点：被后面最多步依赖的那几个。 */
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
  const [mode, setMode] = useState<Mode>('navigate');
  // 一条会话，两个模式共用。学习态不是新开一个 Agent，是同一个往下接。
  const [turns, setTurns] = useState<Turn[]>([
    { kind: 'agent', text: '这张图有 293 个概念。别看图 —— 先告诉我你为什么来。不想打字就点下面，想直接查某个概念就在下面打它的名字。' },
    { kind: 'reasons' },
  ]);
  const [draft, setDraft] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set(ROOTS));
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  // 三态面板：展开 / 默认 / 隐藏。展开一侧就把另一侧收起 —— 中间的教材不让位。
  const [tutorPanel, setTutorPanel] = useState<PanelState>('default');
  const [railPanel, setRailPanel] = useState<PanelState>('default');
  const [hovered, setHovered] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const activeNode = useRef<SVGGElement>(null);

  const route = useMemo(() => (targets.length ? solveRoute(known, targets) : null), [targets, known]);
  const steps = useMemo(() => (route ? routeSteps(route, known) : []), [route, known]);
  const routePoints = useMemo(() => new Set(steps.map((step) => step.pointId)), [steps]);
  const current = steps[cursor];

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }); }, [turns, mode, tutorPanel]);
  useEffect(() => { activeNode.current?.scrollIntoView({ block: 'center', inline: 'center' }); }, [cursor, mode, railPanel]);

  /** 说话。带富文本的自动把对话栏撑开，不需要用户先去点展开。 */
  const say = (...items: Turn[]) => {
    setTurns((value) => [...value, ...items]);
    if (mode === 'learn' && items.some(isRich)) {
      setTutorPanel('expanded');
      setRailPanel('hidden');
    }
  };

  const openPanel = (which: 'tutor' | 'rail', state: PanelState) => {
    if (which === 'tutor') {
      setTutorPanel(state);
      if (state === 'expanded') setRailPanel('hidden');
      else if (state !== 'hidden' && railPanel === 'hidden') setRailPanel('default');
    } else {
      setRailPanel(state);
      if (state === 'expanded') setTutorPanel('hidden');
      else if (state !== 'hidden' && tutorPanel === 'hidden') setTutorPanel('default');
    }
  };

  const suggestions = searchPoints(draft, 6);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft('');
    const hit = searchPoints(trimmed, 1)[0];
    if (!hit) {
      say(
        { kind: 'user', text: trimmed },
        { kind: 'agent', text: '图里没有直接对上的概念。换个说法，或者从联想里挑一个。' },
      );
      return;
    }
    say(
      { kind: 'user', text: trimmed },
      {
        kind: 'agent',
        text: mode === 'learn'
          ? `「${hit.label}」的资料在这儿。要把它加进目标，还是你本来就会？`
          : `「${hit.label}」的资料在这儿。要把它加进目标，还是你本来就会？`,
      },
      { kind: 'card', pointId: hit.id },
    );
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

  // ------------------------------------------------------------------ 一条会话，两处渲染
  function renderTurn(turn: Turn, index: number) {
    if (turn.kind === 'agent' || turn.kind === 'user') {
      return <div key={index} className={`bubble ${turn.kind}`}><p>{turn.text}</p></div>;
    }
    if (turn.kind === 'formula') {
      return (
        <div key={index} className="bubble agent is-rich">
          <p>{turn.text}</p>
          <MarkdownBody source={turn.tex} />
        </div>
      );
    }
    if (turn.kind === 'widget') {
      return (
        <div key={index} className="bubble agent is-rich">
          <p>{turn.text}</p>
          <TruncationDemo />
        </div>
      );
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
  }

  function Composer({ placeholder }: { placeholder: string }) {
    return (
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
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">发送</button>
        </form>
      </div>
    );
  }

  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const graphViewBox = `${Math.min(...xs) - 30} ${Math.min(...ys) - 30} ${Math.max(...xs) - Math.min(...xs) + 60} ${Math.max(...ys) - Math.min(...ys) + 60}`;

  return (
    <div className="fusion-root">
      {/* 顶栏属于整个应用，不属于三个面板里的任何一个 */}
      <header className="fusion-topbar">
        <span className="fusion-brand">Derivon</span>
        <span className="fusion-topbar-context">
          {targets.length
            ? `${targets.map((id) => labelOf(id)).join('、')} · ${steps.length} 步${route && !route.exact ? ' · 近似解' : ''}`
            : 'math-reforged · 293 个概念'}
        </span>
        <nav className="fusion-topbar-modes">
          <button
            type="button"
            className={mode === 'navigate' ? 'is-active' : ''}
            onClick={() => setMode('navigate')}
          >
            改目标 / 已知
          </button>
          <button
            type="button"
            className={mode === 'learn' ? 'is-active' : ''}
            disabled={!steps.length}
            onClick={() => setMode('learn')}
          >
            路线学习
          </button>
          <button
            type="button"
            className={mode === 'browse' ? 'is-active' : ''}
            onClick={() => setMode('browse')}
          >
            ⤢ 大图浏览
          </button>
        </nav>
      </header>

      {mode === 'navigate' && (
        <div className="fusion-navigate">
          <section className="fusion-chat">
            <div className="fusion-chat-thread">
              {turns.map(renderTurn)}
              <div ref={threadEnd} />
            </div>
            <Composer placeholder="问一个概念，或说出你想学会什么…" />
          </section>

          <section className="fusion-graph">
            <svg viewBox={graphViewBox}>
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
            </div>
          </section>
        </div>
      )}

      {mode === 'learn' && route && (
        <div className={`fusion-learn tutor-${tutorPanel} rail-${railPanel}`}>
          {tutorPanel === 'hidden' && (
            <button type="button" className="fusion-tab left" onClick={() => openPanel('tutor', 'default')}>Agent 对话 ›</button>
          )}
          {railPanel === 'hidden' && (
            <button type="button" className="fusion-tab right" onClick={() => openPanel('rail', 'default')}>‹ 路线</button>
          )}

          {tutorPanel !== 'hidden' && (
            <aside className="fusion-tutor">
              <header>
                <span>Agent · 同一条会话</span>
                <PanelControls state={tutorPanel} onChange={(state) => openPanel('tutor', state)} expandLabel="展开对话" />
              </header>
              <div className="fusion-tutor-thread">
                {turns.map(renderTurn)}
                {current && (
                  <div className="fusion-tutor-quick">
                    {current.requires.slice(0, 2).map((id) => (
                      <button key={id} type="button" onClick={() => say(
                        { kind: 'user', text: `「${labelOf(id)}」是什么来着？` },
                        { kind: 'agent', text: `${labelOf(id)}：${excerpt(id)}` },
                      )}>
                        「{labelOf(id)}」是什么来着？
                      </button>
                    ))}
                    <button type="button" onClick={() => {
                      const tex = displayFormula(current.edgeId) ?? displayFormula(current.pointId);
                      say(
                        { kind: 'user', text: '把这一步的式子完整写出来' },
                        tex
                          ? { kind: 'formula', text: `「${current.label}」这一步的式子：`, tex }
                          : { kind: 'agent', text: '这一步的文档里没有整行公式。' },
                      );
                    }}>
                      把这一步的式子完整写出来
                    </button>
                    <button type="button" onClick={() => say(
                      { kind: 'user', text: '给我一个可以调的例子' },
                      { kind: 'widget', text: '拖一下试试：' },
                    )}>
                      给我一个可以调的例子
                    </button>
                    <button type="button" onClick={() => {
                      say(
                        { kind: 'user', text: '这一步我早就会了' },
                        { kind: 'agent', text: `那跳过「${current.label}」。后面的路线会重算。` },
                      );
                      answerProbe(current.pointId);
                    }}>
                      这一步我早就会了
                    </button>
                  </div>
                )}
                <div ref={threadEnd} />
              </div>
              <Composer placeholder="接着问，或者说出下一个想学的…" />
            </aside>
          )}

          <article className="fusion-text">
            <div className="fusion-text-column">
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
                    <button type="button" onClick={() => {
                      openPanel('tutor', 'default');
                      say({ kind: 'agent', text: `我们停在「${current.label}」。它依赖 ${current.requires.map((id) => labelOf(id)).join('、')} —— 你想让我从哪一个重讲？` });
                    }}>
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
            </div>
          </article>

          {railPanel !== 'hidden' && (
            <nav className="fusion-rail">
              <div className="fusion-rail-head">
                <span>{targets.map((id) => labelOf(id)).join('、')}</span>
                <em>{Math.min(cursor + 1, steps.length)} / {steps.length}</em>
                <PanelControls state={railPanel} onChange={(state) => openPanel('rail', state)} expandLabel="展开子图" />
              </div>

              {railPanel === 'default' && (
                <ol className="fusion-rail-list">
                  {steps.map((step, index) => (
                    <li key={step.pointId} className={index === cursor ? 'is-active' : index < cursor ? 'is-done' : ''}>
                      <button type="button" onClick={() => setCursor(index)}>
                        <span className="fusion-rail-index">{step.index}</span>
                        <span className="dot" style={{ background: colorOf(step.tag) }} />
                        <span className="fusion-rail-label">{step.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              {railPanel === 'expanded' && routeGraph && (
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
              <p className="fusion-rail-note">
                {railPanel === 'expanded'
                  ? '路线子图 · 看得见哪几步合流、哪几步并行'
                  : '折叠态 · 只排步骤，不画依赖关系'}
              </p>
            </nav>
          )}
        </div>
      )}

      {mode === 'browse' && (
        <div className="fusion-browse">
          <div className="fusion-browse-bar">
            <strong>大图浏览</strong>
            <span>随便逛。看到感兴趣的点开，可以直接设为目标，或者标记成你已经会的。</span>
          </div>
          <svg viewBox={graphViewBox}>
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
      )}
    </div>
  );
}

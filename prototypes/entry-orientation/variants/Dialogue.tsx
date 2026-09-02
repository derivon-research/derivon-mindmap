// PROTOTYPE variant C — 对话先行：图是对话的副产品，从不是操作对象。
// 这里的 Agent 是写死的脚本，没有 LLM：要检验的是形态，不是措辞。
import { useMemo, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { edges, labelOf, points, routeSteps, solveRoute, tagOf } from '../data';
import { DocumentBody, colorOf } from '../render';

export const name = '对话先行';

const ROOTS = ['foundation-fields', 'finite-tuple'];

const REASONS = [
  { id: 'paper', text: '要看懂一篇用到 SVD 的论文', target: 'svd' },
  { id: 'class', text: '课上讲到谱定理，跟不上', target: 'spectral-theorem' },
  { id: 'data', text: '想搞明白 PCA 到底在干什么', target: 'principal-component-analysis' },
  { id: 'filter', text: '工作里要用 Kalman 滤波', target: 'kalman-filter' },
];

const PROBES = [
  'gaussian-elimination', 'basis', 'linear-map', 'determinant',
  'eigen', 'orthonormal', 'inner-product', 'covariance',
];

function useForceLayout() {
  return useMemo(() => {
    const nodes = points.map((point) => ({ id: point.id, x: 0, y: 0 }));
    const links = edges.flatMap((edge) => edge.tails.map((tail) => ({ source: tail, target: edge.head })));
    const simulation = forceSimulation(nodes as never[])
      .force('link', forceLink(links as never[]).id((node: never) => (node as { id: string }).id).distance(34).strength(0.7))
      .force('charge', forceManyBody().strength(-70))
      .force('collide', forceCollide(10))
      .force('center', forceCenter(0, 0))
      .stop();
    simulation.tick(300);
    return nodes as Array<{ id: string; x: number; y: number }>;
  }, []);
}

export default function Dialogue() {
  const nodes = useForceLayout();
  const [stage, setStage] = useState<'why' | 'probe' | 'confirm' | 'teach'>('why');
  const [target, setTarget] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // The agent's inference: saying "I know X" implies knowing what X was built from.
  const known = useMemo(() => {
    const set = new Set(ROOTS);
    for (const [id, yes] of Object.entries(answers)) {
      if (!yes) continue;
      const route = solveRoute(ROOTS, id);
      route.pointIds.forEach((pointId) => set.add(pointId));
      set.add(id);
    }
    return set;
  }, [answers]);

  const route = useMemo(() => (target ? solveRoute(known, target) : null), [target, known]);
  const steps = useMemo(() => (route ? routeSteps(route, known) : []), [route, known]);
  const routePoints = useMemo(() => new Set(steps.map((step) => step.pointId)), [steps]);
  const current = steps[cursor];

  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const viewBox = `${Math.min(...xs) - 30} ${Math.min(...ys) - 30} ${Math.max(...xs) - Math.min(...xs) + 60} ${Math.max(...ys) - Math.min(...ys) + 60}`;

  return (
    <div className="dialogue-root">
      <section className="dialogue-thread">
        <div className="bubble agent">
          <strong>Derivon</strong>
          <p>这张图有 293 个概念。别看图，先回答我三个问题就行。</p>
        </div>

        <div className="bubble agent"><p>你为什么来？</p></div>
        {stage === 'why' ? (
          <div className="choices">
            {REASONS.map((reason) => (
              <button key={reason.id} type="button" onClick={() => { setTarget(reason.target); setStage('probe'); }}>
                {reason.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="bubble user"><p>{REASONS.find((reason) => reason.target === target)?.text ?? labelOf(target ?? '')}</p></div>
        )}

        {stage !== 'why' && (
          <>
            <div className="bubble agent">
              <p>
                目标就是「{labelOf(target!)}」。接下来只问一次：下面这些你会哪些？
                <span className="aside">（不用逐点点选 293 个。会一个，我就当你也会它的前置。）</span>
              </p>
            </div>
            <div className="probe-grid">
              {PROBES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={answers[id] ? 'is-yes' : answers[id] === false ? 'is-no' : ''}
                  onClick={() => setAnswers((current) => ({ ...current, [id]: !current[id] }))}
                >
                  <span className="dot" style={{ background: colorOf(tagOf(id)) }} />
                  {labelOf(id)}
                  <em>{answers[id] ? '会' : '不会'}</em>
                </button>
              ))}
            </div>
          </>
        )}

        {stage === 'probe' && (
          <div className="choices">
            <button type="button" onClick={() => setStage('confirm')}>就这些，继续</button>
          </div>
        )}

        {(stage === 'confirm' || stage === 'teach') && route && (
          <div className="bubble agent">
            <p>
              那么我认为你已经会 <strong>{known.size}</strong> 个概念，到「{labelOf(target!)}」还差{' '}
              <strong>{steps.length}</strong> 步，总学习成本 {route.cost}
              {route.exact ? '（精确解）' : '（近似解）'}。右边亮起来的就是这条路线。
            </p>
          </div>
        )}

        {stage === 'confirm' && (
          <div className="choices">
            <button type="button" onClick={() => setStage('teach')}>开始，第一步讲什么？</button>
            <button type="button" onClick={() => setStage('probe')}>不对，我再改改</button>
          </div>
        )}

        {stage === 'teach' && current && (
          <>
            <div className="bubble agent">
              <p>
                第 {current.index} / {steps.length} 步：<strong>{current.label}</strong>
                <span className="aside">因为 {current.requires.map((id) => labelOf(id)).join(' + ')} → {current.label}</span>
              </p>
            </div>
            <article className="teach-doc">
              <DocumentBody id={current.pointId} />
              {expanded && (
                <div className="teach-derivation">
                  <h4>这一步的推导</h4>
                  <DocumentBody id={current.edgeId} />
                </div>
              )}
            </article>
            <div className="choices">
              <button type="button" onClick={() => { setCursor((value) => value + 1); setExpanded(false); }}>懂了，下一步</button>
              <button type="button" onClick={() => setExpanded((value) => !value)}>
                {expanded ? '收起推导' : '没懂，展开推导'}
              </button>
              <button type="button" onClick={() => { setAnswers((value) => ({ ...value, [current.pointId]: true })); }}>
                这个我早就会了，跳过
              </button>
            </div>
          </>
        )}

        {stage === 'teach' && !current && (
          <div className="bubble agent"><p>这条路线走完了。要不要我记住你现在会的东西，下次接着来？</p></div>
        )}
      </section>

      <section className="dialogue-graph">
        <svg viewBox={viewBox}>
          {nodes.map((node) => {
            const isKnown = known.has(node.id);
            const onRoute = routePoints.has(node.id);
            const isTarget = node.id === target;
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
        <div className="dialogue-legend">
          <span><i style={{ background: '#22c55e' }} />你已经会的 {known.size}</span>
          <span><i style={{ background: '#6366f1' }} />这条路线 {steps.length}</span>
          <span><i style={{ background: '#ef4444' }} />目标</span>
          <span className="muted">图不需要你操作，它只是显示对话的结果</span>
        </div>
      </section>
    </div>
  );
}

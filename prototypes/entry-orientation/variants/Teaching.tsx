// PROTOTYPE variant E — 教学流程：问题 → 推导 → 定义，中间夹理解检查，检查结果回头改权重。
//
// D 的学习态只有「下一步」，等于把教材翻页；这里问的是另一件事：
//   1. 一步的顺序应当是**先问题、后推导、最后定义**，而不是先把定义摆出来。
//   2. Agent 必须**检查理解**，而不是相信「我读完了」。
//   3. 检查结果让 Agent **调工具改这条推导的权重** —— 个人权重就是这么长出来的，
//      群体权重是这些记录的汇总。这一条是止损线 ④ 的源头，所以它必须在界面上看得见。
import { useMemo, useState } from 'react';
import { documents, labelOf, routeSteps, solveRoute, tagOf, weightOf, type Weights } from '../data';
import { DocumentBody, colorOf } from '../render';

export const name = '教学流程';

const KNOWN_PRESET = [
  'foundation-fields', 'finite-tuple', 'matrix-array', 'matrix-vector-product', 'linear-system',
  'matrix-multiplication', 'identity-matrix', 'inverse-matrix', 'matrix-transpose', 'row-operation',
  'pivot', 'gaussian-elimination', 'determinant', 'dot-product', 'euclidean-norm',
];

const TARGETS = ['svd', 'spectral-theorem', 'jordan-form', 'principal-component-analysis'];

type Phase = 'problem' | 'derivation' | 'check' | 'verdict' | 'definition' | 'calibrate';
type Verdict = 'solid' | 'shaky' | 'lost';

type LogEntry = {
  edgeId: string;
  label: string;
  from: number;
  to: number;
  verdict: Verdict;
  reason: string;
  peeked: boolean;
};

const VERDICTS: Array<{ id: Verdict; label: string; factor: number; reason: string }> = [
  { id: 'solid', label: '答对了，而且说出了为什么', factor: 0.7, reason: '一次通过，未看推导' },
  { id: 'shaky', label: '大意对，但说不清哪一条前提在起作用', factor: 1.0, reason: '通过但依据模糊' },
  { id: 'lost', label: '没答上来', factor: 1.6, reason: '未通过理解检查' },
];

/** 推导文档的第一个二级标题：这些文档里它通常正是「为什么需要这一步」。 */
function problemHeading(id: string): string | null {
  const source = documents[id];
  if (!source) return null;
  const line = source.split('\n').find((text) => text.startsWith('## '));
  return line ? line.replace(/^##\s*/, '') : null;
}

export default function Teaching() {
  const [target, setTarget] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights>({});
  const [known, setKnown] = useState<Set<string>>(new Set(KNOWN_PRESET));
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>('problem');
  const [attempt, setAttempt] = useState('');
  const [peeked, setPeeked] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastChange, setLastChange] = useState<{ before: number; after: number; steps: number } | null>(null);

  const route = useMemo(
    () => (target ? solveRoute(known, [target], weights) : null),
    [target, known, weights],
  );
  const steps = useMemo(() => (route ? routeSteps(route, known) : []), [route, known]);
  const step = steps[cursor];

  if (!target) {
    return (
      <div className="teach-start">
        <h1>先问题，再推导，最后才是定义</h1>
        <p>
          这一版不问「界面长什么样」，问的是<strong>一步课应当怎么走</strong>。每一步先只给问题，
          答完才给推导，检查通过才给定义；检查的结果会当场改掉这条推导的权重，路线随之重算。
        </p>
        <p className="teach-start-known">
          已知集合固定成「工科一学期：会算矩阵」（{KNOWN_PRESET.length} 个概念）。选一个目标：
        </p>
        <div className="teach-start-targets">
          {TARGETS.map((id) => (
            <button key={id} type="button" onClick={() => { setTarget(id); setPhase('problem'); }}>
              {labelOf(id)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div className="teach-start">
        <h1>这条路线走完了</h1>
        <p>一共 {steps.length} 步。下面这份记录才是这个原型真正想要的东西。</p>
        <CalibrationLog log={log} weights={weights} />
        <div className="teach-start-targets">
          <button type="button" onClick={() => { setTarget(null); setCursor(0); setLog([]); setWeights({}); setKnown(new Set(KNOWN_PRESET)); }}>
            重来一遍
          </button>
        </div>
      </div>
    );
  }

  const baseWeight = weightOf(step.edgeId);
  const heading = problemHeading(step.edgeId) ?? problemHeading(step.pointId);

  const applyVerdict = (verdict: Verdict) => {
    const rule = VERDICTS.find((item) => item.id === verdict)!;
    const factor = peeked && verdict === 'solid' ? 1.0 : rule.factor;
    const from = weightOf(step.edgeId, weights);
    const to = Math.round(from * factor * 10) / 10;
    const before = route?.cost ?? 0;
    const nextWeights = { ...weights, [step.edgeId]: to };
    const nextRoute = solveRoute(known, [target], nextWeights);
    setWeights(nextWeights);
    setLog((value) => [...value, {
      edgeId: step.edgeId,
      label: step.label,
      from,
      to,
      verdict,
      reason: peeked && verdict === 'solid' ? '看过推导之后才答对' : rule.reason,
      peeked,
    }]);
    setLastChange({ before, after: nextRoute.cost ?? 0, steps: routeSteps(nextRoute, known).length });
    setPhase(verdict === 'lost' ? 'derivation' : 'definition');
  };

  const advance = () => {
    setKnown((value) => new Set(value).add(step.pointId));
    setCursor(0); // 已知集合变了，路线重算，从新路线的第一步继续
    setPhase('problem');
    setAttempt('');
    setPeeked(false);
    setLastChange(null);
  };

  return (
    <div className="teach-root">
      <aside className="teach-agent">
        <header>Agent · 一步一步来</header>
        <div className="teach-agent-thread">
          <div className="bubble agent">
            <p>
              这一步要造出的是<strong>「{step.label}」</strong>。你手上已经有
              {step.requires.map((id) => `「${labelOf(id)}」`).join('、')}。
            </p>
          </div>
          {phase === 'problem' && (
            <div className="bubble agent"><p>先别看定义。你觉得，光靠这些东西，怎么才能得到它？说个大概方向就行。</p></div>
          )}
          {phase === 'derivation' && (
            <div className="bubble agent"><p>这是这一步的推导。读的时候盯住一件事：<strong>哪一条前提在什么地方被用上了</strong>。</p></div>
          )}
          {phase === 'check' && (
            <div className="bubble agent">
              <p>
                不看文档回答：为什么把{step.requires.map((id) => `「${labelOf(id)}」`).join('、')}
                放在一起就能得到「{step.label}」？如果把
                「{labelOf(step.requires[0])}」去掉，这一步还成立吗？
              </p>
            </div>
          )}
          {phase === 'verdict' && (
            <div className="bubble agent">
              <p>
                你的回答：<em>{attempt || '（空）'}</em>
              </p>
              <p className="teach-standin">
                原型里没有模型，<strong>请你替它判一次</strong>。真做的时候这一步由 Agent 判定，
                判定结果直接决定下面那个工具调用。
              </p>
            </div>
          )}
          {phase === 'definition' && (
            <div className="bubble agent"><p>现在才给定义。你已经知道它是为了解决什么问题、怎么造出来的，定义只是把它固定下来。</p></div>
          )}
          {phase === 'calibrate' && (
            <div className="bubble agent"><p>我把这一步在<strong>你身上</strong>的成本改了。路线跟着重算 —— 这就是个人权重。</p></div>
          )}
        </div>
        <CalibrationLog log={log} weights={weights} compact />
      </aside>

      <main className="teach-stage">
        <div className="teach-stage-head">
          <span>第 {cursor + 1} 步 · 还剩 {steps.length} 步 · 目标「{labelOf(target)}」</span>
          <span className="teach-phases">
            {(['problem', 'derivation', 'check', 'definition'] as Phase[]).map((item) => (
              <i key={item} className={phase === item || (phase === 'verdict' && item === 'check') || (phase === 'calibrate' && item === 'definition') ? 'is-active' : ''}>
                {item === 'problem' ? '问题' : item === 'derivation' ? '推导' : item === 'check' ? '检查' : '定义'}
              </i>
            ))}
          </span>
        </div>

        {phase === 'problem' && (
          <section className="teach-card">
            <h2>{heading ?? `怎么从${step.requires.map((id) => labelOf(id)).join(' + ')}造出「${step.label}」？`}</h2>
            <p className="teach-card-note">
              这一屏<strong>故意</strong>不显示定义，也不显示推导。先想。
            </p>
            <textarea
              value={attempt}
              placeholder="写下你的想法，一句话也行…"
              onChange={(event) => setAttempt(event.target.value)}
            />
            <div className="teach-actions">
              <button type="button" className="primary" onClick={() => setPhase('derivation')}>
                想好了，看推导
              </button>
              <button type="button" onClick={() => { setPeeked(true); setPhase('derivation'); }}>
                想不出来，直接看
              </button>
            </div>
          </section>
        )}

        {phase === 'derivation' && (
          <section className="teach-card">
            <h2>推导：{step.requires.map((id) => labelOf(id)).join(' + ')} → {step.label}</h2>
            <DocumentBody id={step.edgeId} />
            <div className="teach-actions">
              <button type="button" className="primary" onClick={() => setPhase('check')}>读完了，检查我</button>
              <button type="button" onClick={() => { setPeeked(true); setPhase('check'); }}>还是有点糊，但先测</button>
            </div>
          </section>
        )}

        {phase === 'check' && (
          <section className="teach-card">
            <h2>理解检查</h2>
            <p className="teach-card-note">推导已经收起来了 —— 检查的意义在于不看着答案回答。</p>
            <textarea
              value={attempt}
              placeholder="用你自己的话写…"
              onChange={(event) => setAttempt(event.target.value)}
            />
            <div className="teach-actions">
              <button type="button" className="primary" onClick={() => setPhase('verdict')}>提交</button>
              <button type="button" onClick={() => setPhase('derivation')}>回去再读一遍</button>
            </div>
          </section>
        )}

        {phase === 'verdict' && (
          <section className="teach-card">
            <h2>判定<span className="teach-standin-tag">原型里由你替模型判</span></h2>
            <div className="teach-verdicts">
              {VERDICTS.map((item) => (
                <button key={item.id} type="button" onClick={() => applyVerdict(item.id)}>
                  <strong>{item.label}</strong>
                  <span>
                    权重 ×{item.factor}
                    {item.id === 'solid' && peeked ? '（你看过推导，这次不打折）' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {phase === 'definition' && (
          <section className="teach-card">
            <h2>定义：{step.label}</h2>
            <DocumentBody id={step.pointId} />
            <div className="teach-actions">
              <button type="button" className="primary" onClick={() => setPhase('calibrate')}>好，看看这一步改了什么</button>
            </div>
          </section>
        )}

        {phase === 'calibrate' && (
          <section className="teach-card">
            <h2>Agent 调用了工具</h2>
            <pre className="teach-toolcall">
{`adjust_weight({
  hyperedge: "${step.edgeId}",
  learner:   "me",
  from:      ${log[log.length - 1]?.from ?? baseWeight},
  to:        ${log[log.length - 1]?.to ?? baseWeight},
  reason:    "${log[log.length - 1]?.reason ?? ''}"
})`}
            </pre>
            <p className="teach-card-note">
              权重是<strong>这条推导对你</strong>的学习成本，不是对所有人的。改完立刻重算路线：
            </p>
            {lastChange && (
              <ul className="teach-diff">
                <li>路线总成本 {lastChange.before} → <strong>{lastChange.after}</strong></li>
                <li>剩余步数 {steps.length} → <strong>{lastChange.steps}</strong></li>
                <li className="muted">
                  同一份记录汇总到所有人身上，就是群体权重的原料 —— 也是唯一越晚开始越贵的东西。
                </li>
              </ul>
            )}
            <div className="teach-actions">
              <button type="button" className="primary" onClick={advance}>学会了，下一步 →</button>
            </div>
          </section>
        )}
      </main>

      <nav className="teach-rail">
        <div className="teach-rail-head">路线 · 权重是你的</div>
        <ol>
          {steps.map((item, index) => {
            const personal = weights[item.edgeId];
            return (
              <li key={item.pointId} className={index === cursor ? 'is-active' : ''}>
                <span className="dot" style={{ background: colorOf(tagOf(item.pointId)) }} />
                <span className="teach-rail-label">{item.label}</span>
                <span className={`teach-rail-weight ${personal ? 'is-changed' : ''}`}>
                  {personal ? `${weightOf(item.edgeId)}→${personal}` : weightOf(item.edgeId)}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

function CalibrationLog({ log, weights, compact }: { log: LogEntry[]; weights: Weights; compact?: boolean }) {
  const total = Object.keys(weights).length;
  return (
    <div className={`teach-log ${compact ? 'is-compact' : ''}`}>
      <header>标定记录 · {log.length} 条 · 改过 {total} 条推导</header>
      {log.length === 0 && <p className="muted">还没有。每通过一次检查就产生一条。</p>}
      <ul>
        {log.map((entry, index) => (
          <li key={index}>
            <span className="teach-log-label">{entry.label}</span>
            <span className={`teach-log-delta ${entry.to > entry.from ? 'up' : entry.to < entry.from ? 'down' : ''}`}>
              {entry.from} → {entry.to}
            </span>
            <span className="teach-log-reason">{entry.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

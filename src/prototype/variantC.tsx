/**
 * PROTOTYPE ONLY — Variant C: 路线是求解结果的改写，住在开局里.
 *
 * 创作侧：没有「路线」页。开局视图的大纲里，开场问题下面多一节「预设路线」；选中一条，
 * 中间左右对照：左边是求解器对同一目标与已知给的路线（只读），右边是这条路线，改动逐步标出
 * （增、换、挪、删）。一条路线被理解成「对最优解的有意偏离」。
 * 学习侧：路线预览屏上，求解器的与作者的、我的并排成标签页；任选两条对照；「以此改一条我的」
 * 进入同一个对照编辑器。
 */
import { ArrowDown, ArrowUp, Compass, List, Network, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { graph, newRouteId, FOUNDATIONS, solverDraft } from './data';
import { GapList, SaveBar, resolve, useDraft } from './editorParts';
import {
  addDerivation, copyAsPersonal, moveStep, parallelsOf, readRoute, removeDerivation, rename, swapDerivation,
  withKnown, withTargets, type Route,
} from './routeModel';
import { ConceptChips, DerivationSearch, RouteStatus, conceptLabel, derivationEdge, issueDerivation, issueText, stepLabel, stepNeeds, type Mode, type RouteSession } from './shared';

export function VariantC({ mode, session }: { readonly mode: Mode; readonly session: RouteSession }) {
  return mode === 'authoring' ? <AuthoringC session={session} /> : <LearningC session={session} />;
}

function AuthoringC({ session }: { readonly session: RouteSession }) {
  const routes = session.routes.filter((route) => route.owner === 'workspace');
  const [selectedId, setSelectedId] = useState<string | null>(routes[0]?.id ?? null);
  const [creating, setCreating] = useState<Route | null>(null);
  const selected = creating ?? routes.find((route) => route.id === selectedId) ?? null;
  return <section className="authoring-workbench">
    <div className="authoring-workbar"><div className="authoring-tabs" role="group">
      <button type="button" aria-pressed="false"><List size={15} />对象</button>
      <button type="button" aria-pressed="false"><Network size={15} />图浏览</button>
      <button type="button" aria-pressed="true"><Compass size={15} />开局</button>
    </div><span className="authoring-flex" /></div>
    <div className="p-a-frame">
      <aside className="p-a-list p-c-outline" aria-label="开局大纲">
        <header><strong>开局大纲</strong></header>
        <p className="p-c-section">默认路线种子</p>
        <p className="p-c-muted">目标：—　已知：数域、有限有序组</p>
        <p className="p-c-section">开场问题</p>
        <ol className="p-c-muted"><li>先说你为什么来。</li><li>这些你已经会哪些？</li></ol>
        <p className="p-c-section">预设路线 <small>学习者可以直接挑一条</small></p>
        <ul>{routes.map((route) => <li key={route.id}><button type="button" className={route.id === selected?.id ? 'is-current' : ''}
          onClick={() => { setCreating(null); setSelectedId(route.id); }}><strong>{route.label}</strong><RouteStatus route={route} /></button></li>)}
          {creating && <li><button type="button" className="is-current"><strong>{creating.label}</strong><span className="p-status">未保存</span></button></li>}
        </ul>
        <button type="button" className="p-a-new" onClick={() => setCreating(resolve({ id: newRouteId(), owner: 'workspace', label: '新路线', description: '', known: FOUNDATIONS, targets: [], derivationIds: [], order: null }))}><Plus size={14} />新建预设路线</button>
      </aside>
      {selected ? <CompareEditor key={selected.id} route={selected} fresh={!!creating} baseLabel="求解器给的"
        onSave={(route) => { session.save(route); setCreating(null); setSelectedId(route.id); }}
        onDelete={() => { if (creating) setCreating(null); else { session.remove(selected.id); setSelectedId(null); } }} />
        : <div className="p-empty"><p>选一条预设路线。</p></div>}
    </div>
  </section>;
}

type Mark = 'same' | 'added' | 'swapped' | 'moved';

/** Diff of a route against a base order, step by step, in the words an author would use. */
function diff(base: readonly string[], order: readonly string[]) {
  const baseHeads = new Map(base.map((id, i) => [derivationEdge(id)?.head, { id, i }]));
  const marks = new Map<string, Mark>();
  const baseIndex = new Map(base.map((id, i) => [id, i]));
  const common = order.filter((id) => baseIndex.has(id));
  order.forEach((id) => {
    if (baseIndex.has(id)) marks.set(id, 'same');
    else if (baseHeads.has(derivationEdge(id)?.head)) marks.set(id, 'swapped');
    else marks.set(id, 'added');
  });
  // "moved": a common step outside the longest common subsequence — the fewest steps that,
  // picked up and put back, turn one order into the other.
  const baseCommon = base.filter((id) => common.includes(id));
  const table = common.map(() => baseCommon.map(() => 0));
  const at = (i: number, j: number) => (i < 0 || j < 0 ? 0 : table[i][j]);
  common.forEach((a, i) => baseCommon.forEach((b, j) => { table[i][j] = a === b ? at(i - 1, j - 1) + 1 : Math.max(at(i - 1, j), at(i, j - 1)); }));
  const kept = new Set<string>();
  for (let i = common.length - 1, j = baseCommon.length - 1; i >= 0 && j >= 0;) {
    if (common[i] === baseCommon[j]) { kept.add(common[i]); i -= 1; j -= 1; }
    else if (at(i - 1, j) >= at(i, j - 1)) i -= 1; else j -= 1;
  }
  common.forEach((id) => { if (!kept.has(id)) marks.set(id, 'moved'); });
  const swappedHeads = new Set(order.filter((id) => marks.get(id) === 'swapped').map((id) => derivationEdge(id)?.head));
  const removed = base.filter((id) => !order.includes(id) && !swappedHeads.has(derivationEdge(id)?.head));
  return { marks, removed, swappedOut: base.filter((id) => !order.includes(id) && swappedHeads.has(derivationEdge(id)?.head)) };
}

const MARK_TEXT: Record<Mark, string> = { same: '', added: '＋ 多走', swapped: '⇄ 换了讲法', moved: '↕ 挪了位置' };

function CompareEditor({ route, baseRoute, baseLabel, onSave, onDelete, readOnly, saveLabel, single, fresh }: {
  readonly fresh?: boolean; readonly route: Route; readonly baseRoute?: Route; readonly single?: boolean; readonly baseLabel: string; readonly readOnly?: boolean; readonly saveLabel?: string;
  readonly onSave: (route: Route) => void; readonly onDelete?: () => void;
}) {
  const { draft, setDraft, reading, dirty } = useDraft(route);
  const base = baseRoute ? readRoute(graph, baseRoute).order : solverDraft(draft.known, draft.targets).order;
  const baseCost = base.reduce((t, id) => t + (derivationEdge(id)?.weight ?? 0), 0);
  const { marks, removed, swappedOut } = diff(base, reading.order);
  const byStep = new Map<string, string[]>();
  for (const issue of reading.issues) { const id = issueDerivation(issue); if (id) byStep.set(id, [...(byStep.get(id) ?? []), issueText(issue)]); }
  const counts = { added: 0, swapped: 0, moved: 0 } as Record<Mark, number>;
  for (const m of marks.values()) counts[m] = (counts[m] ?? 0) + 1;

  return <div className="p-c-editor">
    <header className="p-a-head">
      {readOnly ? <h1>{draft.label}</h1> : <input className="p-title-input" value={draft.label} onChange={(e) => setDraft(rename(draft, e.target.value, draft.description))} />}
      <div className="p-row">
        <ConceptChips label="目标" ids={draft.targets} readOnly={readOnly} onChange={(ids) => setDraft(withTargets(draft, ids))} />
        <ConceptChips label="已知" ids={draft.known} readOnly={readOnly} onChange={(ids) => setDraft(withKnown(draft, ids))} />
      </div>
      {!single && <p className="p-c-summary">和{baseLabel}比：{[
        counts.added && `多走 ${counts.added} 步`, removed.length && `少走 ${removed.length} 步`,
        counts.swapped && `换了 ${counts.swapped} 处讲法`, counts.moved && `挪了 ${counts.moved} 步`,
      ].filter(Boolean).join('，') || '完全一样'}　·　成本 {reading.cost}（{reading.cost - baseCost >= 0 ? '+' : ''}{reading.cost - baseCost}）</p>}
    </header>
    <GapList reading={reading} onAdd={readOnly ? undefined : (id) => setDraft(addDerivation(graph, draft, id))} />
    <div className={single ? 'p-c-columns is-single' : 'p-c-columns'}>
      {!single && <section className="p-c-base">
        <h2>{baseLabel} <small>{base.length} 步 · 成本 {baseCost}</small></h2>
        <ol>{base.map((id, i) => {
          const gone = removed.includes(id), out = swappedOut.includes(id);
          return <li key={id} className={gone ? 'is-removed' : out ? 'is-swapped-out' : ''}>
            <span className="learning-step-index">{i + 1}</span><span className="p-step-main"><strong>{stepLabel(id)}</strong><small>{stepNeeds(id)}</small></span>
            {gone && !readOnly && <button type="button" onClick={() => setDraft(addDerivation(graph, draft, id))}>加回</button>}
          </li>;
        })}</ol>
      </section>}
      <section className="p-c-mine">
        <h2>{draft.label} <small>顺序{reading.orderSource === 'written' ? '已写定' : '现算'}</small></h2>
        <ol>{reading.order.map((id, i) => {
          const mark = single ? 'same' : marks.get(id) ?? 'same';
          return <li key={id} className={`is-${mark}${byStep.has(id) ? ' has-issue' : ''}`}>
            <span className="learning-step-index">{i + 1}</span>
            <span className="p-step-main"><strong>{stepLabel(id)}</strong><small>{stepNeeds(id)}</small>
              {mark !== 'same' && <em className="p-c-mark">{MARK_TEXT[mark]}</em>}
              {(byStep.get(id) ?? []).map((t) => <em key={t} className="p-step-issue">{t}</em>)}</span>
            {!readOnly && <span className="p-step-tools">
              {parallelsOf(graph, id).map((p) => <button type="button" key={p} title={stepNeeds(p)} onClick={() => setDraft(swapDerivation(draft, id, p))}>⇄</button>)}
              <button type="button" aria-label="上移" disabled={i === 0} onClick={() => setDraft(moveStep(graph, draft, i, i - 1))}><ArrowUp size={13} /></button>
              <button type="button" aria-label="下移" disabled={i === reading.order.length - 1} onClick={() => setDraft(moveStep(graph, draft, i, i + 1))}><ArrowDown size={13} /></button>
              <button type="button" aria-label="去掉" onClick={() => setDraft(removeDerivation(draft, id))}><X size={13} /></button>
            </span>}
          </li>;
        })}</ol>
        {!readOnly && <DerivationSearch route={draft} onAdd={(id) => setDraft(addDerivation(graph, draft, id))} />}
      </section>
    </div>
    {!readOnly && <div className="p-row">
      {onDelete && <button type="button" className="p-danger" onClick={onDelete}>删除</button>}
      <span className="p-flex" />
    </div>}
    {!readOnly && <SaveBar reading={reading} dirty={dirty || !!fresh} onSave={() => onSave(draft)} onDiscard={() => setDraft(route)} saveLabel={saveLabel} />}
  </div>;
}

function LearningC({ session }: { readonly session: RouteSession }) {
  // The learner arrives here from orientation with targets already set; the preview shows every
  // route that reaches them — solver's, author's, own — as peers.
  const [targets] = useState<readonly string[]>(['svd']);
  const solver: Route = { ...resolve({ id: '__solver', owner: 'personal', label: '求解器（最短）', description: '', known: FOUNDATIONS, targets, derivationIds: [], order: null }) };
  const reaches = (route: Route) => { const r = readRoute(graph, route); return targets.every((t) => r.conceptIds.includes(t)); };
  const candidates = [solver, ...session.routes.filter(reaches)];
  const elsewhere = session.routes.filter((route) => !reaches(route));
  const [tab, setTab] = useState('__solver');
  const [against, setAgainst] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ route: Route; base: Route } | null>(null);
  const current = candidates.find((r) => r.id === tab) ?? solver;
  const other = against ? candidates.find((r) => r.id === against) : tab !== '__solver' ? solver : undefined;

  if (editing) return <div className="p-c-learning">
    <header className="p-row"><h1>改一条我的路线</h1><span className="p-flex" /><button type="button" onClick={() => setEditing(null)}>不改了</button></header>
    <CompareEditor route={editing.route} fresh={!session.routes.some((r) => r.id === editing.route.id)} baseRoute={editing.base} baseLabel={`「${editing.base.label}」`} saveLabel="存为我的路线"
      onSave={(route) => { session.save(route); setEditing(null); setTab(route.id); }} />
  </div>;

  return <div className="p-c-learning">
    <header><h1>去 {targets.map(conceptLabel).join('、')} 的路线</h1><p className="p-hint">从开局来：目标已定。下面每条都能走到，挑一条，或者两条对照着看。</p></header>
    <nav className="p-c-tabs">{candidates.map((route) => <button type="button" key={route.id} aria-pressed={route.id === tab} onClick={() => setTab(route.id)}>
      <small>{route.id === '__solver' ? '求解器' : route.owner === 'workspace' ? '作者' : '我的'}</small>{route.label}
      {readRoute(graph, route).errors > 0 && <em className="p-status is-error">无效</em>}
    </button>)}</nav>
    {elsewhere.length > 0 && <p className="p-hint">另有 {elsewhere.length} 条路线走向别的目标：{elsewhere.map((r) => `${r.label}（→ ${r.targets.map(conceptLabel).join('、')}）`).join('；')}</p>}
    <div className="p-row">
      <label>对照：<select value={against ?? ''} onChange={(e) => setAgainst(e.target.value || null)}>
        <option value="">{tab !== '__solver' ? '求解器（默认）' : '不对照'}</option>
        {candidates.filter((r) => r.id !== tab).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select></label>
      <span className="p-flex" />
      <button type="button" onClick={() => setEditing({
        route: current.owner === 'personal' && current.id !== '__solver' ? current : { ...copyAsPersonal(current, newRouteId()), basedOn: current.id === '__solver' ? undefined : current.id },
        base: current,
      })}>{current.owner === 'personal' && current.id !== '__solver' ? '修改' : '以此改一条我的'}</button>
      {readRoute(graph, current).errors === 0 && <button type="button" className="learning-primary">按这条走</button>}
    </div>
    <CompareEditor key={current.id + (other?.id ?? '')} route={current} baseRoute={other} single={!other} baseLabel={other ? `「${other.label}」` : ''} readOnly onSave={() => {}} />
  </div>;
}

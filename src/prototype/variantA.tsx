/**
 * PROTOTYPE ONLY — Variant A: 路线是和开局并列的一页.
 *
 * 创作侧：工作台第四个中心视图「路线」，左栏是本工作区的路线列表（与开局大纲同一个角色），
 * 中间是按步骤排的表格编辑器，右边是路线子图。
 * 学习侧：现有的路线书架分两组——「工作区带的」只读，「我的」可编辑；编辑用同一个表格编辑器。
 */
import { ArrowDown, ArrowUp, Compass, GripVertical, List, Network, Plus, Route as RouteIcon, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { graph, newRouteId, FOUNDATIONS } from './data';
import { GapList, RouteGraph, SaveBar, resolve, useDraft } from './editorParts';
import {
  addDerivation, copyAsPersonal, forgetOrder, moveStep, parallelsOf, readRoute, removeDerivation, rename,
  swapDerivation, withKnown, withTargets, type Route, type RouteOwner,
} from './routeModel';
import { ConceptChips, DerivationSearch, RouteStatus, conceptLabel, issueDerivation, issueText, stepLabel, stepNeeds, type Mode, type RouteSession } from './shared';

export function VariantA({ mode, session }: { readonly mode: Mode; readonly session: RouteSession }) {
  return mode === 'authoring' ? <AuthoringA session={session} /> : <LearningA session={session} />;
}

function blankRoute(owner: RouteOwner): Route {
  return resolve({ id: newRouteId(), owner, label: '新路线', description: '', known: FOUNDATIONS, targets: [], derivationIds: [], order: null });
}

function AuthoringA({ session }: { readonly session: RouteSession }) {
  const mine = session.routes.filter((route) => route.owner === 'workspace');
  const [selectedId, setSelectedId] = useState<string | null>(mine[0]?.id ?? null);
  const [creating, setCreating] = useState<Route | null>(null);
  const selected = creating ?? mine.find((route) => route.id === selectedId) ?? null;
  return <section className="authoring-workbench" data-relations-open="true" data-agent-open="false">
    <div className="authoring-workbar"><div className="authoring-tabs" role="group" aria-label="创作视图">
      <button type="button" aria-pressed="false"><List size={15} />对象</button>
      <button type="button" aria-pressed="false"><Network size={15} />图浏览</button>
      <button type="button" aria-pressed="false"><Compass size={15} />开局</button>
      <button type="button" aria-pressed="true"><RouteIcon size={15} />路线</button>
    </div><span className="authoring-flex" /></div>
    <div className="p-a-frame">
      <aside className="p-a-list" aria-label="工作区路线">
        <header><strong>工作区路线</strong><small>随工作区分发，所有学习者可见</small></header>
        <ul>{mine.map((route) => <li key={route.id}>
          <button type="button" className={route.id === selected?.id ? 'is-current' : ''} onClick={() => { setCreating(null); setSelectedId(route.id); }}>
            <strong>{route.label}</strong><RouteStatus route={route} />
          </button></li>)}
          {creating && <li><button type="button" className="is-current"><strong>{creating.label}</strong><span className="p-status">未保存</span></button></li>}
        </ul>
        <button type="button" className="p-a-new" onClick={() => setCreating(blankRoute('workspace'))}><Plus size={14} />新建路线</button>
      </aside>
      {selected
        ? <TableEditor key={selected.id} route={selected} fresh={!!creating} onSave={(route) => { session.save(route); setCreating(null); setSelectedId(route.id); }}
          onDelete={creating ? () => setCreating(null) : () => { session.remove(selected.id); setSelectedId(null); }} />
        : <div className="p-empty"><p>选一条路线，或新建一条。</p></div>}
    </div>
  </section>;
}

function TableEditor({ route, onSave, onDelete, readOnly, fresh }: {
  readonly fresh?: boolean; readonly route: Route; readonly onSave: (route: Route) => void; readonly onDelete?: () => void; readonly readOnly?: boolean;
}) {
  const { draft, setDraft, reading, dirty } = useDraft(route);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const byStep = new Map<string, string[]>();
  for (const issue of reading.issues) {
    const id = issueDerivation(issue);
    if (id && issue.kind !== 'dangling-derivation') byStep.set(id, [...(byStep.get(id) ?? []), issueText(issue)]);
  }
  const move = (from: number, to: number) => setDraft(moveStep(graph, draft, from, to));
  return <div className="p-a-editor">
    <main className="p-a-main">
      <header className="p-a-head">
        {readOnly ? <><h1>{draft.label}</h1>{draft.description && <p>{draft.description}</p>}</>
          : <>
            <input className="p-title-input" value={draft.label} onChange={(e) => setDraft(rename(draft, e.target.value, draft.description))} />
            <input className="p-desc-input" value={draft.description} placeholder="一句话说明这条路线是谁的讲法、为什么这样走"
              onChange={(e) => setDraft(rename(draft, draft.label, e.target.value))} />
          </>}
        <ConceptChips label="目标" ids={draft.targets} readOnly={readOnly} onChange={(ids) => setDraft(withTargets(draft, ids))} />
        <ConceptChips label="已知" ids={draft.known} readOnly={readOnly} onChange={(ids) => setDraft(withKnown(draft, ids))} />
        {!readOnly && <div className="p-row">
          <button type="button" onClick={() => setDraft(resolve(draft))}>按目标与已知重新求初稿</button>
          <span className="p-hint">会丢掉对步骤的改动</span>
          {onDelete && <button type="button" className="p-danger" onClick={onDelete}><Trash2 size={13} />删除路线</button>}
        </div>}
      </header>
      <GapList reading={reading} onAdd={readOnly ? undefined : (id) => setDraft(addDerivation(graph, draft, id))} />
      <div className="p-order-line">
        顺序：{reading.orderSource === 'written' ? <><strong>已写定</strong>（拖过或写过）{!readOnly && <button type="button" onClick={() => setDraft(forgetOrder(draft))}>改回现算</button>}</>
          : <><strong>现算</strong>（没有写顺序，按执行顺序显示；拖动任一步即写定）</>}
      </div>
      <ol className="p-steps">
        {reading.order.map((id, index) => {
          const notes = byStep.get(id) ?? [];
          const parallels = parallelsOf(graph, id);
          return <li key={id} className={notes.length ? 'has-issue' : ''} draggable={!readOnly}
            onDragStart={() => setDragFrom(index)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragFrom !== null && dragFrom !== index) move(dragFrom, index); setDragFrom(null); }}>
            {!readOnly && <GripVertical size={14} className="p-grip" />}
            <span className="learning-step-index">{index + 1}</span>
            <span className="p-step-main"><strong>{stepLabel(id)}</strong><small>{stepNeeds(id)}</small>
              {notes.map((note) => <em key={note} className="p-step-issue">{note}</em>)}</span>
            {parallels.length > 0 && (readOnly ? <span className="p-hint">有 {parallels.length} 条平行推导</span>
              : <select value="" onChange={(e) => e.target.value && setDraft(swapDerivation(draft, id, e.target.value))}>
                <option value="">换成平行推导…</option>
                {parallels.map((p) => <option key={p} value={p}>{stepNeeds(p)}</option>)}
              </select>)}
            <span className="learning-step-weight">{graph.hyperedges.find((e) => e.id === id)?.weight}</span>
            {!readOnly && <span className="p-step-tools">
              <button type="button" aria-label="上移" disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={13} /></button>
              <button type="button" aria-label="下移" disabled={index === reading.order.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={13} /></button>
              <button type="button" aria-label="去掉这一步" onClick={() => setDraft(removeDerivation(draft, id))}><X size={13} /></button>
            </span>}
          </li>;
        })}
      </ol>
      {!readOnly && <DerivationSearch route={draft} onAdd={(id) => setDraft(addDerivation(graph, draft, id))} />}
      {!readOnly && <SaveBar reading={reading} dirty={dirty || !!fresh} onSave={() => onSave(draft)} onDiscard={() => setDraft(route)} />}
    </main>
    <aside className="p-a-graph"><RouteGraph route={draft} reading={reading} /></aside>
  </div>;
}

function LearningA({ session }: { readonly session: RouteSession }) {
  const workspace = session.routes.filter((route) => route.owner === 'workspace');
  const personal = session.routes.filter((route) => route.owner === 'personal');
  const [selectedId, setSelectedId] = useState<string | null>(workspace[0]?.id ?? null);
  const [editing, setEditing] = useState<Route | null>(null);
  const selected = editing ?? session.routes.find((route) => route.id === selectedId) ?? null;
  const group = (title: string, note: string, routes: readonly Route[]) => <section className="p-a-group">
    <h2>{title}</h2><small>{note}</small>
    <ul>{routes.map((route) => {
      const invalid = readRoute(graph, route).errors > 0;
      return <li key={route.id}><button type="button" className={route.id === selected?.id ? 'is-current' : ''} disabled={false}
        onClick={() => { setEditing(null); setSelectedId(route.id); }}>
        <strong>{route.label}</strong>
        <span className="route-shelf-meta">走到 {route.targets.map(conceptLabel).join('、')}{route.basedOn ? ' · 改自作者路线' : ''}</span>
        {invalid ? <span className="p-status is-error">与当前图不符，打不开</span> : <RouteStatus route={route} />}
      </button></li>;
    })}</ul>
  </section>;
  return <div className="route-shelf p-a-shelf">
    <aside className="route-shelf-list" aria-label="路线">
      <header><h1>路线</h1></header>
      {group('这个工作区带的', '作者写的，只读', workspace)}
      {group('我的', '只在这台机器上', personal)}
      <button type="button" className="route-shelf-new" onClick={() => setEditing({ ...blankRoute('personal') })}>创建我的路线</button>
    </aside>
    {selected ? <section className="route-shelf-detail">
      <div className="p-row">
        {selected.owner === 'workspace' && <span className="p-badge">作者</span>}
        <span className="p-flex" />
        {selected.owner === 'workspace' && !editing && <button type="button" onClick={() => setEditing(copyAsPersonal(selected, newRouteId()))}>
          另存为我的路线并修改</button>}
        {selected.owner === 'personal' && !editing && <button type="button" onClick={() => setEditing(selected)}>修改</button>}
        {!editing && readRoute(graph, selected).errors === 0 && <button type="button" className="learning-primary">开始学</button>}
        {editing && <button type="button" onClick={() => setEditing(null)}>不改了</button>}
      </div>
      <TableEditor key={selected.id + (editing ? ':edit' : '')} route={selected} readOnly={!editing} fresh={!!editing && !session.routes.some((r) => r.id === editing.id)}
        onSave={(route) => { session.save(route); setEditing(null); setSelectedId(route.id); }}
        onDelete={editing && selected.owner === 'personal' && session.routes.some((r) => r.id === selected.id)
          ? () => { session.remove(selected.id); setEditing(null); setSelectedId(null); } : undefined} />
    </section> : <section className="route-shelf-detail is-empty"><p>选一条路线。</p></section>}
  </div>;
}

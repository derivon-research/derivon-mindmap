/**
 * PROTOTYPE ONLY — Variant B: 路线是图浏览上的一层.
 *
 * 创作侧：没有新的中心视图。图浏览多一个「路线图层」选择器，选中一条路线就在图上直接编：
 * 点一步看它的平行推导、去掉它；缺的概念画成红色虚框，点它看能补上的推导；底部一条顺序带可拖。
 * 学习侧：路线页头上一个下拉切换全部路线（作者的与我的分组），「改成我的」在同一张图上开编。
 */
import { Compass, List, Network, Route as RouteIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { graph, newRouteId, FOUNDATIONS } from './data';
import { SaveBar, resolve, useDraft } from './editorParts';
import {
  addDerivation, copyAsPersonal, forgetOrder, moveStep, parallelsOf, removeDerivation, rename, swapDerivation,
  withKnown, withTargets, type Route, type RouteReading,
} from './routeModel';
import { ConceptChips, DerivationSearch, conceptLabel, derivationEdge, derivationTitle, issueDerivation, issueText, stepLabel, stepNeeds, type Mode, type RouteSession } from './shared';

export function VariantB({ mode, session }: { readonly mode: Mode; readonly session: RouteSession }) {
  const [layerId, setLayerId] = useState<string | null>(session.routes.find((r) => r.owner === 'workspace')?.id ?? null);
  const [editing, setEditing] = useState<Route | null>(null);
  const visible = session.routes.filter((route) => mode === 'learning' || route.owner === 'workspace');
  const layer = editing ?? visible.find((route) => route.id === layerId) ?? null;
  const pick = (id: string) => {
    setEditing(null);
    if (id === '__new') setEditing(resolve({ id: newRouteId(), owner: mode === 'authoring' ? 'workspace' : 'personal', label: '新路线', description: '', known: FOUNDATIONS, targets: [], derivationIds: [], order: null }));
    else setLayerId(id || null);
  };
  const canEdit = mode === 'authoring' || layer?.owner === 'personal';
  const picker = <select className="p-b-picker" value={editing && !session.routes.some((r) => r.id === editing.id) ? '__editing' : layer?.id ?? ''} onChange={(e) => pick(e.target.value)}>
    {mode === 'authoring' && <option value="">路线图层：无</option>}
    {mode === 'authoring'
      ? visible.map((route) => <option key={route.id} value={route.id}>路线图层：{route.label}</option>)
      : <>
        <optgroup label="这个工作区带的（作者）">{visible.filter((r) => r.owner === 'workspace').map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}</optgroup>
        <optgroup label="我的">{visible.filter((r) => r.owner === 'personal').map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}</optgroup>
      </>}
    {editing && !session.routes.some((r) => r.id === editing.id) && <option value="__editing">编辑中（未保存）：{editing.label}</option>}
    <option value="__new">＋ 新建{mode === 'authoring' ? '工作区' : '我的'}路线</option>
  </select>;

  return <section className={mode === 'authoring' ? 'authoring-workbench p-b' : 'p-b p-b-learning'}>
    {mode === 'authoring'
      ? <div className="authoring-workbar"><div className="authoring-tabs" role="group">
        <button type="button" aria-pressed="false"><List size={15} />对象</button>
        <button type="button" aria-pressed="true"><Network size={15} />图浏览</button>
        <button type="button" aria-pressed="false"><Compass size={15} />开局</button>
      </div><span className="authoring-flex" /></div>
      : null}
    <header className="p-b-head">
      {mode === 'authoring' && <div className="authoring-tabs" role="group"><button type="button" aria-pressed="false">全图</button><button type="button" aria-pressed="false">关联布局</button></div>}
      {mode === 'learning' && <RouteIcon size={16} />}
      {picker}
      <span className="p-flex" />
      {mode === 'learning' && layer && !editing && layer.owner === 'workspace' && <button type="button" onClick={() => setEditing(copyAsPersonal(layer, newRouteId()))}>改成我的路线</button>}
      {mode === 'learning' && layer && !editing && layer.owner === 'personal' && <button type="button" onClick={() => setEditing(layer)}>修改</button>}
      {mode === 'learning' && layer && !editing && <button type="button" className="learning-primary">开始学</button>}
    </header>
    {layer
      ? <GraphEditor key={layer.id + (editing ? ':e' : '')} route={layer} fresh={!!editing && !session.routes.some((r) => r.id === editing.id)} editable={canEdit && (mode === 'authoring' || editing !== null)}
        onSave={(route) => { session.save(route); setEditing(null); setLayerId(route.id); }}
        onCancel={editing ? () => setEditing(null) : undefined} />
      : <div className="p-empty"><p>没有打开路线图层：这里是普通的全图。</p></div>}
  </section>;
}

type Node = { id: string; x: number; y: number; kind: 'known' | 'step' | 'missing' | 'target-missing'; step?: number; derivationId?: string };

const COL = 170, ROW = 54, W = 136, H = 34;

function layoutRoute(route: Route, reading: RouteReading) {
  const depth = new Map<string, number>();
  for (const id of route.known) depth.set(id, 0);
  const producer = new Map<string, { derivationId: string; step: number }>();
  reading.order.forEach((id, index) => {
    const edge = derivationEdge(id)!;
    const d = 1 + Math.max(0, ...edge.tails.map((t) => depth.get(t) ?? 0));
    if (!depth.has(edge.head)) { depth.set(edge.head, d); producer.set(edge.head, { derivationId: id, step: index + 1 }); }
    for (const tail of edge.tails) if (!depth.has(tail)) depth.set(tail, 0);
  });
  for (const target of route.targets) if (!depth.has(target)) depth.set(target, Math.max(1, ...depth.values()) + 1);
  const columns = new Map<number, string[]>();
  for (const [id, d] of depth) columns.set(d, [...(columns.get(d) ?? []), id]);
  const nodes = new Map<string, Node>();
  for (const [d, ids] of columns) ids.forEach((id, row) => {
    const p = producer.get(id);
    nodes.set(id, {
      id, x: 20 + d * COL, y: 20 + row * ROW,
      kind: route.known.includes(id) ? 'known' : p ? 'step' : route.targets.includes(id) ? 'target-missing' : 'missing',
      step: p?.step, derivationId: p?.derivationId,
    });
  });
  const width = 40 + Math.max(...[...columns.keys()]) * COL + W;
  const height = 40 + Math.max(...[...columns.values()].map((c) => c.length)) * ROW;
  return { nodes, width, height };
}

function GraphEditor({ route, editable, onSave, onCancel, fresh }: {
  readonly fresh?: boolean; readonly route: Route; readonly editable: boolean; readonly onSave: (r: Route) => void; readonly onCancel?: () => void;
}) {
  const { draft, setDraft, reading, dirty } = useDraft(route);
  const [focus, setFocus] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const { nodes, width, height } = useMemo(() => layoutRoute(draft, reading), [draft, reading]);
  const badSteps = new Set(reading.issues.filter((i) => i.severity === 'error').map(issueDerivation).filter(Boolean));
  const warnSteps = new Set(reading.issues.filter((i) => i.severity === 'warning').map(issueDerivation).filter(Boolean));
  const focused = focus ? nodes.get(focus) : null;

  return <div className="p-b-body">
    <div className="p-b-canvas">
      <svg width={width} height={height}>
        {reading.order.map((id) => {
          const edge = derivationEdge(id)!;
          const head = nodes.get(edge.head);
          if (!head || head.derivationId !== id) return null;
          return edge.tails.map((tail) => {
            const from = nodes.get(tail);
            if (!from) return null;
            const x1 = from.x + W, y1 = from.y + H / 2, x2 = head.x, y2 = head.y + H / 2;
            return <path key={`${id}:${tail}`} d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`}
              className={badSteps.has(id) ? 'p-b-edge is-bad' : 'p-b-edge'} />;
          });
        })}
        {[...nodes.values()].map((node) => <g key={node.id} transform={`translate(${node.x},${node.y})`}
          className={`p-b-node is-${node.kind}${node.derivationId && badSteps.has(node.derivationId) ? ' is-bad' : ''}${node.derivationId && warnSteps.has(node.derivationId) ? ' is-warn' : ''}${draft.targets.includes(node.id) ? ' is-target' : ''}${focus === node.id ? ' is-focus' : ''}`}
          onClick={() => setFocus(node.id)}>
          <rect width={W} height={H} rx={7} />
          {node.step && <text x={8} y={21} className="p-b-index">{node.step}</text>}
          <text x={node.step ? 26 : 10} y={21}>{conceptLabel(node.id).slice(0, 9)}</text>
          {(node.kind === 'missing' || node.kind === 'target-missing') && <text x={W - 20} y={21} className="p-b-miss">缺</text>}
        </g>)}
      </svg>
    </div>

    <aside className="p-b-side">
      {editable && <div className="p-b-meta">
        <input className="p-title-input" value={draft.label} onChange={(e) => setDraft(rename(draft, e.target.value, draft.description))} />
        <ConceptChips label="目标" ids={draft.targets} onChange={(ids) => setDraft(withTargets(draft, ids))} />
        <ConceptChips label="已知" ids={draft.known} onChange={(ids) => setDraft(withKnown(draft, ids))} />
        <button type="button" onClick={() => setDraft(resolve(draft))}>重新求初稿</button>
      </div>}
      {!editable && <div className="p-b-meta"><h2>{draft.label}</h2><p className="p-hint">{draft.description}</p></div>}
      <h3>{focused ? conceptLabel(focused.id) : '点图上的一个点'}</h3>
      {focused?.kind === 'known' && <p className="p-hint">已知。{editable && <button type="button" onClick={() => { setDraft(withKnown(draft, draft.known.filter((k) => k !== focused.id))); setFocus(null); }}>不当作已知</button>}</p>}
      {focused?.derivationId && <div className="p-b-step">
        <p>第 {focused.step} 步 · {stepNeeds(focused.derivationId)}</p>
        {reading.issues.filter((i) => issueDerivation(i) === focused.derivationId).map((i, k) => <p key={k} className="p-step-issue">{issueText(i)}</p>)}
        {editable && parallelsOf(graph, focused.derivationId).map((p) => <button type="button" key={p} onClick={() => setDraft(swapDerivation(draft, focused.derivationId!, p))}>换成：{stepNeeds(p)}</button>)}
        {editable && <button type="button" className="p-danger" onClick={() => { setDraft(removeDerivation(draft, focused.derivationId!)); setFocus(null); }}>去掉这一步</button>}
      </div>}
      {focused && (focused.kind === 'missing' || focused.kind === 'target-missing') && <div className="p-b-step">
        <p className="p-step-issue">路线里没有哪一步得到它。</p>
        {editable && graph.hyperedges.filter((e) => e.head === focused.id).map((e) => <button type="button" key={e.id} onClick={() => setDraft(addDerivation(graph, draft, e.id))}>补上：{derivationTitle(e.id)}</button>)}
        {editable && <button type="button" onClick={() => setDraft(withKnown(draft, [...draft.known, focused.id]))}>当作已知</button>}
      </div>}
      {editable && <DerivationSearch route={draft} onAdd={(id) => setDraft(addDerivation(graph, draft, id))} />}
      <div className="p-b-issues">
        {reading.issues.map((issue, k) => <p key={k} className={issue.severity === 'error' ? 'p-step-issue' : 'p-hint'}>{issueText(issue)}</p>)}
      </div>
    </aside>

    <footer className="p-b-strip">
      <span className="p-hint">顺序 {reading.orderSource === 'written' ? '已写定' : '现算'}{editable && reading.orderSource === 'written' && <button type="button" onClick={() => setDraft(forgetOrder(draft))}>改回现算</button>}</span>
      <ol>{reading.order.map((id, index) => <li key={id} draggable={editable}
        className={`${badSteps.has(id) ? 'is-bad' : ''} ${focused?.derivationId === id ? 'is-focus' : ''}`}
        onClick={() => setFocus(derivationEdge(id)!.head)}
        onDragStart={() => setDragFrom(index)} onDragOver={(e) => e.preventDefault()}
        onDrop={() => { if (dragFrom !== null && dragFrom !== index) setDraft(moveStep(graph, draft, dragFrom, index)); setDragFrom(null); }}>
        {index + 1} {stepLabel(id)}</li>)}</ol>
      {editable && <SaveBar reading={reading} dirty={dirty || !!fresh} onSave={() => onSave(draft)} onDiscard={() => onCancel ? onCancel() : setDraft(route)} />}
    </footer>
  </div>;
}

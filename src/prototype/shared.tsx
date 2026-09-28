/**
 * PROTOTYPE ONLY — throwaway. The pieces every variant needs and none of them is judged on:
 * labels, issue sentences, pickers, the disk panel, the fake top bar and the switcher.
 */
import { ChevronLeft, ChevronRight, HardDrive, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { graph } from './data';
import { layout, readRoute, STORE_NAMES, type Route, type RouteIssue, type StoreKey } from './routeModel';

export type Mode = 'authoring' | 'learning';
export type VariantKey = 'A' | 'B' | 'C';

export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: '工作台视图 · 路线是和开局并列的一页',
  B: '图上编辑 · 路线是图浏览上的一层',
  C: '对照编辑 · 路线是求解结果的改写，住在开局里',
};

export type RouteSession = {
  readonly routes: readonly Route[];
  readonly save: (route: Route) => void;
  readonly remove: (routeId: string) => void;
};

// ---------------------------------------------------------------------------------------
// Words

const points = new Map(graph.points.map((point) => [point.id, point]));
const edges = new Map(graph.hyperedges.map((edge) => [edge.id, edge]));

export const conceptLabel = (id: string) => points.get(id)?.data.label ?? `⟨${id}⟩`;
export const derivationEdge = (id: string) => edges.get(id);
export const stepLabel = (id: string) => { const edge = edges.get(id); return edge ? conceptLabel(edge.head) : `⟨${id}⟩`; };
export const stepNeeds = (id: string) => {
  const edge = edges.get(id);
  if (!edge) return '图里没有这条推导';
  return edge.tails.length ? `需要 ${edge.tails.map(conceptLabel).join(' + ')}` : '不需要前提';
};
export const derivationTitle = (id: string) => {
  const edge = edges.get(id);
  return edge ? `${edge.tails.map(conceptLabel).join(' + ') || '∅'} ⇒ ${conceptLabel(edge.head)}` : `⟨${id}⟩`;
};

export function issueText(issue: RouteIssue): string {
  switch (issue.kind) {
    case 'dangling-concept': return `${issue.field === 'known' ? '已知' : '目标'}里的 ${issue.conceptId} 在图里找不到`;
    case 'dangling-derivation': return `推导 ${issue.derivationId} 在图里找不到`;
    case 'target-unreached': return `到不了目标「${conceptLabel(issue.targetId)}」：缺 ${issue.missing.map((m) => `「${conceptLabel(m.conceptId)}」`).join('、') || '（一条推导引用悬空）'}`;
    case 'order-not-executable': return `第 ${issue.position} 步「${stepLabel(issue.derivationId)}」要用 ${issue.needs.map((need) =>
      need.producedAt ? `「${conceptLabel(need.conceptId)}」，它在第 ${need.producedAt} 步才得到` : `「${conceptLabel(need.conceptId)}」，路线里没有哪一步得到它`).join('；')}`;
    case 'never-fires': return `「${stepLabel(issue.derivationId)}」这一步的前提 ${issue.missing.map((id) => `「${conceptLabel(id)}」`).join('、')} 永远拿不到`;
    case 'idle': return `「${stepLabel(issue.derivationId)}」不通往任何目标（绕路）`;
    case 'duplicate-head': return `「${conceptLabel(issue.conceptId)}」已经由前面一步得到过`;
  }
}

export const issueDerivation = (issue: RouteIssue) => 'derivationId' in issue ? issue.derivationId : null;

// ---------------------------------------------------------------------------------------
// Pickers

export function ConceptChips({ label, ids, onChange, readOnly }: {
  readonly label: string; readonly ids: readonly string[]; readonly onChange?: (ids: readonly string[]) => void; readonly readOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const matches = query ? graph.points.filter((point) => !ids.includes(point.id) && point.data.label.includes(query)).slice(0, 8) : [];
  return <div className="p-chips">
    <span className="p-chips-label">{label}</span>
    {ids.map((id) => <span key={id} className="p-chip">{conceptLabel(id)}
      {!readOnly && <button type="button" aria-label={`去掉 ${conceptLabel(id)}`} onClick={() => onChange?.(ids.filter((x) => x !== id))}><X size={11} /></button>}
    </span>)}
    {!readOnly && <span className="p-chips-add">
      <input value={query} placeholder="+ 概念" onChange={(event) => setQuery(event.target.value)} />
      {matches.length > 0 && <span className="p-pop">{matches.map((point) => <button type="button" key={point.id}
        onClick={() => { onChange?.([...ids, point.id]); setQuery(''); }}>{point.data.label}</button>)}</span>}
    </span>}
  </div>;
}

/** Adding a step: search every derivation by its conclusion, the ones that fire now first. */
export function DerivationSearch({ route, onAdd, placeholder = '+ 加一步（按结论搜）' }: {
  readonly route: Route; readonly onAdd: (id: string) => void; readonly placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const have = useMemo(() => new Set(readRoute(graph, route).conceptIds), [route]);
  const matches = query ? graph.hyperedges
    .filter((edge) => !route.derivationIds.includes(edge.id) && (conceptLabel(edge.head).includes(query) || edge.id.includes(query)))
    .sort((a, b) => Number(b.tails.every((t) => have.has(t))) - Number(a.tails.every((t) => have.has(t))))
    .slice(0, 8) : [];
  return <span className="p-chips-add p-derivation-search">
    <input value={query} placeholder={placeholder} onChange={(event) => setQuery(event.target.value)} />
    {matches.length > 0 && <span className="p-pop">{matches.map((edge) => <button type="button" key={edge.id}
      onClick={() => { onAdd(edge.id); setQuery(''); }}>
      <strong>{conceptLabel(edge.head)}</strong><small>{stepNeeds(edge.id)}{edge.tails.every((t) => have.has(t)) ? ' · 现在就能走' : ''}</small>
    </button>)}</span>}
  </span>;
}

/** Status line for a route in a list: how the load-time check reads it right now. */
export function RouteStatus({ route }: { readonly route: Route }) {
  const reading = readRoute(graph, route);
  if (reading.errors) return <span className="p-status is-error">无效 · {reading.errors} 个错误</span>;
  return <span className="p-status">{reading.order.length} 步 · 成本 {reading.cost}{reading.orderSource === 'written' ? ' · 定序' : ''}{reading.warnings ? ` · ${reading.warnings} 个提示` : ''}</span>;
}

// ---------------------------------------------------------------------------------------
// Chrome

export function FakeTopBar({ mode, onMode, extra }: { readonly mode: Mode; readonly onMode: (mode: Mode) => void; readonly extra?: React.ReactNode }) {
  return <header className="app-topbar">
    <span className="app-brand" aria-hidden="true">D</span>
    <span className="app-workspace">math-reforged</span>
    <div className="app-modes" role="group" aria-label="模式">
      {(['authoring', 'learning'] as const).map((candidate) => <button key={candidate} type="button"
        aria-pressed={candidate === mode} className={candidate === mode ? 'is-active' : ''} onClick={() => onMode(candidate)}>
        {candidate === 'authoring' ? '创作' : '学习'}</button>)}
    </div>
    <div className="app-topbar-mode-slot">{extra}</div>
  </header>;
}

export function DiskPanel({ routes, store }: { readonly routes: readonly Route[]; readonly store: StoreKey }) {
  const [open, setOpen] = useState(true);
  const files = layout(graph, routes, store);
  const [picked, setPicked] = useState(0);
  const file = files[Math.min(picked, files.length - 1)];
  if (!open) return <button type="button" className="p-disk-toggle" onClick={() => setOpen(true)}><HardDrive size={14} /> 磁盘（{files.length} 个文件）</button>;
  return <aside className="p-disk" aria-label="磁盘">
    <header><HardDrive size={14} /><strong>磁盘</strong><em>?store={store} · {STORE_NAMES[store]}</em>
      <button type="button" onClick={() => setOpen(false)} aria-label="收起"><X size={14} /></button></header>
    <div className="p-disk-body">
      <ul className="p-disk-tree">
        {(['workspace', 'appdata'] as const).map((root) => <li key={root}>
          <span className="p-disk-root">{root === 'workspace' ? '工作区/  （随 clone 分发）' : '应用数据目录/  （只在这台机器）'}</span>
          <ul>{files.map((f, index) => f.root === root && <li key={f.path}>
            <button type="button" className={f === file ? 'is-current' : ''} onClick={() => setPicked(index)}>{f.path}</button>
          </li>)}</ul>
        </li>)}
      </ul>
      {file && <div className="p-disk-file">
        {file.note && <p className="p-disk-note">{file.note}</p>}
        <pre>{JSON.stringify(file.json, null, 2)}</pre>
      </div>}
    </div>
  </aside>;
}

function readParam<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name)?.toUpperCase();
  return (allowed.find((key) => key.toUpperCase() === value) ?? fallback);
}
export const readVariant = () => readParam<VariantKey>('variant', ['A', 'B', 'C'], 'A');
export const readStore = () => readParam<StoreKey>('store', ['1', '2', '3'], '2');
export const readMode = () => readParam<Mode>('mode', ['authoring', 'learning'], 'authoring');

export function setParam(name: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set(name, value);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

export function PrototypeSwitcher({ variant, store, onVariant, onStore }: {
  readonly variant: VariantKey; readonly store: StoreKey;
  readonly onVariant: (v: VariantKey) => void; readonly onStore: (s: StoreKey) => void;
}) {
  const variants = Object.keys(VARIANT_NAMES) as VariantKey[];
  const go = (delta: number) => onVariant(variants[(variants.indexOf(variant) + delta + variants.length) % variants.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
      if (event.key === '1' || event.key === '2' || event.key === '3') onStore(event.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return <div className="proto-switcher" role="group" aria-label="原型变体">
    <button type="button" aria-label="上一个变体" onClick={() => go(-1)}><ChevronLeft size={17} /></button>
    <span className="proto-switcher-label">
      <strong>{variant}</strong><em>{VARIANT_NAMES[variant]}</em>
      <small>← → 换界面 · 1 2 3 换存储（现在 {store}）</small>
    </span>
    <button type="button" aria-label="下一个变体" onClick={() => go(1)}><ChevronRight size={17} /></button>
  </div>;
}

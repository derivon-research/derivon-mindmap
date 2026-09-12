/**
 * PROTOTYPE ONLY — throwaway. Three structurally different designs for "the learner has
 * several confirmed routes; which one are they on, and how do they get to another".
 *
 *   A · 路线书架   — a new top-level learning view; the collection is the page.
 *   B · 侧栏切换器 — no new view; a switcher inside the rail of the walker.
 *   C · 开局选择   — learning mode lands on a resume-first master/detail screen.
 */
import { ArrowRight, Check, ChevronDown, Compass, Map as MapIcon, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { RetainedGraph } from '../modes/RetainedGraph';
import { routeGraphView } from '../modes/routePreview';
import {
  graph, labelOf, labelsOf, routeProgress, stepsOf, totalCost, type SavedRoute,
} from './routes-data';

export type VariantProps = {
  readonly routes: readonly SavedRoute[];
  readonly onDelete: (routeId: string) => void;
};

/** Shared chrome, deliberately minimal: both bars are stand-ins for the real ones. */
export function PrototypeTopBar({ nav }: { readonly nav: readonly ReactNode[] }) {
  return (
    <header className="app-topbar">
      <span className="app-brand" aria-hidden="true">D</span>
      <span className="app-workspace">内置工作区</span>
      <div className="app-modes" role="group" aria-label="模式">
        <button type="button">创作</button>
        <button type="button" aria-pressed className="is-active">学习</button>
      </div>
      <div className="app-topbar-mode-slot">
        <nav className="app-learning-views" aria-label="学习流程">{nav}</nav>
      </div>
    </header>
  );
}

export function NavButton({ icon, label, active, disabled, onClick }: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return <button type="button" aria-pressed={active} disabled={disabled}
    className={active ? 'is-active' : ''} onClick={onClick}>
    {icon}<span>{label}</span>
  </button>;
}

const routeIcon = <RouteIcon size={15} aria-hidden="true" />;

// ---------------------------------------------------------------- shared bits

function ProgressMeter({ route }: { readonly route: SavedRoute }) {
  const progress = routeProgress(route);
  return <span className="proto-meter" title={`${progress.done} / ${progress.total}`}>
    <span className="proto-meter-track">
      <span className="proto-meter-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
    </span>
    <em>{progress.finished ? '已走完' : `${progress.done}/${progress.total}`}</em>
  </span>;
}

function StaleBadge() {
  return <span className="proto-stale" title="路线记录还在，只是它依据的图变了">与当前图不一致</span>;
}

function DeleteButton({ route, onDelete }: { readonly route: SavedRoute; readonly onDelete: (id: string) => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button type="button" className="proto-icon" title="删除这条路线（不动掌握记录）"
      aria-label={`删除路线 ${route.description}`} onClick={() => setArmed(true)}>
      <Trash2 size={15} aria-hidden="true" />
    </button>;
  }
  return <span className="proto-confirm">
    删除？掌握记录不动
    <button type="button" className="proto-danger" onClick={() => onDelete(route.id)}>删除</button>
    <button type="button" onClick={() => setArmed(false)}>算了</button>
  </span>;
}

/** Walking a route: rail of steps on the right, the current step in the middle. */
function RouteWalker({ route, railHead, onSwitch }: {
  readonly route: SavedRoute;
  /** Variant B puts a route switcher here; A and C pass nothing. */
  readonly railHead?: ReactNode;
  readonly onSwitch?: () => void;
}) {
  const steps = useMemo(() => stepsOf(route), [route]);
  const progress = routeProgress(route);
  const [cursor, setCursor] = useState(progress.currentIndex);
  const current = steps[Math.min(cursor, steps.length - 1)];
  if (!current) return <div className="learning-route-empty"><p>这条路线一步都没有。</p></div>;
  return <div className="learning-route tutor-hidden rail-default">
    <article className="learning-text">
      <div className="learning-text-column">
        <header>
          <span>第 {current.index} / {steps.length} 步</span>
          <h2>{current.requires.map(labelOf).join(' + ') || '∅'} → {current.label}</h2>
          <p>路线「{route.description}」· 这一步的当前步骤是推导出来的，没有游标。</p>
        </header>
        <section className="learning-derivation" aria-label={`${current.label} 的推导`}>
          <h3 className="proto-doc-title">{current.label} 的推导</h3>
          <p className="proto-doc">{current.derivationId} · 成本 {current.weight}。
            {current.requires.length ? ` 前提：${current.requires.map(labelOf).join('、')}。` : ' 不需要前提。'}</p>
          <p className="proto-doc proto-muted">（这里是真实的推导文档占位。原型关心的是选择与切换，不是阅读面。）</p>
        </section>
        <div className="learning-text-actions">
          <button type="button" className="learning-primary" disabled={cursor >= steps.length - 1}
            onClick={() => setCursor(cursor + 1)}>学会了，下一步 <ArrowRight size={15} aria-hidden="true" /></button>
          {onSwitch && <button type="button" onClick={onSwitch}>换一条路线</button>}
          <button type="button">看不懂推导，问 Agent</button>
        </div>
      </div>
    </article>
    <nav className="learning-rail" aria-label="路线">
      <div className="learning-rail-head">
        {railHead ?? <span>{route.description}</span>}
        <em>{Math.min(cursor + 1, steps.length)} / {steps.length}</em>
      </div>
      <ol className="learning-rail-list">
        {steps.map((step, index) => <li key={step.derivationId}
          className={index === cursor ? 'is-active' : index < progress.currentIndex ? 'is-done' : ''}>
          <button type="button" aria-current={index === cursor ? 'step' : undefined} onClick={() => setCursor(index)}>
            <span className="learning-rail-index">{step.index}</span>
            <span className="learning-rail-label">{step.label}</span>
            {step.status === 'complete' && <Check size={13} aria-hidden="true" />}
          </button>
        </li>)}
      </ol>
      <p className="learning-rail-note">完成标记来自掌握记录 · 路线本身不存进度</p>
    </nav>
  </div>;
}

// ---------------------------------------------------------------- variant A

/**
 * A · 路线书架
 *
 * A new entry in the learning nav. The collection is the page: one row per confirmed route,
 * progress inline, delete on the row. Opening a row hands off to the walker.
 */
export function VariantA({ routes, onDelete, onOpen, openId }: VariantProps & {
  readonly onOpen: (id: string) => void;
  readonly openId: string | null;
}) {
  const open = routes.find((route) => route.id === openId);
  const stale = routes.filter((route) => route.stale).length;
  return <>
    <PrototypeTopBar nav={[
      <NavButton key="o" icon={<Compass size={15} aria-hidden="true" />} label="改目标 / 已知" onClick={() => {}} />,
      <NavButton key="r" icon={routeIcon} label="路线学习" active={Boolean(open)} onClick={() => {}} />,
      <NavButton key="s" icon={<MapIcon size={15} aria-hidden="true" />} label="我的路线" active={!open} onClick={() => {}} />,
      <NavButton key="b" icon={<MapIcon size={15} aria-hidden="true" />} label="大图浏览" onClick={() => {}} />,
    ]} />
    {open
      ? <RouteWalker route={open} onSwitch={() => onOpen('')} />
      : <div className="learning-workbench proto-page">
        <div className="proto-page-head">
          <div>
            <h1>我的路线</h1>
            <p>{routes.length} 条已确认的路线{stale > 0 ? `，其中 ${stale} 条与当前图不一致` : ''}。
              完成标记来自掌握记录，路线本身不存进度。</p>
          </div>
          <button type="button" className="learning-primary">算一条新路线</button>
        </div>
        <ol className="proto-shelf">
          {routes.map((route) => <li key={route.id} className={route.stale ? 'is-stale' : ''}>
            <button type="button" className="proto-shelf-open" onClick={() => onOpen(route.id)}>
              <span className="proto-shelf-main">
                <strong>{route.description}</strong>
                {route.stale && <StaleBadge />}
              </span>
              <span className="proto-shelf-sub">
                目标 {labelsOf(route.targets)} · 起点 {labelsOf(route.known.slice(2)) || '零'}
              </span>
              <span className="proto-shelf-sub">{routeProgress(route).total} 步 · 成本 {totalCost(route)}</span>
              <ProgressMeter route={route} />
              <span className="proto-shelf-cta">
                {routeProgress(route).finished ? '重走' : routeProgress(route).done ? '继续' : '开始'}
              </span>
            </button>
            <DeleteButton route={route} onDelete={onDelete} />
          </li>)}
        </ol>
        <p className="proto-foot">
          原型 A · 集合是页面：新开一个「我的路线」视图，一行一条，进度与删除都在行上。
        </p>
      </div>}
  </>;
}

// ---------------------------------------------------------------- variant B

/**
 * B · 侧栏切换器
 *
 * Nothing new in the nav. The walker is the page and the rail header is the switcher:
 * a popover over the step list. With no route chosen yet, the walker's empty state is the
 * entry point and the popover is what it opens.
 */
export function VariantB({ routes, onDelete }: VariantProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState(true);
  const active = routes.find((route) => route.id === activeId) ?? null;
  const pick = (id: string) => { setActiveId(id); setOpenMenu(false); };

  const menu = openMenu && <div className="proto-menu" role="dialog" aria-label="选择路线">
    <header>
      <strong>已确认的路线</strong>
      <span>{routes.length} 条</span>
    </header>
    <ul>
      {routes.map((route) => <li key={route.id} className={route.stale ? 'is-stale' : ''}>
        <button type="button" aria-current={route.id === activeId ? 'true' : undefined} onClick={() => pick(route.id)}>
          <span className="proto-menu-main">
            <strong>{route.description}</strong>
            {route.stale && <StaleBadge />}
          </span>
          <span className="proto-menu-sub">目标 {labelsOf(route.targets)} · {routeProgress(route).total} 步</span>
          <ProgressMeter route={route} />
        </button>
        <DeleteButton route={route} onDelete={onDelete} />
      </li>)}
    </ul>
    <footer>
      <button type="button" className="learning-primary">算一条新路线</button>
    </footer>
  </div>;

  const head = <button type="button" className="proto-rail-switch" aria-expanded={openMenu}
    onClick={() => setOpenMenu((value) => !value)}>
    <span>{active ? active.description : '选择路线'}</span>
    <ChevronDown size={14} aria-hidden="true" />
  </button>;

  return <>
    <PrototypeTopBar nav={[
      <NavButton key="o" icon={<Compass size={15} aria-hidden="true" />} label="改目标 / 已知" onClick={() => {}} />,
      <NavButton key="r" icon={routeIcon} label="路线学习" active onClick={() => {}} />,
      <NavButton key="b" icon={<MapIcon size={15} aria-hidden="true" />} label="大图浏览" onClick={() => {}} />,
    ]} />
    <div className="learning-workbench proto-walker-host">
      {active
        ? <RouteWalker route={active} railHead={head} onSwitch={() => setOpenMenu(true)} />
        : <div className="learning-route-empty proto-blank">
          <h2>还没有选路线</h2>
          <p>工作区里存着 {routes.length} 条已确认的路线。挑一条接着走，或者算一条新的。</p>
          <button type="button" className="learning-primary" onClick={() => setOpenMenu(true)}>
            从记录里挑一条 <ChevronDown size={15} aria-hidden="true" />
          </button>
        </div>}
      {menu && <>
        <div className="proto-scrim" onClick={() => setOpenMenu(false)} />
        {menu}
      </>}
      <p className="proto-foot proto-foot-float">
        原型 B · 不走导航：路线学习就是页面，切换器挂在侧栏头部，没选路线时空白页就是入口。
      </p>
    </div>
  </>;
}

// ---------------------------------------------------------------- variant C

/**
 * C · 开局选择
 *
 * Entering learning with confirmed routes lands here instead of on orientation:
 * a resume-first strip on the left, the selected route's detail — subgraph included — on
 * the right. "算一条新路线" is the way back to orientation.
 */
export function VariantC({ routes, onDelete, onWalk }: VariantProps & { readonly onWalk: (id: string) => void }) {
  const ordered = useMemo(() => [...routes].sort((left, right) => {
    const ratio = (route: SavedRoute) => {
      const progress = routeProgress(route);
      return progress.finished ? 1 : progress.done / Math.max(1, progress.total);
    };
    return ratio(right) - ratio(left);
  }), [routes]);
  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? null);
  const selected = ordered.find((route) => route.id === selectedId) ?? ordered[0];
  if (!selected) return <div className="learning-route-empty"><p>还没有确认过任何路线。</p></div>;
  const progress = routeProgress(selected);
  const resume = ordered[0];
  const view = routeGraphView(graph, selected.solution, selected.targets, selected.known, {
    completedIds: stepsOf(selected).slice(0, progress.done).map((step) => step.conceptId),
    currentId: progress.finished ? null : stepsOf(selected)[progress.currentIndex]?.conceptId ?? null,
  });

  return <>
    <PrototypeTopBar nav={[
      <NavButton key="o" icon={<Compass size={15} aria-hidden="true" />} label="改目标 / 已知" onClick={() => {}} />,
      <NavButton key="r" icon={routeIcon} label="路线学习" active onClick={() => {}} />,
      <NavButton key="b" icon={<MapIcon size={15} aria-hidden="true" />} label="大图浏览" onClick={() => {}} />,
    ]} />
    <div className="learning-workbench proto-start">
      <aside className="proto-start-list">
        <button type="button" className="proto-resume" onClick={() => onWalk(resume.id)}>
          <span className="proto-resume-eyebrow">上次走到这里</span>
          <strong>{resume.description}</strong>
          <ProgressMeter route={resume} />
          <span className="proto-resume-cta">
            继续 · 第 {routeProgress(resume).currentIndex + 1} 步 <ArrowRight size={14} aria-hidden="true" />
          </span>
        </button>
        <h2>已确认的路线</h2>
        <ul>
          {ordered.map((route) => <li key={route.id}>
            <button type="button" aria-current={route.id === selected.id ? 'true' : undefined}
              className={route.id === selected.id ? 'is-current' : ''} onClick={() => setSelectedId(route.id)}>
              <span className="proto-menu-main">
                <strong>{route.description}</strong>
                {route.stale && <StaleBadge />}
              </span>
              <span className="proto-menu-sub">{labelsOf(route.targets)} · {routeProgress(route).total} 步</span>
              <ProgressMeter route={route} />
            </button>
          </li>)}
        </ul>
        <button type="button" className="proto-new">＋ 算一条新路线 · 回去改目标</button>
      </aside>
      <section className="proto-start-detail">
        <header>
          <div>
            <h1>{selected.description}</h1>
            <p>
              目标 {labelsOf(selected.targets)} · 起点 {labelsOf(selected.known.slice(2)) || '零'} ·
              共 {progress.total} 步 · 成本 {totalCost(selected)}
            </p>
          </div>
          <DeleteButton route={selected} onDelete={onDelete} />
        </header>
        {selected.stale && <p className="proto-stale-note" role="alert">
          这条路线记录的图版本和当前工作区对不上，所以它只是被报出来，没有被重解也没有被删掉。
        </p>}
        <div className="proto-start-graph">
          <RetainedGraph active view={view} onEvent={() => {}} />
        </div>
        <ol className="learning-preview-list">
          {stepsOf(selected).map((step) => <li key={step.derivationId}
            className={step.index <= progress.done ? 'is-done' : step.index - 1 === progress.currentIndex ? 'is-current' : ''}>
            <span className="learning-step-index">{step.index}</span>
            <span className="learning-step-label">{step.label}
              {step.status === 'complete' && <Check size={13} aria-hidden="true" />}
              {step.status === 'incomplete' && <em className="proto-incomplete">问过，没到</em>}
            </span>
            <span className="learning-step-because">
              {step.requires.length ? `需要 ${step.requires.map(labelOf).join(' + ')}` : '不需要前提'}
            </span>
            <span className="learning-step-weight">{step.weight}</span>
          </li>)}
        </ol>
        <footer className="learning-preview-actions">
          <button type="button" className="learning-primary" onClick={() => onWalk(selected.id)}>
            {progress.done === 0 ? '开始学' : progress.finished ? '重走一遍' : `继续 · 第 ${progress.currentIndex + 1} 步`}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button">改目标后再算一条</button>
        </footer>
      </section>
      <p className="proto-foot proto-foot-float">
        原型 C · 进入学习就落在这里：「继续上次」在最上，选中哪条就展哪条的细节（含真实子图）。
      </p>
    </div>
  </>;
}

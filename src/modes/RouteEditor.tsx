import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, Save, Trash2, Undo2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RouteSolver } from '../ports/RouteSolver';
import {
  addStep, draftFromSolution, moveStep, parallelDerivations, readRoute, removeStep, stepCandidates, swapStep,
  useComputedOrder as computedOrder,
  type Route, type RouteDiagnostic, type RouteReading, type TagDeclaration, type WorkspaceGraph,
} from '../workspace/index';
import { ConceptPicker, labelOf } from './ConceptPicker';
import { RetainedGraph } from './RetainedGraph';
import { routeGraphView, routeSolutionOfReading } from './routePreview';
import './route-editor.css';

export type RouteEditorProps = {
  /** Whether the mode showing the editor is the visible one; the subgraph renders only then. */
  readonly active: boolean;
  readonly graph: WorkspaceGraph;
  /** Tag declarations, for the tag filter of the target and known pickers. */
  readonly tags: readonly TagDeclaration[];
  /** The route being shown: the caller's draft. The editor holds no copy of it. */
  readonly route: Route;
  /** Whether `route` differs from what is saved, as the caller counts it. A never-saved route is dirty. */
  readonly dirty?: boolean;
  /** Solves a first draft from targets and known. Absent: the editor says so and starts from empty steps. */
  readonly routeSolver?: RouteSolver;
  /** Every edit, as the next draft. Absent: the editor is a read-only view of the route. */
  readonly onChange?: (route: Route) => void;
  /**
   * Save the draft wherever the caller keeps it. Called only when `dirty` and the route has no
   * errors. A throw or a rejection is shown as the save's failure; the draft is left as it is.
   */
  readonly onSave?: (route: Route) => void | Promise<void>;
  /** Drop the draft's changes. The button appears only while `dirty`. */
  readonly onDiscard?: () => void;
  /** Delete the route. Absent: no delete button. Asked for twice; a failure is shown like a save's. */
  readonly onDelete?: () => void | Promise<void>;
  /** The question the armed delete button asks, saying what deleting does and does not touch. */
  readonly deletePrompt?: string;
  /** Caller-owned buttons shown in the editor's header, such as starting or copying the route. */
  readonly actions?: ReactNode;
};

/**
 * The route editor both modes share. It shows one route on the graph — its name, targets and
 * known, gaps with their fixes, order state, steps, and subgraph — and turns every edit into
 * the next draft through `onChange`. It never knows where the route lives: saving, discarding
 * and deleting are the caller's, and so is draft protection. Every control whose callback is
 * absent is left out, so passing none gives a read-only view.
 */
export function RouteEditor({
  active, graph, tags, route, dirty = false, routeSolver, onChange, onSave, onDiscard, onDelete, deletePrompt, actions,
}: RouteEditorProps) {
  const reading = useMemo(() => readRoute(graph, route), [graph, route]);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const edit = onChange ? (next: Route) => { setFailure(''); onChange(next); } : undefined;

  const attempt = async (action: () => void | Promise<void>) => {
    setFailure('');
    setBusy(true);
    try { await action(); } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  const view = useMemo(() => routeGraphView(graph, routeSolutionOfReading(reading), route.targets, route.known),
    [graph, reading, route.known, route.targets]);

  return <section className="route-editor">
    <main className="route-editor-main" aria-label="路线编辑器">
      <header className="route-editor-head">
        {edit ? <>
          <input className="route-editor-title" aria-label="路线名称" placeholder="给路线起个名字" value={route.label}
            onChange={(event) => edit({ ...route, label: event.target.value })} />
          <input className="route-editor-description" aria-label="路线说明" value={route.description ?? ''}
            placeholder="一句话说明这条路线是谁的讲法、为什么这样走"
            onChange={(event) => edit(describe(route, event.target.value))} />
        </> : <>
          <h2 className="route-editor-title">{route.label || '未命名路线'}</h2>
          {route.description && <p className="route-editor-description">{route.description}</p>}
        </>}
        {(actions || onDelete) && <div className="route-editor-actions">
          {actions}
          {onDelete && <DeleteButton prompt={deletePrompt ?? '删除这条路线？'} disabled={busy}
            onDelete={() => void attempt(onDelete)} />}
        </div>}
      </header>

      {edit ? <div className="route-editor-ends">
        <ConceptPicker label="目标" graph={graph} tags={tags} selected={route.targets} emptyNote="还没有目标"
          onChange={(targets) => edit({ ...route, targets })} />
        <ConceptPicker label="已知" graph={graph} tags={tags} selected={route.known} emptyNote="从零开始"
          onChange={(known) => edit({ ...route, known })} />
      </div> : <dl className="route-editor-ends-read">
        <dt>目标</dt><dd>{route.targets.map((id) => labelOf(graph, id)).join('、') || '（空）'}</dd>
        <dt>已知</dt><dd>{route.known.map((id) => labelOf(graph, id)).join('、') || '（空）'}</dd>
      </dl>}

      {edit && <DraftFromSolver graph={graph} route={route} routeSolver={routeSolver} onDraft={edit} />}

      {failure && <p className="route-editor-failure" role="alert"><AlertTriangle size={15} />{failure}</p>}

      <RouteProblems graph={graph} reading={reading} onAdd={edit && ((id) => edit(addStep(graph, route, id)))} />

      <p className="route-editor-order">
        顺序：{reading.orderSource === 'written'
          ? <><strong>已写定</strong><span>按写下的顺序走</span>
            {edit && <button type="button" onClick={() => edit(computedOrder(route))}>改回现算</button>}</>
          : <><strong>现算</strong><span>没有写定顺序，按执行顺序显示{edit ? '；移动任一步即写定' : ''}</span></>}
      </p>

      <StepTable graph={graph} route={route} reading={reading} onEdit={edit} />

      {edit && <StepSearch graph={graph} route={route} onAdd={(id) => edit(addStep(graph, route, id))} />}

      {(onSave || onDiscard) && <footer className="route-editor-savebar">
        <span className={reading.errors ? 'route-editor-tally is-error' : 'route-editor-tally'}>
          {reading.errors ? `${reading.errors} 个错误，修好之前不能保存` : routeTally(reading)}
          {reading.warnings > 0 && ` · ${reading.warnings} 个提示`}
        </span>
        <span className="route-editor-flex" />
        {onDiscard && dirty && <button type="button" disabled={busy} onClick={() => { setFailure(''); onDiscard(); }}>
          <Undo2 size={15} />放弃更改
        </button>}
        {onSave && <button type="button" className="route-editor-primary" disabled={!dirty || reading.errors > 0 || busy}
          onClick={() => void attempt(() => onSave(route))}><Save size={15} />保存</button>}
      </footer>}
    </main>
    <aside className="route-editor-graph" aria-label="路线子图">
      <RetainedGraph active={active} view={view} onEvent={() => {}} />
    </aside>
  </section>;
}

/** Whether two routes are the same document: what a caller's `dirty` compares. */
export function sameRoute(left: Route, right: Route | null | undefined): boolean {
  if (!right) return false;
  const text = (route: Route) => JSON.stringify([route.id, route.label, route.description ?? '', route.known, route.targets,
    route.steps, route.ordered, route.basedOn ?? null, route.basis ?? null]);
  return text(left) === text(right);
}

function describe(route: Route, description: string): Route {
  const next: { -readonly [Key in keyof Route]: Route[Key] } = { ...route, description };
  if (!description) delete next.description;
  return next;
}

function routeTally(reading: RouteReading): string {
  return `${reading.order.length} 步 · 成本 ${reading.cost} · 顺序${reading.orderSource === 'written' ? '已写定' : '现算'}`;
}

function derivationOf(graph: WorkspaceGraph, id: string) {
  return graph.hyperedges.find((edge) => edge.id === id);
}

/** "需要 A + B", the reason a step sits where it does. */
function needsOf(graph: WorkspaceGraph, id: string): string {
  const edge = derivationOf(graph, id);
  if (!edge) return '图里没有这条推导';
  return edge.tails.length ? `需要 ${edge.tails.map((tail) => labelOf(graph, tail)).join(' + ')}` : '不需要前提';
}

function titleOf(graph: WorkspaceGraph, id: string): string {
  const edge = derivationOf(graph, id);
  if (!edge) return id;
  return `${edge.tails.map((tail) => labelOf(graph, tail)).join(' + ') || '无前提'} ⇒ ${labelOf(graph, edge.head)}`;
}

/** "按目标与已知重新求初稿": the solver's derivations replace the steps. */
function DraftFromSolver({ graph, route, routeSolver, onDraft }: {
  readonly graph: WorkspaceGraph; readonly route: Route; readonly routeSolver?: RouteSolver; readonly onDraft: (route: Route) => void;
}) {
  const [state, setState] = useState<{ readonly status: 'idle' | 'solving' } | { readonly status: 'note'; readonly note: string }>({ status: 'idle' });
  const latest = useRef(route);
  latest.current = route;
  const request = `${route.targets.join(' ')}|${route.known.join(' ')}`;
  useEffect(() => { setState({ status: 'idle' }); }, [request]);

  if (!routeSolver) {
    return <p className="route-editor-solver is-unavailable">这里没有求解器，不能自动求初稿：从空的步骤开始，用下面的搜索逐步加推导。</p>;
  }
  const solve = async () => {
    setState({ status: 'solving' });
    try {
      const solution = await routeSolver.solve(graph, { targetConceptIds: route.targets, knownConceptIds: route.known });
      const current = latest.current;
      // Targets or known changed while solving: this draft answers a question no longer asked.
      if (`${current.targets.join(' ')}|${current.known.join(' ')}` !== request) return;
      onDraft(draftFromSolution(current, solution));
      setState(solution.reachable ? { status: 'idle' } : { status: 'note', note: '求解器到不了全部目标，初稿只含它找到的推导。' });
    } catch (error) {
      setState({ status: 'note', note: `求解失败：${error instanceof Error ? error.message : String(error)}` });
    }
  };
  return <p className="route-editor-solver">
    <button type="button" disabled={!route.targets.length || state.status === 'solving'} onClick={() => void solve()}>
      <Wand2 size={14} />{state.status === 'solving' ? '正在求解…' : '按目标与已知重新求初稿'}
    </button>
    <span>{route.targets.length ? '会丢掉对步骤的改动' : '先选至少一个目标'}</span>
    {state.status === 'note' && <em role="status">{state.note}</em>}
  </p>;
}

/** Route-level errors, the gaps with what fills them, and the one blocked-count sentence. */
function RouteProblems({ graph, reading, onAdd }: {
  readonly graph: WorkspaceGraph; readonly reading: RouteReading; readonly onAdd?: (derivationId: string) => void;
}) {
  const general = reading.diagnostics.filter((diagnostic) => !('position' in diagnostic));
  if (!general.length && !reading.gaps.length && !reading.blocked) return null;
  const position = (id: string) => reading.order.indexOf(id) + 1;
  return <section className="route-editor-problems" aria-label="路线问题">
    {general.map((diagnostic, index) => <p key={`${diagnostic.code}:${index}`} className={`is-${diagnostic.severity}`}>{diagnostic.message}</p>)}
    {reading.gaps.length > 0 && <ul className="route-editor-gaps" aria-label="缺口">
      {reading.gaps.map((gap) => {
        const step = derivationOf(graph, gap.wantedBy) ? position(gap.wantedBy) : 0;
        return <li key={gap.conceptId}>
          <span>缺「{labelOf(graph, gap.conceptId)}」{step
            ? `：第 ${step} 步「${labelOf(graph, derivationOf(graph, gap.wantedBy)!.head)}」要用它`
            : '：它本身就是目标'}</span>
          {gap.candidates.length
            ? gap.candidates.map((id) => <button type="button" key={id} disabled={!onAdd} onClick={() => onAdd?.(id)}
              aria-label={`补上 ${titleOf(graph, id)}`}>补上 {titleOf(graph, id)}</button>)
            : <em>图里没有推导得到它，只能放进已知</em>}
        </li>;
      })}
    </ul>}
    {reading.blocked > 0 && <p className="route-editor-blocked">另有 {reading.blocked} 步因此暂时走不了。</p>}
  </section>;
}

/** Steps in display order, each with its own diagnostics, swap, move and remove. */
function StepTable({ graph, route, reading, onEdit }: {
  readonly graph: WorkspaceGraph; readonly route: Route; readonly reading: RouteReading; readonly onEdit?: (route: Route) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const notes = new Map<string, RouteDiagnostic[]>();
  for (const diagnostic of reading.diagnostics) {
    if ('position' in diagnostic) notes.set(diagnostic.derivationId, [...(notes.get(diagnostic.derivationId) ?? []), diagnostic]);
  }
  if (!reading.order.length) {
    return <p className="route-editor-empty">还没有步骤。{onEdit ? '求一份初稿，或用下面的搜索加一步。' : ''}</p>;
  }
  const move = (id: string, to: number) => onEdit?.(moveStep(graph, route, id, to));
  return <ol className="route-editor-steps" aria-label="路线步骤">
    {reading.order.map((id, index) => {
      const edge = derivationOf(graph, id)!;
      const own = notes.get(id) ?? [];
      const severity = own.some((note) => note.severity === 'error') ? 'error' : own.length ? 'warning' : '';
      const parallels = parallelDerivations(graph, id);
      const concept = labelOf(graph, edge.head);
      return <li key={id} className={severity ? `is-${severity}` : undefined} aria-label={`第 ${index + 1} 步：${concept}`}
        draggable={Boolean(onEdit)}
        onDragStart={(event) => { setDragged(id); event.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(event) => { if (dragged) event.preventDefault(); }}
        onDrop={(event) => { event.preventDefault(); if (dragged && dragged !== id) move(dragged, index); setDragged(null); }}
        onDragEnd={() => setDragged(null)}>
        {onEdit && <GripVertical size={14} className="route-editor-grip" aria-hidden="true" />}
        <span className="route-editor-step-index">{index + 1}</span>
        <span className="route-editor-step-main">
          <strong>{concept}</strong>
          <small>{needsOf(graph, id)}</small>
          {own.map((note, noteIndex) => <em key={`${note.code}:${noteIndex}`} className={`is-${note.severity}`}>{note.message}</em>)}
        </span>
        {parallels.length > 0 && (onEdit
          ? <select value="" aria-label={`换掉第 ${index + 1} 步的推导`}
            onChange={(event) => { if (event.target.value) onEdit(swapStep(route, id, event.target.value)); }}>
            <option value="">换成平行推导…</option>
            {parallels.map((parallel) => <option key={parallel} value={parallel}>{needsOf(graph, parallel)}</option>)}
          </select>
          : <small className="route-editor-parallels">有 {parallels.length} 种平行推导</small>)}
        <span className="route-editor-step-weight">{edge.weight}</span>
        {onEdit && <span className="route-editor-step-tools">
          <button type="button" aria-label={`上移第 ${index + 1} 步`} disabled={index === 0} onClick={() => move(id, index - 1)}>
            <ArrowUp size={13} /></button>
          <button type="button" aria-label={`下移第 ${index + 1} 步`} disabled={index === reading.order.length - 1}
            onClick={() => move(id, index + 1)}><ArrowDown size={13} /></button>
          <button type="button" aria-label={`去掉第 ${index + 1} 步`} onClick={() => onEdit(removeStep(route, id))}><X size={13} /></button>
        </span>}
      </li>;
    })}
  </ol>;
}

/** Add a step by searching conclusions; the ones that can fire now come first. */
function StepSearch({ graph, route, onAdd }: {
  readonly graph: WorkspaceGraph; readonly route: Route; readonly onAdd: (derivationId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => stepCandidates(graph, route, query, 8), [graph, route, query]);
  return <div className="route-editor-search">
    <input value={query} aria-label="加一步" placeholder="加一步：按结论搜索推导" onChange={(event) => setQuery(event.target.value)} />
    {query.trim() && <ul aria-label="可加的推导">
      {candidates.map(({ derivationId, ready }) => {
        const edge = derivationOf(graph, derivationId)!;
        return <li key={derivationId}>
          <button type="button" onClick={() => { onAdd(derivationId); setQuery(''); }}>
            <strong>{labelOf(graph, edge.head)}</strong>
            <small>{needsOf(graph, derivationId)}{ready ? ' · 现在就能走' : ''}</small>
          </button>
        </li>;
      })}
      {!candidates.length && <li className="route-editor-empty">没有匹配的推导</li>}
    </ul>}
  </div>;
}

/** Deleting asks twice, and the question says what it does not touch. */
function DeleteButton({ prompt, disabled, onDelete }: { readonly prompt: string; readonly disabled: boolean; readonly onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button type="button" className="route-editor-danger" disabled={disabled} onClick={() => setArmed(true)}>
      <Trash2 size={14} />删除路线
    </button>;
  }
  return <span className="route-editor-confirm" role="group" aria-label="确认删除路线">
    {prompt}
    <button type="button" className="route-editor-danger" onClick={() => { setArmed(false); onDelete(); }}>删除</button>
    <button type="button" onClick={() => setArmed(false)}>算了</button>
  </span>;
}

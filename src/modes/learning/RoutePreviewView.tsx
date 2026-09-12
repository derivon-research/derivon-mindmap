import { ArrowRight, Compass, Map as MapIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { RouteSolution } from '../../ports/RouteSolver';
import type { TagDeclaration, WorkspaceGraph } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, routeSteps, type RoutePreview } from '../routePreview';
import { RouteSummary } from './RouteSummary';

export type RoutePreviewViewProps = {
  readonly active: boolean;
  readonly graph: WorkspaceGraph;
  readonly tags: readonly TagDeclaration[];
  readonly preview: RoutePreview;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  /** The confirmed route is being written; the button waits instead of accepting twice. */
  readonly confirming?: boolean;
  /** A write that refused. Reported here rather than swallowed, because nothing was stored. */
  readonly confirmError?: string | null;
  /** Why confirming is not offered at all — a host that cannot store a route cannot confirm one. */
  readonly confirmBlocked?: string | null;
  /** Accepting the route is the only way into route learning. */
  readonly onConfirm: () => void;
  readonly onBackToOrientation: () => void;
  readonly onBrowse: () => void;
};

/**
 * The route, before walking it. A learner sees what was computed and why each step is
 * there, and either accepts it or goes back and changes what it was computed from.
 *
 * Nothing here is approximated locally. A host without a solver says so and offers no
 * route: an invented order would be worse than none, because the learner would trust it.
 */
export function RoutePreviewView({
  active, graph, tags, preview, targetIds, knownIds, confirming = false, confirmError = null, confirmBlocked = null,
  onConfirm, onBackToOrientation, onBrowse,
}: RoutePreviewViewProps) {
  const solution = preview.status === 'ready' && preview.solution.reachable ? preview.solution : null;
  return <div className="learning-preview">
    <section className="learning-preview-main">
      <h1>{solution ? '这是算出来的路线' : '还没有可以走的路线'}</h1>
      {solution
        ? <RouteBody graph={graph} tags={tags} solution={solution} knownIds={knownIds} targetIds={targetIds} />
        : <RouteSummary route={preview} graph={graph} />}
      {confirmBlocked && <p className="learning-preview-error" role="status">{confirmBlocked}</p>}
      {confirmError && <p className="learning-preview-error" role="alert">{confirmError}</p>}
      <footer className="learning-preview-actions">
        <button type="button" className="learning-primary" disabled={!solution || confirming || Boolean(confirmBlocked)}
          onClick={onConfirm}>
          <ArrowRight size={15} aria-hidden="true" />{confirming ? '正在存路线' : '开始学'}
        </button>
        <button type="button" onClick={onBackToOrientation}>
          <Compass size={15} aria-hidden="true" />不对，回去改目标
        </button>
        <button type="button" onClick={onBrowse}>
          <MapIcon size={15} aria-hidden="true" />先去大图里看看
        </button>
      </footer>
    </section>
    <aside className="learning-preview-graph" aria-label="路线子图">
      {solution
        ? <>
          <div className="learning-graph-canvas">
            <RetainedGraph active={active} view={routeGraphView(graph, solution, targetIds, knownIds)}
              onEvent={() => {}} />
          </div>
          <p className="learning-graph-legend">只画这条路线上的概念 · 看得出哪几步合流</p>
        </>
        : <p className="learning-graph-legend">求出路线后，这里画它的子图。</p>}
    </aside>
  </div>;
}

function RouteBody({ graph, tags, solution, targetIds, knownIds }: {
  readonly graph: WorkspaceGraph;
  readonly tags: readonly TagDeclaration[];
  readonly solution: RouteSolution;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
}) {
  const steps = useMemo(() => routeSteps(graph, solution), [graph, solution]);
  const tagLabel = (id: string) => tags.find((tag) => tag.id === id)?.label ?? id;
  const spread = useMemo(() => {
    const counted = new Map<string, number>();
    for (const step of steps) for (const tag of step.tags) counted.set(tag, (counted.get(tag) ?? 0) + 1);
    return [...counted.entries()].sort(([, left], [, right]) => right - left);
  }, [steps]);

  return <>
    <p className="learning-preview-sub">
      目标 {targetIds.map((id) => labelOf(graph, id)).join('、')} · 共 <strong>{steps.length}</strong> 步
      {solution.cost === null ? '' : <> · 总学习成本 <strong>{solution.cost}</strong></>}
      {' · '}{solution.provenOptimal ? '已证明最优' : '预算内的上界，未证明最优'}
      {knownIds.length ? ` · 已按你说会的 ${knownIds.length} 个概念削过` : ' · 你还没说会什么，这是从零算的'}
    </p>
    {spread.length > 0 && <div className="learning-preview-tags">
      {spread.map(([tag, count]) => <span key={tag}>{tagLabel(tag)} · {count}</span>)}
    </div>}
    <ol className="learning-preview-list" aria-label="路线步骤">
      {steps.map((step) => <li key={step.derivationId}>
        <span className="learning-step-index">{step.index}</span>
        <span className="learning-step-label">{step.label}</span>
        <span className="learning-step-because">
          {step.requires.length ? `需要 ${step.requires.map((id) => labelOf(graph, id)).join(' + ')}` : '不需要前提'}
        </span>
        <span className="learning-step-weight">{step.weight}</span>
      </li>)}
    </ol>
  </>;
}

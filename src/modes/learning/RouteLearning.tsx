import { ArrowRight, Check, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { RouteSolution } from '../../ports/RouteSolver';
import { currentInputStartedAtMs, emitInteractionCompleteTestHook } from '../../testHooks';
import type { WorkspaceContent } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, routeSteps, type RouteStep } from '../routePreview';
import { LearningAgentPane } from './LearningAgentPane';
import { ObjectDocument } from './ObjectDocument';
import { setPanel, type PanelLayout, type PanelSide, type PanelState } from './panels';
import {
  hasStaleTaskCompletion, isTaskComplete, routeKey as routeKeyOf, stepDocumentBasis,
  stepDocumentPaths, type TaskCompletion, type TaskVerification,
} from './progress';
import { comprehensionTask } from './suggestions';

export type RouteLearningProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly solution: RouteSolution;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  /** Where along the route the learner is; owned above so switching views does not reset it. */
  readonly cursor: number;
  readonly onCursor: (index: number) => void;
  /** Steps whose definition the learner asked for, keyed by the concept the step arrives at. */
  readonly revealed: readonly string[];
  readonly onReveal: (conceptId: string) => void;
  readonly tasksDone: readonly TaskCompletion[];
  readonly onTaskDone: (completion: TaskCompletion) => void;
  readonly panels: PanelLayout;
  readonly onPanels: (layout: PanelLayout) => void;
  readonly onKnow: (conceptId: string) => void;
  /**
   * The route was solved against a graph this one no longer is. It is walked anyway, with the
   * notice shown: a stale record is evidence of what was once computed, not an error.
   */
  readonly stale?: boolean;
  /** Back to the confirmed routes, to walk a different one. */
  readonly onSwitchRoute: () => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
  readonly conversation?: LearningModeProps['conversation'];
  readonly drainPendingChanges?: LearningModeProps['drainPendingChanges'];
};

/**
 * Walking the route: one step at a time, derivation first and definition second.
 *
 * The order is the point. A definition handed over before the derivation that produces it
 * is a name to memorise; read after, it is a summary of work already done. So the
 * definition stays behind a deliberate press, and the step is only finished once the
 * learner has used the concept for something.
 */
export function RouteLearning({
  active, content, solution, targetIds, knownIds, cursor, onCursor, revealed, onReveal,
  tasksDone, onTaskDone, panels, onPanels, onKnow, stale = false, onSwitchRoute, readAsset, readDocuments, conversation,
  drainPendingChanges,
}: RouteLearningProps) {
  const graph = content.graph;
  const steps = useMemo(() => routeSteps(graph, solution), [graph, solution]);
  const routeKey = routeKeyOf(solution);
  const current: RouteStep | undefined = steps[cursor];
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const definitionOpen = Boolean(current && revealed.includes(current.conceptId));
  const taskBases = useTaskDocumentBases(content, steps, tasksDone, cursor, readDocuments);
  const verificationFor = (step: RouteStep, documentBasis: string | null): TaskVerification => ({
    graphText: content.graphText, routeKey, step,
    task: comprehensionTask(steps, step), documentBasis,
  });
  const currentTask = current ? comprehensionTask(steps, current) : '';
  const currentBasis = current ? taskBases.bases.get(current.derivationId) ?? null : null;
  const currentVerification = current ? verificationFor(current, currentBasis) : undefined;
  const taskDone = Boolean(current && taskBases.status === 'ready'
    && currentVerification && isTaskComplete(tasksDone, currentVerification));
  const taskStale = Boolean(current && taskBases.status === 'ready'
    && currentVerification && hasStaleTaskCompletion(tasksDone, currentVerification));
  const stepCompleted = (step: RouteStep) => taskBases.status === 'ready'
    && isTaskComplete(tasksDone, verificationFor(step, taskBases.bases.get(step.derivationId) ?? null));
  const earliestStaleTask = useMemo(() => {
    if (taskBases.status !== 'ready') return -1;
    return steps.findIndex((step, index) => index < cursor
      && hasStaleTaskCompletion(tasksDone, verificationFor(step, taskBases.bases.get(step.derivationId) ?? null)));
  }, [cursor, routeKey, steps, taskBases, tasksDone]);
  useEffect(() => {
    if (earliestStaleTask >= 0) onCursor(earliestStaleTask);
  }, [earliestStaleTask, onCursor]);

  const movePanel = (side: PanelSide, state: PanelState) => {
    const startedAtMs = currentInputStartedAtMs();
    const next = setPanel(panels, side, state);
    onPanels(next);
    // Only the rail is the route panel; the tutor's width is not part of the contract.
    if (next.rail !== panels.rail) {
      void emitInteractionCompleteTestHook({
        interaction: 'toggle-panel', startedAtMs,
        context: { panel: 'route', expanded: next.rail === 'expanded' },
      });
    }
  };

  return <div className={`learning-route tutor-${panels.tutor} rail-${panels.rail}`}
    data-route-step={current ? current.index : steps.length}>
    {panels.tutor === 'hidden' && <button type="button" className="learning-tab is-left"
      onClick={() => movePanel('tutor', 'default')}>Agent 对话 <ChevronRight size={13} aria-hidden="true" /></button>}
    {panels.rail === 'hidden' && <button type="button" className="learning-tab is-right"
      onClick={() => movePanel('rail', 'default')}><ChevronRight size={13} aria-hidden="true" />路线</button>}

    {panels.tutor !== 'hidden' && <aside className="learning-tutor" aria-label="Agent">
      <header>
        <span>Agent</span>
        <PanelControls state={panels.tutor} expandLabel="展开对话"
          onChange={(state) => movePanel('tutor', state)} />
      </header>
      {/* Not keyed on the step: the companion session outlives a step, so a transcript
          that vanished at every step would disagree with what the model remembers.
          Only 新对话 ends a conversation. */}
      <LearningAgentPane
        quickQuestions={current ? premiseQuestions(steps, current, label) : []}
        onWideAnswer={() => movePanel('tutor', 'expanded')} conversation={conversation}
        drainPendingChanges={drainPendingChanges} />
    </aside>}

    <article className="learning-text">
      <div className="learning-text-column">
        {stale && <p className="learning-route-stale" role="alert">
          这条路线是在另一版图上解出来的。它没有被重新求解，也没有被删掉 —— 能走完，只是不再对应当前的图。
        </p>}
        {current
          ? <Step active={active} content={content} step={current} total={steps.length} label={label}
            definitionOpen={definitionOpen} taskDone={taskDone} taskStale={taskStale}
            taskChecking={taskBases.status === 'loading'} taskReady={currentBasis !== null} nextTask={currentTask}
            onReveal={() => onReveal(current.conceptId)}
            onTaskDone={() => currentBasis !== null && onTaskDone({
              graphText: content.graphText, routeKey,
              conceptId: current.conceptId, derivationId: current.derivationId,
              task: currentTask, documentBasis: currentBasis,
            })}
            onNext={() => onCursor(cursor + 1)}
            onKnow={() => { onKnow(current.conceptId); onCursor(cursor + 1); }}
            onAskAgent={() => movePanel('tutor', 'default')}
            readAsset={readAsset} readDocuments={readDocuments} />
          : <div className="learning-route-done">
            <h2>这条路线走完了</h2>
            <p>{steps.length} 步{solution.cost === null ? '' : `，总学习成本 ${solution.cost}`}。
              路线本身存在学习者记录里；走到哪一步还没存下来。</p>
            <div className="learning-text-actions">
              <button type="button" className="learning-primary" onClick={() => onCursor(0)}>从头再走一遍</button>
              <button type="button" onClick={onSwitchRoute}>换一条路线</button>
            </div>
          </div>}
      </div>
    </article>

    {panels.rail !== 'hidden' && <nav className="learning-rail" aria-label="路线">
      <div className="learning-rail-head">
        <span>{targetIds.map(label).join('、') || '路线'}</span>
        <em>{Math.min(cursor + 1, steps.length)} / {steps.length}</em>
        <button type="button" className="learning-rail-switch" onClick={onSwitchRoute}>换一条路线</button>
        <PanelControls state={panels.rail} expandLabel="展开子图"
          onChange={(state) => movePanel('rail', state)} />
      </div>
      {panels.rail === 'default'
        ? <ol className="learning-rail-list">
          {steps.map((step, index) => <li key={step.derivationId}
            className={index === cursor ? 'is-active' : index < cursor ? 'is-done' : ''}>
            <button type="button" aria-current={index === cursor ? 'step' : undefined}
              onClick={() => onCursor(index)}>
              <span className="learning-rail-index">{step.index}</span>
              <span className="learning-rail-label">{step.label}</span>
              {stepCompleted(step) && <Check size={13} aria-hidden="true" />}
            </button>
          </li>)}
        </ol>
        : <div className="learning-graph-canvas">
          <RetainedGraph active={active} view={routeGraphView(graph, solution, targetIds, knownIds, {
            completedIds: steps.slice(0, cursor).map((step) => step.conceptId),
            currentId: current?.conceptId ?? null,
          })} onEvent={(event) => {
            if (event.object?.kind !== 'concept') return;
            const index = steps.findIndex((step) => step.conceptId === event.object?.id);
            if (index > -1) onCursor(index);
          }} />
        </div>}
      <p className="learning-rail-note">
        {panels.rail === 'expanded' ? '路线子图 · 看得见哪几步合流' : '折叠态 · 只排步骤，不画依赖关系'}
      </p>
    </nav>}
  </div>;
}

type TaskDocumentBases = {
  readonly status: 'loading' | 'ready';
  readonly bases: ReadonlyMap<string, string | null>;
};

function useTaskDocumentBases(
  content: WorkspaceContent,
  steps: readonly RouteStep[],
  completions: readonly TaskCompletion[],
  cursor: number,
  readDocuments: LearningModeProps['readDocuments'],
): TaskDocumentBases {
  const needed = useMemo(() => {
    const derivationIds = new Set([steps[cursor]?.derivationId, ...completions.map(({ derivationId }) => derivationId)]);
    return steps.filter((step) => derivationIds.has(step.derivationId));
  }, [completions, cursor, steps]);
  const pathsKey = needed.map((step) => `${step.derivationId}:${step.conceptId}`).join('|');
  const contentBases = useMemo(() => new Map(needed.map((step) => [
    step.derivationId,
    stepDocumentBasis(content, step),
  ])), [content, needed]);
  const [loaded, setLoaded] = useState<{
    readonly content: WorkspaceContent;
    readonly reader: LearningModeProps['readDocuments'];
    readonly pathsKey: string;
    readonly bases: ReadonlyMap<string, string | null>;
  }>();
  useEffect(() => {
    if (!readDocuments || needed.length === 0) return;
    let cancelled = false;
    const paths = needed.flatMap((step) => stepDocumentPaths(content, step));
    void readDocuments([...new Set(paths)])
      .then((resources) => {
        if (cancelled) return;
        setLoaded({
          content, reader: readDocuments, pathsKey,
          bases: new Map(needed.map((step) => [step.derivationId, stepDocumentBasis(content, step, resources)])),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ content, reader: readDocuments, pathsKey, bases: new Map(needed.map((step) => [step.derivationId, null])) });
      });
    return () => { cancelled = true; };
  }, [content, needed, pathsKey, readDocuments]);

  if (!readDocuments || [...contentBases.values()].every((basis) => basis !== null)) {
    return { status: 'ready', bases: contentBases };
  }
  return loaded?.content === content && loaded.reader === readDocuments && loaded.pathsKey === pathsKey
    ? { status: 'ready', bases: loaded.bases }
    : { status: 'loading', bases: contentBases };
}

/** The three-state control: widen, return to default width, hide. */
function PanelControls({ state, onChange, expandLabel }: {
  readonly state: PanelState;
  readonly onChange: (state: PanelState) => void;
  readonly expandLabel: string;
}) {
  return <span className="learning-panel-controls">
    {state === 'expanded'
      ? <button type="button" title="收回默认宽度" aria-label="收回默认宽度"
        onClick={() => onChange('default')}><Minimize2 size={13} aria-hidden="true" /></button>
      : <button type="button" title={expandLabel} aria-label={expandLabel}
        onClick={() => onChange('expanded')}><Maximize2 size={13} aria-hidden="true" /></button>}
    <button type="button" title="隐藏" aria-label="隐藏" onClick={() => onChange('hidden')}>
      <X size={13} aria-hidden="true" />
    </button>
  </span>;
}

/**
 * The tutor's opening offers, read off the route rather than written down: the premises
 * this step leans on, and where each of them came from. No model is connected, so the only
 * answers on offer are ones the graph can back.
 */
function premiseQuestions(
  steps: readonly RouteStep[], step: RouteStep, label: (conceptId: string) => string,
): readonly { readonly label: string; readonly answer: string }[] {
  return step.requires.slice(0, 2).map((conceptId) => {
    const source = steps.find((candidate) => candidate.conceptId === conceptId);
    return {
      label: `「${label(conceptId)}」是什么来着？`,
      answer: source
        ? `第 ${source.index} 步做出来的，靠的是 ${source.requires.map(label).join(' + ') || '不需要前提'}。要重看就点右边路线里的第 ${source.index} 步。`
        : `这条路线没有做出「${label(conceptId)}」—— 它要么是你说会的，要么是图里的起点。可以去大图浏览里翻它的文档。`,
    };
  });
}

function Step({
  active, content, step, total, label, definitionOpen, taskDone, taskStale, taskChecking, taskReady, nextTask,
  onReveal, onTaskDone, onNext, onKnow, onAskAgent, readAsset, readDocuments,
}: {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly step: RouteStep;
  readonly total: number;
  readonly label: (conceptId: string) => string;
  readonly definitionOpen: boolean;
  readonly taskDone: boolean;
  readonly taskStale: boolean;
  readonly taskChecking: boolean;
  readonly taskReady: boolean;
  readonly nextTask: string;
  readonly onReveal: () => void;
  readonly onTaskDone: () => void;
  readonly onNext: () => void;
  readonly onKnow: () => void;
  readonly onAskAgent: () => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
}) {
  const [draft, setDraft] = useState('');
  const top = useRef<HTMLElement>(null);
  useEffect(() => { setDraft(''); top.current?.scrollIntoView({ block: 'start' }); }, [step.derivationId]);

  const derivation = content.graph.hyperedges.find((edge) => edge.id === step.derivationId);
  const concept = content.graph.points.find((point) => point.id === step.conceptId);
  const premises = step.requires.map(label).join(' + ');

  return <>
    <header ref={top}>
      <span>第 {step.index} / {total} 步</span>
      <h2>{premises ? `${premises} → ` : ''}{step.label}</h2>
      <p>先看这一步怎么做出来。定义在后面。</p>
    </header>

    <section className="learning-derivation" aria-label={`${step.label} 的推导`}>
      <ObjectDocument title={`${step.label} 的推导`} content={content} object={derivation} active={active}
        readAsset={readAsset} readDocuments={readDocuments} />
    </section>

    {!definitionOpen
      ? <div className="learning-text-actions">
        <button type="button" className="learning-primary" onClick={onReveal}>跟下来了，给我定义 ↓</button>
        <button type="button" onClick={onAskAgent}>看不懂推导，问 Agent</button>
        <button type="button" onClick={onKnow}>这一步我早就会了</button>
      </div>
      : <>
        <section className="learning-definition" aria-label={`${step.label} 的定义`}>
          <h3>定义：{step.label}</h3>
          <ObjectDocument title={`${step.label} 的定义`} content={content} object={concept} active={active}
            readAsset={readAsset} readDocuments={readDocuments} />
        </section>

        <section className={`learning-task${taskDone ? ' is-done' : ''}`} aria-label="理解验证">
          <h3>拿它去做件事<span>理解验证</span></h3>
          <p>{nextTask}</p>
          {taskDone
            ? <p className="learning-task-done">已交。这一次没有判对错，也没有存下来 —— 判定会回头改这条推导的学习成本，那部分还没做。</p>
            : <>
              {taskStale && <p className="learning-task-stale" role="alert">内容更新了，这份回答不能当作新版验证。重新交一次。</p>}
              {taskChecking && <p role="status">正在核对新版文档…</p>}
              <textarea value={draft} aria-label="理解验证的回答" placeholder="写一句就行…"
                disabled={taskChecking || !taskReady}
                onChange={(event) => setDraft(event.target.value)} />
              <div className="learning-task-actions">
                <button type="button" className="learning-primary"
                  disabled={taskChecking || !taskReady || !draft.trim()}
                  onClick={onTaskDone}>交上去</button>
              </div>
            </>}
        </section>

        <div className="learning-text-actions">
          <button type="button" className="learning-primary" disabled={!taskDone} onClick={onNext}>
            学会了，下一步 <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={onAskAgent}>定义与推导对不上</button>
        </div>
      </>}
  </>;
}

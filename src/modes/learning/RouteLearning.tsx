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
  readonly tasksDone: readonly string[];
  readonly onTaskDone: (conceptId: string) => void;
  readonly panels: PanelLayout;
  readonly onPanels: (layout: PanelLayout) => void;
  readonly onKnow: (conceptId: string) => void;
  readonly onBackToPreview: () => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
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
  tasksDone, onTaskDone, panels, onPanels, onKnow, onBackToPreview, readAsset, readDocuments,
}: RouteLearningProps) {
  const graph = content.graph;
  const steps = useMemo(() => routeSteps(graph, solution), [graph, solution]);
  const current: RouteStep | undefined = steps[cursor];
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const definitionOpen = Boolean(current && revealed.includes(current.conceptId));
  const taskDone = Boolean(current && tasksDone.includes(current.conceptId));

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
      <LearningAgentPane key={current?.conceptId ?? 'done'}
        contextLabel={current ? `${current.requires.map(label).join(' + ')} → ${current.label}` : '这条路线'}
        quickQuestions={current ? premiseQuestions(steps, current, label) : []}
        onWideAnswer={() => movePanel('tutor', 'expanded')} />
    </aside>}

    <article className="learning-text">
      <div className="learning-text-column">
        {current
          ? <Step active={active} content={content} step={current} total={steps.length} label={label}
            definitionOpen={definitionOpen} taskDone={taskDone} nextTask={comprehensionTask(steps, current)}
            onReveal={() => onReveal(current.conceptId)}
            onTaskDone={() => onTaskDone(current.conceptId)}
            onNext={() => onCursor(cursor + 1)}
            onKnow={() => { onKnow(current.conceptId); onCursor(cursor + 1); }}
            onAskAgent={() => movePanel('tutor', 'default')}
            readAsset={readAsset} readDocuments={readDocuments} />
          : <div className="learning-route-done">
            <h2>这条路线走完了</h2>
            <p>{steps.length} 步{solution.cost === null ? '' : `，总学习成本 ${solution.cost}`}。
              这一次的进度只活在这个会话里，还没有存下来。</p>
            <div className="learning-text-actions">
              <button type="button" className="learning-primary" onClick={() => onCursor(0)}>从头再走一遍</button>
              <button type="button" onClick={onBackToPreview}>回去看路线</button>
            </div>
          </div>}
      </div>
    </article>

    {panels.rail !== 'hidden' && <nav className="learning-rail" aria-label="路线">
      <div className="learning-rail-head">
        <span>{targetIds.map(label).join('、') || '路线'}</span>
        <em>{Math.min(cursor + 1, steps.length)} / {steps.length}</em>
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
              {tasksDone.includes(step.conceptId) && <Check size={13} aria-hidden="true" />}
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
  active, content, step, total, label, definitionOpen, taskDone, nextTask,
  onReveal, onTaskDone, onNext, onKnow, onAskAgent, readAsset, readDocuments,
}: {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly step: RouteStep;
  readonly total: number;
  readonly label: (conceptId: string) => string;
  readonly definitionOpen: boolean;
  readonly taskDone: boolean;
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
              <textarea value={draft} aria-label="理解验证的回答" placeholder="写一句就行…"
                onChange={(event) => setDraft(event.target.value)} />
              <div className="learning-task-actions">
                <button type="button" className="learning-primary" disabled={!draft.trim()}
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

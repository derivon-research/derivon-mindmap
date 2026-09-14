import { Check, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { MasterySource } from '../../learner-records';
import type { RouteSolution } from '../../ports/RouteSolver';
import { currentInputStartedAtMs, emitInteractionCompleteTestHook } from '../../testHooks';
import type { WorkspaceContent } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, type RouteStep } from '../routePreview';
import { KNOWN_SOURCE_TAG } from './knownSource';
import { LearningAgentPane } from './LearningAgentPane';
import { ObjectDocument } from './ObjectDocument';
import { setPanel, type PanelLayout, type PanelSide, type PanelState } from './panels';
import type { RouteProgress, StepStanding } from './routeProgress';
import { comprehensionTask } from './suggestions';

export type RouteLearningProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly solution: RouteSolution;
  /** The route as a numbered reading order; one place, so progress and rendering agree. */
  readonly steps: readonly RouteStep[];
  /** Where the learner has got to, derived from the learner records — never from a cursor. */
  readonly progress: RouteProgress;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  /** Where each known concept's knowledge came from, so a self-report is not read as a judgement. */
  readonly knownSources?: ReadonlyMap<string, MasterySource>;
  /** Steps whose definition the learner asked for, keyed by the concept the step arrives at. */
  readonly revealed: readonly string[];
  readonly onReveal: (conceptId: string) => void;
  /** The learner handed in this step's verification; the judgement is written where records live. */
  readonly onSubmit: (step: RouteStep) => void;
  readonly submitting?: boolean;
  readonly submitError?: string | null;
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
 *
 * Which step that is, is not this component's to decide. Progress is derived from the learner
 * records, so a concept reached here — or on another route through it — moves the walk, and a
 * judgement whose content changed pulls it back
 * ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
 */
export function RouteLearning({
  active, content, solution, steps, progress, targetIds, knownIds, knownSources = new Map(), revealed, onReveal,
  onSubmit, submitting = false, submitError = null, panels, onPanels, onKnow, stale = false, onSwitchRoute,
  readAsset, readDocuments, conversation, drainPendingChanges,
}: RouteLearningProps) {
  const graph = content.graph;
  const current = progress.currentIndex < steps.length ? steps[progress.currentIndex] : undefined;
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const definitionOpen = Boolean(current && revealed.includes(current.conceptId));
  const standingOf = (step: RouteStep): StepStanding => progress.standings.get(step.derivationId) ?? 'unassessed';
  const completedIds = steps.filter((step) => standingOf(step) === 'complete').map((step) => step.conceptId);

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
        {/* Until the current step's own record has been matched against the content, which step
            it is is not known yet — and showing one would be a guess that may move. A later
            step still being checked does not hold up a step that is already known. */}
        {current !== undefined && standingOf(current) === 'checking'
          ? <p className="learning-route-checking" role="status">正在核对这条路线上的判定还对不对…</p>
          : current
            ? <Step active={active} content={content} step={current} total={steps.length} label={label}
              definitionOpen={definitionOpen} standing={standingOf(current)}
              submitting={submitting} submitError={submitError} nextTask={comprehensionTask(steps, current)}
              onReveal={() => onReveal(current.conceptId)}
              onSubmit={() => onSubmit(current)}
              onKnow={() => onKnow(current.conceptId)}
              onAskAgent={() => movePanel('tutor', 'default')}
              readAsset={readAsset} readDocuments={readDocuments} />
            : <div className="learning-route-done">
              <h2>这条路线走完了</h2>
              <p>{steps.length} 步{solution.cost === null ? '' : `，总学习成本 ${solution.cost}`}。
                路线本身存在学习者记录里，走到哪一步也由它算出来 —— 每一步的判定都在里面。</p>
              <div className="learning-text-actions">
                <button type="button" onClick={onSwitchRoute}>换一条路线</button>
              </div>
            </div>}
      </div>
    </article>

    {panels.rail !== 'hidden' && <nav className="learning-rail" aria-label="路线">
      <div className="learning-rail-head">
        <span>{targetIds.map(label).join('、') || '路线'}</span>
        <em>{Math.min(progress.currentIndex + 1, steps.length)} / {steps.length}</em>
        <button type="button" className="learning-rail-switch" onClick={onSwitchRoute}>换一条路线</button>
        <PanelControls state={panels.rail} expandLabel="展开子图"
          onChange={(state) => movePanel('rail', state)} />
      </div>
      {/* A progress display, not a way to move: there is nowhere to move to that the records
          do not already say, so the steps are read, not pressed. */}
      {panels.rail === 'default'
        ? <ol className="learning-rail-list">
          {steps.map((step, index) => <li key={step.derivationId}
            className={index === progress.currentIndex ? 'is-active' : standingOf(step) === 'complete' ? 'is-done' : ''}>
            <span aria-current={index === progress.currentIndex ? 'step' : undefined}>
              <span className="learning-rail-index">{step.index}</span>
              <span className="learning-rail-label">{step.label}</span>
              {knownSources.get(step.conceptId) && <span className="learning-rail-source">
                {KNOWN_SOURCE_TAG[knownSources.get(step.conceptId)!]}
              </span>}
              {standingOf(step) === 'complete' && <Check size={13} aria-hidden="true" />}
            </span>
          </li>)}
        </ol>
        : <div className="learning-graph-canvas">
          {/* A view of where the learner is, not a way to move: a step follows from the records,
              so selecting a concept on the subgraph has nothing to do here. */}
          <RetainedGraph active={active} view={routeGraphView(graph, solution, targetIds, knownIds, {
            completedIds,
            currentId: current?.conceptId ?? null,
          })} onEvent={() => undefined} />
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
        ? `第 ${source.index} 步做出来的，靠的是 ${source.requires.map(label).join(' + ') || '不需要前提'}。那一步在路线栏里，走过就有判定标记。`
        : `这条路线没有做出「${label(conceptId)}」—— 它要么是已知的，要么是图里的起点。可以去大图浏览里翻它的文档。`,
    };
  });
}

/**
 * What the current step says about a judgement that is not counting any more. Each one is a
 * record that is kept, never re-decided: the learner decides whether to hand the step in again.
 */
const STANDING_NOTE: Partial<Record<StepStanding, { readonly role: 'alert' | 'status'; readonly text: string }>> = {
  stale: { role: 'alert', text: '内容更新了，上一份回答不能当作新版验证 —— 它作为历史证据留在记录里。交一次新的。' },
  unverifiable: { role: 'alert', text: '这个宿主算不出这一步所依据的内容版本，所以上一次的判定还算不算数无法确认。' },
  incomplete: { role: 'status', text: '上一次的判定是「还没到」，它留在记录里。可以再交一次。' },
};

function Step({
  active, content, step, total, label, definitionOpen, standing, submitting, submitError, nextTask,
  onReveal, onSubmit, onKnow, onAskAgent, readAsset, readDocuments,
}: {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly step: RouteStep;
  readonly total: number;
  readonly label: (conceptId: string) => string;
  readonly definitionOpen: boolean;
  readonly standing: StepStanding;
  readonly submitting: boolean;
  readonly submitError: string | null;
  readonly nextTask: string;
  readonly onReveal: () => void;
  readonly onSubmit: () => void;
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
  const note = STANDING_NOTE[standing];

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

        <section className="learning-task" aria-label="理解验证">
          <h3>拿它去做件事<span>理解验证</span></h3>
          <p>{nextTask}</p>
          {note && <p className="learning-task-stale" role={note.role}>{note.text}</p>}
          <textarea value={draft} aria-label="理解验证的回答" placeholder="写一句就行…"
            disabled={submitting}
            onChange={(event) => setDraft(event.target.value)} />
          <div className="learning-task-actions">
            <button type="button" className="learning-primary"
              disabled={submitting || !draft.trim()}
              onClick={onSubmit}>{submitting ? '正在记下…' : '交上去'}</button>
          </div>
          {submitError && <p className="learning-task-stale" role="alert">{submitError}</p>}
        </section>

        <div className="learning-text-actions">
          <button type="button" onClick={onAskAgent}>定义与推导对不上</button>
          <span className="learning-note">交上去就写一条判定记录，下一步由掌握算出来</span>
        </div>
      </>}
  </>;
}

import { AlertTriangle, Check, FileText, MessageSquarePlus, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { GraphEvent } from '../../rendering';
import { currentInputStartedAtMs, emitInteractionCompleteTestHook } from '../../testHooks';
import type { WorkspaceContent } from '../../workspace/index';
import { searchConcepts } from '../conceptSearch';
import { labelOf } from '../ConceptPicker';
import { overviewGraphView } from '../graphViews';
import { RetainedGraph } from '../RetainedGraph';
import type { RoutePreview } from '../routePreview';
import { ConceptReader, useConceptPages } from './ConceptReader';
import { currentQuestion, type OrientationIntent, type OrientationPlan, type OrientationRun } from './orientation';
import { OrientationQuestionBlock } from './OrientationQuestion';
import { graphProbeCandidates, routeProbeCandidates } from './probe';
import { RouteSummary } from './RouteSummary';
import { sameTagNeighbours, terminalConcepts } from './suggestions';

/**
 * One exchange in the orientation thread. The thread is throwaway — it is a record of how
 * this conversation went, not where the answers live. Targets, known concepts and the
 * probe bookkeeping are application state and survive "+ 新对话" untouched.
 *
 * A document appears in the thread as a reference to it, never as an embedded excerpt:
 * reading happens on the reading surface, at full size.
 */
type Turn =
  | { readonly kind: 'agent' | 'learner'; readonly text: string }
  | { readonly kind: 'doc'; readonly conceptId: string }
  | { readonly kind: 'targets'; readonly conceptIds: readonly string[]; readonly note: string }
  | { readonly kind: 'probe'; readonly conceptIds: readonly string[]; readonly round: number };

export type OrientationViewProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly plan: OrientationPlan;
  readonly run: OrientationRun;
  readonly preview: RoutePreview;
  readonly onIntent: (intent: OrientationIntent) => void;
  readonly onEnterPreview: () => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
};

/**
 * Where a learner says what they want and what they already have. Everything the flow
 * needs is settled here: nothing downstream asks again.
 *
 * The whole view is deterministic. It reads the author's questions, searches the graph and
 * ranks probe rounds by what the answer would do to the route — no model is involved, and
 * the flow is complete on a host that offers none.
 */
export function OrientationView({
  active, content, plan, run, preview, onIntent, onEnterPreview, readAsset, readDocuments,
}: OrientationViewProps) {
  const graph = content.graph;
  // Named for the thread, not the stage: `opening` already means "opening a workspace" here.
  const firstTurn = (): readonly Turn[] => [{
    kind: 'agent',
    text: `这张图有 ${graph.points.length} 个概念。先别看图 —— 说说你为什么来，或者直接在下面打一个概念的名字。`,
  }];
  const [turns, setTurns] = useState<readonly Turn[]>(firstTurn);
  const [draft, setDraft] = useState('');
  const threadEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }); }, [turns]);

  const say = (...items: Turn[]) => setTurns((current) => [...current, ...items]);
  const question = currentQuestion(plan, run);
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const suggestions = useMemo(() => searchConcepts(graph, draft), [draft, graph]);
  const reading = useConceptPages();

  /**
   * Which concepts to put in the next round. A solved route ranks them by what the answer
   * removes from it; without one, the graph's own shape is the best available guess.
   */
  const candidates = (): readonly string[] => (preview.status === 'ready' && preview.solution.reachable
    ? routeProbeCandidates(graph, preview.solution, run)
    : graphProbeCandidates(graph, run));

  const addTargets = (conceptIds: readonly string[]) => {
    if (!conceptIds.length) return;
    const startedAtMs = currentInputStartedAtMs();
    onIntent({ kind: 'add-targets', conceptIds });
    const merged = [...new Set([...run.targets, ...conceptIds])];
    const neighbours = sameTagNeighbours(graph, merged);
    say(
      { kind: 'agent', text: `目标记下了：${merged.map((id) => `「${label(id)}」`).join('、')}。${
        neighbours.length ? '要连带学会别的吗？跟它们同领域的有这几个。' : ''}` },
      ...(neighbours.length
        ? [{ kind: 'targets', conceptIds: neighbours, note: '同领域 · 点一下加进目标' } as Turn]
        : []),
    );
    void emitInteractionCompleteTestHook({
      interaction: 'switch-target', startedAtMs,
      context: { conceptId: conceptIds[0], selected: true },
    });
  };

  const dropTarget = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    onIntent({ kind: 'set-targets', conceptIds: run.targets.filter((id) => id !== conceptId) });
    void emitInteractionCompleteTestHook({
      interaction: 'switch-target', startedAtMs, context: { conceptId, selected: false },
    });
  };

  /** Every choice is reversible: pressing the same option again takes it back. */
  const toggleTarget = (conceptId: string) => {
    if (run.targets.includes(conceptId)) dropTarget(conceptId);
    else addTargets([conceptId]);
  };

  const toggleKnown = (conceptId: string) => onIntent(run.known.includes(conceptId)
    ? { kind: 'set-known', conceptIds: run.known.filter((id) => id !== conceptId) }
    : { kind: 'know', conceptIds: [conceptId] });

  /** Reading turns a page on the surface beside the thread; nothing is embedded in it. */
  const readDoc = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    reading.open(conceptId);
    void emitInteractionCompleteTestHook({
      interaction: 'select-concept', startedAtMs, context: { conceptId },
    });
  };

  const openDoc = (conceptId: string) => {
    say({ kind: 'doc', conceptId });
    readDoc(conceptId);
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft('');
    const hit = searchConcepts(graph, trimmed, 1)[0];
    if (!hit) {
      say({ kind: 'learner', text: trimmed },
        { kind: 'agent', text: '图里没有直接对上的概念。换个说法，或者从右边的图里点一个。' });
      return;
    }
    say({ kind: 'learner', text: trimmed },
      { kind: 'agent', text: `「${hit.data.label}」的文档在这儿。要把它加进目标，还是你本来就会？` },
      { kind: 'doc', conceptId: hit.id });
    readDoc(hit.id);
  };

  /**
   * Put a round in front of the learner and spend it in the same move. A round is spent
   * when it is asked, not when it is answered: the learner may leave for the route without
   * touching it, and coming back to re-offer the identical six would be asking twice.
   */
  const openRound = (lead: string, round: number) => {
    const ids = candidates();
    if (!ids.length) {
      say({ kind: 'agent', text: '没有更值得问的了 —— 再问下去也不会改变路线。' });
      return;
    }
    onIntent({ kind: 'ask-known', conceptIds: ids });
    say({ kind: 'agent', text: lead }, { kind: 'probe', conceptIds: ids, round });
  };

  const startProbe = () => openRound(
    `就这 ${run.targets.length} 个目标。下面这几个，会的点一下 —— 会得越多，要走的路越短。`,
    run.round + 1,
  );

  const askAgain = (round: number) => openRound('再来一轮，这次问的是现在最吃重的几个。', round + 1);

  const view = useMemo(() => overviewGraphView(graph, { targetIds: run.targets, knownIds: run.known }),
    [graph, run.known, run.targets]);
  const handleEvent = (event: GraphEvent) => {
    if (event.object?.kind === 'concept') openDoc(event.object.id);
  };

  const renderTurn = (turn: Turn, index: number) => {
    switch (turn.kind) {
      case 'agent':
      case 'learner':
        return <p key={index} className={`learning-bubble is-${turn.kind}`}>{turn.text}</p>;
      case 'doc':
        return <button key={index} type="button"
          className={`learning-doc-link${reading.current === turn.conceptId ? ' is-open' : ''}`}
          onClick={() => readDoc(turn.conceptId)}>
          <FileText size={14} aria-hidden="true" />
          「{label(turn.conceptId)}」的文档<span>在右边展开 →</span>
        </button>;
      case 'targets':
        return <div key={index} className="learning-choice-block">
          <span className="learning-choice-note">{turn.note}</span>
          <ChoiceGrid conceptIds={turn.conceptIds} chosenIds={run.targets} label={label} onPick={toggleTarget} />
        </div>;
      case 'probe':
        return <div key={index} className="learning-choice-block">
          <span className="learning-choice-note">第 {turn.round} 轮 · 会的点一下</span>
          <span className="learning-choice-hint">点错了再点一下就取消</span>
          <ChoiceGrid conceptIds={turn.conceptIds} chosenIds={run.known} label={label} onPick={toggleKnown} />
          {index === turns.length - 1 && <div className="learning-choice-actions">
            <button type="button" onClick={() => askAgain(turn.round)}>再问我一轮，路线会更准</button>
            <button type="button" className="learning-primary" onClick={onEnterPreview}>够了，先看看路线</button>
          </div>}
        </div>;
    }
  };

  const starters = useMemo(() => terminalConcepts(graph), [graph]);

  return <div className={`learning-orientation${reading.current ? ' is-reading' : ''}`}
    data-orientation-round={run.round}>
    <section className="learning-thread-pane" aria-label="目标与已知">
      <header className="learning-thread-head">
        {/* The learner is never told they are in a stage called 开局; the head says what to do. */}
        <span>说说你想学会什么</span>
        <button type="button" className="learning-ghost-button" onClick={() => { setTurns(firstTurn()); setDraft(''); }}>
          <MessageSquarePlus size={14} aria-hidden="true" />新对话
        </button>
      </header>
      <div className="learning-thread" role="log" aria-label="对话记录">
        {plan.fallbackReason === 'invalid' && <p className="orientation-warning" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          这个工作区的开局配置无法使用（{plan.message}），已回到通用入口。
        </p>}
        {turns.map(renderTurn)}
        {question
          ? <OrientationQuestionBlock key={question.id} question={question}
            onAnswer={(optionIds) => onIntent({ kind: 'answer', optionIds })}
            onSkip={() => onIntent({ kind: 'skip' })} />
          : <div className="learning-confirm">
            <h2>{run.targets.length ? '你的目标' : '想学会什么？'}</h2>
            <div className="learning-chips">
              {run.targets.map((conceptId) => <button key={conceptId} type="button" className="learning-chip"
                aria-label={`移除目标 ${label(conceptId)}`} onClick={() => dropTarget(conceptId)}>
                {label(conceptId)}<X size={12} aria-hidden="true" />
              </button>)}
              {!run.targets.length && <span className="learning-chips-empty">还没有目标</span>}
            </div>
            {!run.targets.length && starters.length > 0 && <div className="learning-choice-block">
              <span className="learning-choice-note">不知道从哪开始？这张图最后通向这几个概念</span>
              <ChoiceGrid conceptIds={starters} chosenIds={run.targets} label={label} onPick={toggleTarget} />
            </div>}
            <div className="learning-known">
              <p className="learning-confirm-known">已经会的：{run.known.length} 个概念{
                run.round ? ` · 问过 ${run.round} 轮` : ''}</p>
              <div className="learning-chips">
                {run.known.map((conceptId) => <button key={conceptId} type="button" className="learning-chip is-known"
                  aria-label={`取消已会 ${label(conceptId)}`} onClick={() => toggleKnown(conceptId)}>
                  {label(conceptId)}<X size={12} aria-hidden="true" />
                </button>)}
              </div>
            </div>
            <RouteSummary route={preview} graph={graph} />
            <footer className="learning-confirm-actions">
              <button type="button" disabled={!run.targets.length} onClick={startProbe}>
                {run.round ? '再问我一轮' : `就这${run.targets.length > 1 ? ` ${run.targets.length} 个` : '一个'}，问我会什么吧`}
              </button>
              <button type="button" className="learning-primary" disabled={!run.targets.length}
                onClick={onEnterPreview}>去看路线</button>
            </footer>
          </div>}
        <div ref={threadEnd} />
      </div>
      <form className="learning-composer" onSubmit={(event) => { event.preventDefault(); submit(draft); }}>
        {draft.trim() && suggestions.length > 0 && <div className="learning-suggest">
          {suggestions.map((point) => <button key={point.id} type="button" onClick={() => { setDraft(''); openDoc(point.id); }}>
            <Search size={13} aria-hidden="true" />{point.data.label}
          </button>)}
        </div>}
        <div className="learning-composer-row">
          <input value={draft} aria-label="说出你想学会什么，或搜索一个概念"
            placeholder="说出你想学会什么，或直接打一个概念的名字…"
            onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="learning-primary" disabled={!draft.trim()}
            title="发送" aria-label="发送"><Send size={15} /></button>
        </div>
      </form>
    </section>
    <section className="learning-graph-pane" aria-label="概念全图">
      <div className="learning-graph-canvas"><RetainedGraph active={active} view={view} onEvent={handleEvent} /></div>
      <div className="learning-graph-legend">
        <span><i className="is-target" aria-hidden="true" />目标 {run.targets.length}</span>
        <span><i className="is-known" aria-hidden="true" />已会 {run.known.length}</span>
        <span><i aria-hidden="true" />其余 · 共 {graph.points.length} 个概念 · 点一个看它的文档</span>
      </div>
      {/* Reading covers the map instead of replacing it: the graph keeps its layout and
          viewport underneath, so closing the document costs nothing (ADR-0006). */}
      {reading.current && <ConceptReader active={active} content={content} conceptId={reading.current}
        pages={reading.pages} at={reading.at} onGo={reading.go} onClose={reading.close} closeLabel="回到图"
        isTarget={run.targets.includes(reading.current)} isKnown={run.known.includes(reading.current)}
        onToggleTarget={toggleTarget} onToggleKnown={toggleKnown}
        readAsset={readAsset} readDocuments={readDocuments} />}
    </section>
  </div>;
}

/**
 * A round of options. Two columns of rectangles, not a cloud of pills: the learner reads
 * down one column, and a full-width hit area holds a concept name that does not fit on a
 * chip. Pressing a chosen option again takes the choice back.
 */
function ChoiceGrid({ conceptIds, chosenIds, label, onPick }: {
  readonly conceptIds: readonly string[];
  readonly chosenIds: readonly string[];
  readonly label: (conceptId: string) => string;
  readonly onPick: (conceptId: string) => void;
}) {
  return <div className="learning-choice-grid">
    {conceptIds.map((conceptId) => {
      const chosen = chosenIds.includes(conceptId);
      return <button key={conceptId} type="button" aria-pressed={chosen}
        className={chosen ? 'is-chosen' : ''} onClick={() => onPick(conceptId)}>
        <span>{label(conceptId)}</span>
        {chosen && <Check size={14} aria-hidden="true" />}
      </button>;
    })}
  </div>;
}

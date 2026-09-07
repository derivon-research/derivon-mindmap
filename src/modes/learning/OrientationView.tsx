import { AlertTriangle, Check, MessageSquarePlus, Search, Send, Target, X } from 'lucide-react';
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
import { ObjectDocument } from './ObjectDocument';
import { currentQuestion, type OrientationIntent, type OrientationPlan, type OrientationRun } from './orientation';
import { OrientationQuestionBlock } from './OrientationQuestion';
import { graphProbeCandidates, routeProbeCandidates } from './probe';
import { RouteSummary } from './RouteSummary';
import { sameTagNeighbours, terminalConcepts } from './suggestions';

/**
 * One exchange in the orientation thread. The thread is throwaway — it is a record of how
 * this conversation went, not where the answers live. Targets, known concepts and the
 * probe bookkeeping are application state and survive "+ 新对话" untouched.
 */
type Turn =
  | { readonly kind: 'agent' | 'learner'; readonly text: string }
  | { readonly kind: 'card'; readonly conceptId: string }
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

  const markKnown = (conceptId: string) => onIntent({ kind: 'know', conceptIds: [conceptId] });

  const openCard = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    say({ kind: 'card', conceptId });
    void emitInteractionCompleteTestHook({
      interaction: 'select-concept', startedAtMs, context: { conceptId },
    });
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
      { kind: 'card', conceptId: hit.id });
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
    if (event.object?.kind === 'concept') openCard(event.object.id);
  };

  const renderTurn = (turn: Turn, index: number) => {
    switch (turn.kind) {
      case 'agent':
      case 'learner':
        return <p key={index} className={`learning-bubble is-${turn.kind}`}>{turn.text}</p>;
      case 'card': {
        const concept = graph.points.find((point) => point.id === turn.conceptId);
        return <article key={index} className="learning-card" aria-label={`${label(turn.conceptId)} 文档`}>
          <div className="learning-card-doc">
            <ObjectDocument title={label(turn.conceptId)} content={content} object={concept} active={active}
              readAsset={readAsset} readDocuments={readDocuments} />
          </div>
          <footer className="learning-card-actions">
            <button type="button" onClick={() => addTargets([turn.conceptId])}
              disabled={run.targets.includes(turn.conceptId)}>
              <Target size={15} aria-hidden="true" />{run.targets.includes(turn.conceptId) ? '已经是目标' : '加进目标'}
            </button>
            <button type="button" onClick={() => markKnown(turn.conceptId)}
              disabled={run.known.includes(turn.conceptId)}>
              <Check size={15} aria-hidden="true" />{run.known.includes(turn.conceptId) ? '已标记会了' : '这个我会'}
            </button>
          </footer>
        </article>;
      }
      case 'targets':
        return <div key={index} className="learning-choice-block">
          <span className="learning-choice-note">{turn.note}</span>
          <div className="learning-choice-grid">
            {turn.conceptIds.map((conceptId) => <button key={conceptId} type="button"
              aria-pressed={run.targets.includes(conceptId)}
              className={run.targets.includes(conceptId) ? 'is-chosen' : ''}
              onClick={() => addTargets([conceptId])}>{label(conceptId)}</button>)}
          </div>
        </div>;
      case 'probe':
        return <div key={index} className="learning-choice-block">
          <span className="learning-choice-note">第 {turn.round} 轮 · 会的点一下</span>
          <div className="learning-choice-grid">
            {turn.conceptIds.map((conceptId) => <button key={conceptId} type="button"
              aria-pressed={run.known.includes(conceptId)}
              className={run.known.includes(conceptId) ? 'is-chosen' : ''}
              onClick={() => markKnown(conceptId)}>{label(conceptId)}</button>)}
          </div>
          {index === turns.length - 1 && <div className="learning-choice-actions">
            <button type="button" onClick={() => askAgain(turn.round)}>再问我一轮，路线会更准</button>
            <button type="button" className="learning-primary" onClick={onEnterPreview}>够了，先看看路线</button>
          </div>}
        </div>;
    }
  };

  const starters = useMemo(() => terminalConcepts(graph), [graph]);

  return <div className="learning-orientation" data-orientation-round={run.round}>
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
              <div className="learning-choice-grid">
                {starters.map((conceptId) => <button key={conceptId} type="button"
                  onClick={() => addTargets([conceptId])}>{label(conceptId)}</button>)}
              </div>
            </div>}
            <p className="learning-confirm-known">已经会的：{run.known.length} 个概念{
              run.round ? ` · 问过 ${run.round} 轮` : ''}</p>
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
          {suggestions.map((point) => <button key={point.id} type="button" onClick={() => { setDraft(''); openCard(point.id); }}>
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
        <span>共 {graph.points.length} 个概念 · 点一个看它的文档</span>
      </div>
    </section>
  </div>;
}

import { AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
import type { RouteSolver } from '../../ports/RouteSolver';
import type { TagDeclaration, WorkspaceGraph } from '../../workspace/index';
import { ConceptPicker, labelOf } from '../ConceptPicker';
import { useRoutePreview } from '../routePreview';
import { currentQuestion, type OrientationIntent, type OrientationPlan, type OrientationRun } from './orientation';
import { OrientationQuestionBlock } from './OrientationQuestion';
import { RouteSummary } from './RouteSummary';

export type OrientationPanelProps = {
  readonly graph: WorkspaceGraph;
  readonly tags: readonly TagDeclaration[];
  readonly plan: OrientationPlan;
  readonly run: OrientationRun;
  readonly routeSolver?: RouteSolver;
  readonly onIntent: (intent: OrientationIntent) => void;
  readonly onEnter: () => void;
};

/**
 * The compact orientation screen: the author's questions as buttons, driving the same
 * transitions every other surface drives. The authoring side previews a configuration
 * through it; the learner's own entry is `OrientationView`.
 */
export function OrientationPanel({ graph, tags, plan, run, routeSolver, onIntent, onEnter }: OrientationPanelProps) {
  const question = currentQuestion(plan, run);

  return <section className="orientation" aria-label="开局">
    {plan.fallbackReason === 'invalid' && <p className="orientation-warning" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      这个工作区的开局配置无法使用（{plan.message}），已回到通用入口。
    </p>}
    {question ? <OrientationQuestionBlock key={question.id} question={question}
      onAnswer={(optionIds) => onIntent({ kind: 'answer', optionIds })}
      onSkip={() => onIntent({ kind: 'skip' })} />
      : <OrientationSummary graph={graph} tags={tags} plan={plan} run={run} routeSolver={routeSolver}
        onIntent={onIntent} onEnter={onEnter} />}
  </section>;
}

function OrientationSummary({ graph, tags, plan, run, routeSolver, onIntent, onEnter }: OrientationPanelProps) {
  const route = useRoutePreview(routeSolver, graph, run.targets, run.known);
  const generic = plan.kind === 'generic';
  return <div className="orientation-summary">
    <h2>{generic ? '想学什么？' : '这是你的起点'}</h2>
    {generic
      ? <>
        <ConceptPicker label="目标概念" graph={graph} tags={tags} selected={run.targets}
          emptyNote="还没有选择目标概念" onChange={(ids) => onIntent({ kind: 'set-targets', conceptIds: ids })} />
        <ConceptPicker label="已经会的概念" graph={graph} tags={tags} selected={run.known}
          emptyNote="还没有标记已经会的概念" onChange={(ids) => onIntent({ kind: 'set-known', conceptIds: ids })} />
      </>
      : <dl className="orientation-result">
        <dt>目标</dt>
        <dd>{run.targets.length ? run.targets.map((id) => labelOf(graph, id)).join('、') : '尚未确定'}</dd>
        <dt>已知</dt>
        <dd>{run.known.length ? run.known.map((id) => labelOf(graph, id)).join('、') : '从零开始'}</dd>
      </dl>}
    <RouteSummary route={route} graph={graph} />
    <footer className="orientation-actions">
      {!generic && <button type="button" onClick={() => onIntent({ kind: 'restart' })}>
        <RotateCcw size={15} aria-hidden="true" />重新开始
      </button>}
      <button type="button" className="orientation-primary" disabled={!run.targets.length} onClick={onEnter}>
        <ArrowRight size={15} aria-hidden="true" />进入路线
      </button>
    </footer>
  </div>;
}

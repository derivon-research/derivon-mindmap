import { AlertTriangle, ArrowRight, RotateCcw, SkipForward } from 'lucide-react';
import { useState } from 'react';
import type { RouteSolver } from '../../ports/RouteSolver';
import type { TagDeclaration, WorkspaceGraph } from '../../workspace/index';
import { ConceptPicker, labelOf } from '../ConceptPicker';
import { useRoutePreview } from '../routePreview';
import { currentQuestion, type OrientationIntent, type OrientationPlan, type OrientationRun } from './orientation';

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
 * The deterministic orientation screen: the author's questions as buttons, driving the
 * same transitions a conversation adapter drives.
 */
export function OrientationPanel({ graph, tags, plan, run, routeSolver, onIntent, onEnter }: OrientationPanelProps) {
  const question = currentQuestion(plan, run);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState('');

  const answer = (optionIds: readonly string[]) => {
    setFailure('');
    try {
      onIntent({ kind: 'answer', optionIds });
      setChosen([]);
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="orientation" aria-label="开局">
    {plan.fallbackReason === 'invalid' && <p className="orientation-warning" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      这个工作区的开局配置无法使用（{plan.message}），已回到通用入口。
    </p>}
    {question ? <div className="orientation-question">
      <h2>{question.prompt || '请选择'}</h2>
      <ul className="orientation-options">
        {question.options.map((option) => <li key={option.id}>
          <button type="button" aria-pressed={chosen.includes(option.id)}
            onClick={() => (question.select === 'one'
              ? answer([option.id])
              : setChosen(chosen.includes(option.id) ? chosen.filter((id) => id !== option.id) : [...chosen, option.id]))}>
            {option.label || option.id}
          </button>
        </li>)}
      </ul>
      {failure && <p className="orientation-warning" role="alert">{failure}</p>}
      <footer className="orientation-actions">
        <button type="button" onClick={() => { setChosen([]); onIntent({ kind: 'skip' }); }}>
          <SkipForward size={15} aria-hidden="true" />跳过
        </button>
        {question.select === 'many' && <button type="button" className="orientation-primary" onClick={() => answer(chosen)}>
          <ArrowRight size={15} aria-hidden="true" />继续
        </button>}
      </footer>
    </div> : <OrientationSummary graph={graph} tags={tags} plan={plan} run={run} routeSolver={routeSolver}
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

export function RouteSummary({ route, graph }: { route: ReturnType<typeof useRoutePreview>; graph: WorkspaceGraph }) {
  switch (route.status) {
    case 'unavailable':
      return <p className="orientation-route" role="status">这个宿主还不能求解路线，目标与已知已经确认。</p>;
    case 'empty':
      return <p className="orientation-route" role="status">选择至少一个目标后可以看到初始路线。</p>;
    case 'solving':
      return <p className="orientation-route" role="status" aria-busy="true">正在求解路线…</p>;
    case 'error':
      return <p className="orientation-warning" role="alert">路线求解失败：{route.message}</p>;
    case 'ready':
      return route.solution.reachable
        ? <p className="orientation-route" role="status">
          初始路线 {route.solution.derivationIds.length} 步，覆盖 {route.solution.conceptIds.length} 个概念
          {route.solution.cost === null ? '' : `，成本 ${route.solution.cost}`}
          {route.solution.provenOptimal ? '' : '（预算内的上界，未证明最优）'}。
        </p>
        : <p className="orientation-warning" role="alert">
          目前无法从已知走到全部目标
          {route.solution.blocked.length
            ? `：${route.solution.blocked.map((block) => `${labelOf(graph, block.targetConceptId)} 缺少 ${block.blockingConceptIds.map((id) => labelOf(graph, id)).join('、') || '前提'}`).join('；')}`
            : ''}。
        </p>;
  }
}

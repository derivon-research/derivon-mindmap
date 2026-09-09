import { useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import { GraphBrowse } from './GraphBrowse';
import './learning.css';
import { applyOrientationIntent, beginOrientation, planOrientation, type OrientationIntent, type OrientationRun } from './orientation';
import { OrientationView } from './OrientationView';
import { DEFAULT_PANELS, type PanelLayout } from './panels';
import { RouteLearning } from './RouteLearning';
import { RoutePreviewView } from './RoutePreviewView';
import { useRoutePreview } from '../routePreview';
import type { TaskCompletion } from './progress';
import {
  clearRouteInvalidation, holdRoute, initialLearningWalkState, invalidateRoute, leaveRoute,
  missingTargetIds, moveLearningCursor, recordTaskCompletion, restartRoute, revealDefinition,
  routeSignature,
} from './state';

/**
 * The learning side. One mode, four views: orientation, the route preview, walking the
 * route, and free browsing. Which one shows is the application's business — the top bar
 * switches between them — so this component dispatches rather than deciding.
 *
 * Everything a view would lose by being unmounted lives here: the orientation flow, how
 * far along the route the learner is, and the panel layout. Going back to look at the
 * route and returning is meant to cost nothing.
 */
export function LearningMode({
  active = true, content, targetIds, knownIds, onChangeTargets, onChangeKnown,
  routeSolver, view, onEnterView, onConfirmRoute, onRouteInvalidated, readAsset, readDocuments,
  conversation,
}: LearningModeProps) {
  const plan = useMemo(() => planOrientation(content), [content]);
  const [flow, setFlow] = useState(() => beginOrientation(plan));
  const run: OrientationRun = useMemo(
    () => ({ ...flow, targets: [...targetIds], known: [...knownIds] }),
    [flow, knownIds, targetIds],
  );
  const seeded = useRef(false);
  useEffect(() => {
    seeded.current = true;
    if (!targetIds.length && flow.targets.length) onChangeTargets(flow.targets);
    if (!knownIds.length && flow.known.length) onChangeKnown(flow.known);
  }, [flow.known, flow.targets, knownIds.length, targetIds.length, onChangeKnown, onChangeTargets]);

  const intent = (value: OrientationIntent) => {
    const next = applyOrientationIntent(plan, run, value);
    setFlow(next);
    onChangeTargets(next.targets);
    onChangeKnown(next.known);
  };

  const graph = useMemo(() => content.graph, [content.graphText]);
  const preview = useRoutePreview(routeSolver, graph, targetIds, knownIds);
  const [panels, setPanels] = useState<PanelLayout>(DEFAULT_PANELS);
  const [walk, setWalk] = useState(initialLearningWalkState);
  const { acceptedRoute, cursor, revealed, taskCompletions, routeInvalidReason } = walk;
  const solved = preview.status === 'ready' && preview.solution.reachable ? preview.solution : null;

  useEffect(() => {
    if (view !== 'route') setWalk(leaveRoute);
    else if (solved) setWalk((current) => holdRoute(current, content.graph, solved, content.graphText));
  }, [content.graph, content.graphText, solved, view]);

  const solution = view === 'route' ? acceptedRoute?.solution ?? solved : solved;
  const missingTargets = useMemo(
    () => missingTargetIds(content.graph, targetIds),
    [content.graph, targetIds],
  );

  useEffect(() => {
    if (!acceptedRoute || view !== 'route') return;
    if (missingTargets.length > 0) {
      if (routeInvalidReason !== 'target') onRouteInvalidated();
      setWalk((current) => invalidateRoute(current, 'target'));
      return;
    }
    if (acceptedRoute.graphText === content.graphText) {
      setWalk(clearRouteInvalidation);
      return;
    }
    if (preview.status === 'solving') return;
    if (preview.status !== 'ready'
      || !preview.solution.reachable
      || routeSignature(content.graph, preview.solution) !== acceptedRoute.signature) {
      if (routeInvalidReason !== 'changed') onRouteInvalidated();
      setWalk((current) => invalidateRoute(current, 'changed'));
    } else {
      setWalk(clearRouteInvalidation);
    }
  }, [acceptedRoute, content.graph, content.graphText, missingTargets, preview, routeInvalidReason, onRouteInvalidated, view]);

  const moveCursor = (index: number) => {
    setWalk((current) => moveLearningCursor(current, index));
  };

  const completeTask = (completion: TaskCompletion) => {
    setWalk((current) => recordTaskCompletion(current, completion));
  };

  const confirmRoute = () => {
    setWalk(restartRoute);
    onConfirmRoute();
  };

  const know = (conceptId: string) => intent({ kind: 'know', conceptIds: [conceptId] });
  const toggleKnown = (conceptId: string) => intent(knownIds.includes(conceptId)
    ? { kind: 'set-known', conceptIds: knownIds.filter((id) => id !== conceptId) }
    : { kind: 'know', conceptIds: [conceptId] });
  const toggleTarget = (conceptId: string) => intent(targetIds.includes(conceptId)
    ? { kind: 'set-targets', conceptIds: targetIds.filter((id) => id !== conceptId) }
    : { kind: 'add-targets', conceptIds: [conceptId] });

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-view={view}
    data-learning-targets={targetIds.join(' ')} data-learning-known={knownIds.join(' ')} aria-label="学习侧">
    {view === 'orientation' && <OrientationView active={active} content={content} plan={plan} run={run}
      preview={preview} onIntent={intent} onEnterPreview={() => onEnterView('preview')}
      readAsset={readAsset} readDocuments={readDocuments} />}

    {view === 'preview' && <RoutePreviewView active={active} graph={content.graph} tags={content.tags}
      preview={preview} targetIds={targetIds} knownIds={knownIds} onConfirm={confirmRoute}
      onBackToOrientation={() => onEnterView('orientation')} onBrowse={() => onEnterView('browse')} />}

    {view === 'route' && routeInvalidReason === 'target' && <div className="learning-route-empty" role="alert">
      <p>目标 {missingTargets.join('、')} 已被删除，不会自动替换。</p>
      <button type="button" className="learning-primary" onClick={() => onEnterView('orientation')}>重新选择目标</button>
    </div>}

    {view === 'route' && routeInvalidReason === 'changed' && <div className="learning-route-empty" role="alert">
      <p>这条路线的内容变了，需要重新预览后再继续。</p>
      <button type="button" className="learning-primary" onClick={() => onEnterView('preview')}>重新预览</button>
    </div>}

    {view === 'route' && !routeInvalidReason && (solution
      ? <RouteLearning active={active} content={content} solution={solution} targetIds={targetIds}
        knownIds={knownIds} cursor={cursor} onCursor={moveCursor}
        revealed={revealed} onReveal={(id) => setWalk((current) => revealDefinition(current, id))}
        tasksDone={taskCompletions} onTaskDone={completeTask}
        panels={panels} onPanels={setPanels} onKnow={know}
        onBackToPreview={() => onEnterView('preview')} readAsset={readAsset} readDocuments={readDocuments}
        conversation={conversation} />
      : <div className="learning-route-empty" role="status">
        <p>路线不见了 —— 目标或者已知变过，得重新算一次。</p>
        <button type="button" className="learning-primary" onClick={() => onEnterView('preview')}>回去看路线</button>
      </div>)}

    {view === 'browse' && <GraphBrowse active={active} content={content} targetIds={targetIds} knownIds={knownIds}
      onToggleTarget={toggleTarget} onToggleKnown={toggleKnown}
      onBackToOrientation={() => onEnterView('orientation')}
      readAsset={readAsset} readDocuments={readDocuments} />}

    {content.diagnostics.length > 0 && <details className="learning-diagnostics">
      <summary>{content.diagnostics.length} 个本地内容问题</summary>
      {content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}>
        <code>{item.path}</code> {item.message}
      </p>)}
    </details>}
  </section>;
}

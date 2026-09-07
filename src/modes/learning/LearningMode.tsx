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
  routeSolver, view, onEnterView, onConfirmRoute, readAsset, readDocuments,
}: LearningModeProps) {
  const plan = useMemo(() => planOrientation(content), [content]);
  // Only the question bookkeeping is local. Targets and known concepts are application
  // state, so a target carried in from the authoring side is the one that counts.
  const [flow, setFlow] = useState(() => beginOrientation(plan));
  const run: OrientationRun = useMemo(
    () => ({ ...flow, targets: [...targetIds], known: [...knownIds] }),
    [flow, knownIds, targetIds],
  );
  const seeded = useRef(false);
  useEffect(() => {
    // The author's seed applies only to a run the application has nothing of its own for.
    if (seeded.current) return;
    seeded.current = true;
    if (!targetIds.length && flow.targets.length) onChangeTargets(flow.targets);
    if (!knownIds.length && flow.known.length) onChangeKnown(flow.known);
  }, [flow.known, flow.targets, knownIds.length, targetIds.length]);

  const intent = (value: OrientationIntent) => {
    const next = applyOrientationIntent(plan, run, value);
    setFlow(next);
    onChangeTargets(next.targets);
    onChangeKnown(next.known);
  };

  const preview = useRoutePreview(routeSolver, content.graph, targetIds, knownIds);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState<readonly string[]>([]);
  const [tasksDone, setTasksDone] = useState<readonly string[]>([]);
  const [panels, setPanels] = useState<PanelLayout>(DEFAULT_PANELS);
  const solution = preview.status === 'ready' && preview.solution.reachable ? preview.solution : null;
  // A different route is a different walk: keeping a cursor across it would point at a step
  // that is no longer there.
  const routeKey = solution ? solution.order.join(' ') : '';
  useEffect(() => { setCursor(0); }, [routeKey]);

  const know = (conceptId: string) => intent({ kind: 'know', conceptIds: [conceptId] });

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-view={view}
    data-learning-targets={targetIds.join(' ')} data-learning-known={knownIds.join(' ')} aria-label="学习侧">
    {view === 'orientation' && <OrientationView active={active} content={content} plan={plan} run={run}
      preview={preview} onIntent={intent} onEnterPreview={() => onEnterView('preview')}
      readAsset={readAsset} readDocuments={readDocuments} />}

    {view === 'preview' && <RoutePreviewView active={active} graph={content.graph} tags={content.tags}
      preview={preview} targetIds={targetIds} knownIds={knownIds} onConfirm={onConfirmRoute}
      onBackToOrientation={() => onEnterView('orientation')} onBrowse={() => onEnterView('browse')} />}

    {view === 'route' && (solution
      ? <RouteLearning active={active} content={content} solution={solution} targetIds={targetIds}
        knownIds={knownIds} cursor={cursor} onCursor={setCursor}
        revealed={revealed} onReveal={(id) => setRevealed((current) => [...new Set([...current, id])])}
        tasksDone={tasksDone} onTaskDone={(id) => setTasksDone((current) => [...new Set([...current, id])])}
        panels={panels} onPanels={setPanels} onKnow={know}
        onBackToPreview={() => onEnterView('preview')} readAsset={readAsset} readDocuments={readDocuments} />
      : <div className="learning-route-empty" role="status">
        <p>路线不见了 —— 目标或者已知变过，得重新算一次。</p>
        <button type="button" className="learning-primary" onClick={() => onEnterView('preview')}>回去看路线</button>
      </div>)}

    {view === 'browse' && <GraphBrowse active={active} content={content} targetIds={targetIds} knownIds={knownIds}
      onAddTarget={(conceptId) => intent({ kind: 'add-targets', conceptIds: [conceptId] })}
      onKnow={know} onBackToOrientation={() => onEnterView('orientation')}
      readAsset={readAsset} readDocuments={readDocuments} />}

    {content.diagnostics.length > 0 && <details className="learning-diagnostics">
      <summary>{content.diagnostics.length} 个本地内容问题</summary>
      {content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}>
        <code>{item.path}</code> {item.message}
      </p>)}
    </details>}
  </section>;
}

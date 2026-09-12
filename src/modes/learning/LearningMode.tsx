import { useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import { addRoute, readRoutes, removeRoute, routeIsStale, routeRecord, type RouteList } from '../../learner-records';
import { generateObjectId } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { GraphBrowse } from './GraphBrowse';
import './learning.css';
import { applyOrientationIntent, beginOrientation, planOrientation, type OrientationIntent, type OrientationRun } from './orientation';
import { OrientationView } from './OrientationView';
import { DEFAULT_PANELS, type PanelLayout } from './panels';
import { RouteLearning } from './RouteLearning';
import { RoutePreviewView } from './RoutePreviewView';
import { RouteShelf } from './RouteShelf';
import { routeSolutionOf, useRoutePreview } from '../routePreview';
import type { TaskCompletion } from './progress';
import { initialLearningWalkState, moveLearningCursor, recordTaskCompletion, revealDefinition, startRoute } from './state';

const NO_ROUTES: RouteList = { routes: [], issue: null };
const NOTHING_STALE: ReadonlySet<string> = new Set();

/**
 * The learning side. One mode, five screens: orientation, the route preview, the confirmed
 * routes, walking one of them, and free browsing. Which one shows is the application's
 * business — the top bar switches between them — so this component dispatches rather than
 * deciding.
 *
 * The route stage is two screens rather than one: with no active route it lists the learner's
 * confirmed routes and lets them choose, and with one it walks it. Which route that is lives
 * in the application, because a confirmed route is a record and this component does not own
 * the store it lives in.
 *
 * Everything a screen would lose by being unmounted lives here: the orientation flow, how far
 * along the route the learner is, and the panel layout.
 */
export function LearningMode({
  active = true, content, learnerRecords, targetIds, knownIds, onChangeTargets, onChangeKnown,
  routeSolver, view, onEnterView, onConfirmRoute, activeRouteId, onSelectRoute, readAsset, readDocuments,
  conversation, drainPendingChanges,
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

  const [listed, setListed] = useState<RouteList>(NO_ROUTES);
  const [stale, setStale] = useState<ReadonlySet<string>>(NOTHING_STALE);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // A host with no application data directory has no records at all: confirming then leaves a
  // route that lives only in this session, and the screen says so rather than pretending.
  useEffect(() => {
    if (!learnerRecords) { setListed(NO_ROUTES); return; }
    let cancelled = false;
    void readRoutes(learnerRecords).then((value) => { if (!cancelled) setListed(value); });
    return () => { cancelled = true; };
  }, [learnerRecords]);

  // Staleness is derived on read, never written: a route whose basis no longer matches the
  // graph is reported and kept, not re-solved and not deleted.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(listed.routes.map(async (record) => ({
      id: record.id,
      stale: await routeIsStale(graph, record),
    }))).then((entries) => {
      if (!cancelled) setStale(new Set(entries.filter((entry) => entry.stale).map((entry) => entry.id)));
    });
    return () => { cancelled = true; };
  }, [graph, listed]);

  const solved = preview.status === 'ready' && preview.solution.reachable ? preview.solution : null;
  const activeRecord = listed.routes.find((route) => route.id === activeRouteId) ?? null;

  // Bringing another route on screen starts it from the top; judgements already handed in stay
  // keyed by the route they were made on.
  useEffect(() => { setWalk(startRoute); }, [activeRouteId]);

  const writeRoutes = async (change: (records: readonly typeof listed.routes[number][]) => Promise<RouteList>) => {
    setWriteError(null);
    try {
      setListed(await change(listed.routes));
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    }
  };

  const confirmRoute = async () => {
    if (!solved) return;
    setWriting(true);
    setWriteError(null);
    try {
      const record = await routeRecord({
        id: generateObjectId('r', listed.routes.map((route) => route.id)),
        description: `走到 ${targetIds.map((id) => labelOf(graph, id)).join('、')}`,
        graph,
        solution: solved,
        targets: targetIds,
        known: knownIds,
      });
      setListed(learnerRecords
        ? await addRoute(learnerRecords, record)
        : { ...listed, routes: [...listed.routes, record] });
      setWalk(startRoute);
      onConfirmRoute(record.id);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setWriting(false);
    }
  };

  const deleteRoute = (routeId: string) => {
    void writeRoutes(async () => {
      const next = learnerRecords
        ? await removeRoute(learnerRecords, routeId)
        : { ...listed, routes: listed.routes.filter((route) => route.id !== routeId) };
      if (activeRouteId === routeId) onSelectRoute(null);
      return next;
    });
  };

  const openRoute = (routeId: string) => {
    setPickerOpen(false);
    onSelectRoute(routeId);
  };

  const moveCursor = (index: number) => {
    setWalk((current) => moveLearningCursor(current, index));
  };

  const completeTask = (completion: TaskCompletion) => {
    setWalk((current) => recordTaskCompletion(current, completion));
  };

  const know = (conceptId: string) => intent({ kind: 'know', conceptIds: [conceptId] });
  const toggleKnown = (conceptId: string) => intent(knownIds.includes(conceptId)
    ? { kind: 'set-known', conceptIds: knownIds.filter((id) => id !== conceptId) }
    : { kind: 'know', conceptIds: [conceptId] });
  const toggleTarget = (conceptId: string) => intent(targetIds.includes(conceptId)
    ? { kind: 'set-targets', conceptIds: targetIds.filter((id) => id !== conceptId) }
    : { kind: 'add-targets', conceptIds: [conceptId] });

  const shelfRoutes = listed.routes.map((record) => ({ record, stale: stale.has(record.id) }));
  const picker = view === 'route' && (pickerOpen || !activeRecord);

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-view={view}
    data-learning-targets={targetIds.join(' ')} data-learning-known={knownIds.join(' ')}
    data-learning-active-route={activeRouteId ?? ''} aria-label="学习侧">
    {view === 'orientation' && <OrientationView active={active} content={content} plan={plan} run={run}
      preview={preview} onIntent={intent} onEnterPreview={() => onEnterView('preview')}
      readAsset={readAsset} readDocuments={readDocuments} />}

    {view === 'preview' && <RoutePreviewView active={active} graph={content.graph} tags={content.tags}
      preview={preview} targetIds={targetIds} knownIds={knownIds} confirming={writing} confirmError={writeError}
      onConfirm={() => { void confirmRoute(); }}
      onBackToOrientation={() => onEnterView('orientation')} onBrowse={() => onEnterView('browse')} />}

    {picker && <RouteShelf active={active} graph={graph} routes={shelfRoutes} issue={listed.issue}
      howFarItGoes={learnerRecords ? 'stored' : 'session'}
      onStart={openRoute} onDelete={deleteRoute} onNewRoute={() => onEnterView('orientation')} />}

    {!picker && activeRecord && <RouteLearning active={active} content={content}
      solution={routeSolutionOf(activeRecord)} targetIds={[...activeRecord.targets]} knownIds={[...activeRecord.known]}
      stale={stale.has(activeRecord.id)} cursor={walk.cursor} onCursor={moveCursor}
      revealed={walk.revealed} onReveal={(id) => setWalk((current) => revealDefinition(current, id))}
      tasksDone={walk.taskCompletions} onTaskDone={completeTask}
      panels={panels} onPanels={setPanels} onKnow={know}
      onSwitchRoute={() => setPickerOpen(true)} readAsset={readAsset} readDocuments={readDocuments}
      conversation={conversation} drainPendingChanges={drainPendingChanges} />}

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

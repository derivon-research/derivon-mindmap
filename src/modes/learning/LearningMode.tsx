import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import {
  addRoute, conceptSources, EMPTY_MASTERY, readMastery, readRoutes, removeRoute, routeIsStale,
  routeRecord, writeMastery,
  type MasteryReading, type MasterySource, type MasteryWrite, type RouteList,
} from '../../learner-records';
import { generateObjectId } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { GraphBrowse } from './GraphBrowse';
import './learning.css';
import { objectMasteryBasis } from './objectBasis';
import {
  applyOrientationIntent, beginOrientation, orientationSeedKnown, planOrientation,
  type OrientationIntent, type OrientationRun,
} from './orientation';
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
 * Targets stay application state, because they are one solve's input. **Known does not**: it
 * is the set of concepts with a `complete` record, read from and written back to the learner
 * records here, so reopening a workspace finds it again
 * ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
 *
 * Everything a screen would lose by being unmounted lives here: the orientation flow, how far
 * along the route the learner is, and the panel layout.
 */
export function LearningMode({
  active = true, content, learnerRecords, targetIds, onChangeTargets,
  routeSolver, view, onEnterView, onConfirmRoute, activeRouteId, onSelectRoute, readAsset, readDocuments,
  readOwnedFiles, conversation, drainPendingChanges,
}: LearningModeProps) {
  const plan = useMemo(() => planOrientation(content), [content]);
  const [flow, setFlow] = useState(() => beginOrientation(plan));
  const run: OrientationRun = useMemo(() => ({ ...flow, targets: [...targetIds] }), [flow, targetIds]);

  // The learner records are the source of the known set. `null` means "not read yet", which
  // is deliberately not the same as "missing file": the orientation seed waits for the read.
  const [mastery, setMastery] = useState<MasteryReading | null>(null);
  /** The write landing right now, so the screen answers — with its sources — before the file does. */
  const [pending, setPending] = useState<MasteryWrite | null>(null);
  const [knownError, setKnownError] = useState<string | null>(null);
  const knownSources = useMemo(() => {
    const sources = new Map<string, MasterySource>(conceptSources(mastery?.state ?? EMPTY_MASTERY));
    if (!pending) return sources;
    for (const conceptId of pending.withdrawn) sources.delete(conceptId);
    for (const claim of pending.claimed) sources.set(claim.conceptId, claim.source);
    return sources;
  }, [mastery, pending]);
  const knownIds = useMemo(() => [...knownSources.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    [knownSources]);
  const graphConceptIds = useMemo(() => new Set(content.graph.points.map((point) => point.id)), [content.graph]);
  // A solve is given concepts the graph has. An orphaned record — the object was deleted — is
  // retained and reported, but it is not a start point, and the solver would refuse it.
  const liveKnownIds = useMemo(() => knownIds.filter((conceptId) => graphConceptIds.has(conceptId)),
    [graphConceptIds, knownIds]);
  const orphanIds = useMemo(() => knownIds.filter((conceptId) => !graphConceptIds.has(conceptId)),
    [graphConceptIds, knownIds]);

  useEffect(() => {
    if (!learnerRecords) { setMastery(null); return; }
    let cancelled = false;
    void readMastery(learnerRecords).then((value) => { if (!cancelled) setMastery(value); });
    return () => { cancelled = true; };
  }, [learnerRecords]);

  const seeded = useRef(false);
  useEffect(() => {
    seeded.current = true;
    if (!targetIds.length && flow.targets.length) onChangeTargets(flow.targets);
  }, [flow.targets, targetIds.length, onChangeTargets]);

  /**
   * The basis a self-report is written against: the object's manifest entry plus every file
   * under its document directory. Without a store or a file inventory there is nowhere to
   * write and nothing to write against, so the claim is refused rather than faked.
   */
  const basisFor = useCallback(async (conceptId: string): Promise<string> => {
    const concept = content.graph.points.find((point) => point.id === conceptId);
    if (!concept) throw new Error(`图里没有「${conceptId}」，不能把它写成已知`);
    if (!readOwnedFiles || !readDocuments || !readAsset) {
      throw new Error('这个宿主列不出对象所属的文件，自述所依据的内容版本算不出来');
    }
    return objectMasteryBasis(content.graph, concept.data.document, conceptId, {
      listOwnedFiles: readOwnedFiles, readDocuments, readAsset,
    });
  }, [content.graph, readAsset, readDocuments, readOwnedFiles]);

  /**
   * Persist the known set a step asks for. Only the difference is written: new concepts become
   * claims, and concepts dropped from the set lose the learner's own claim — a judgement the
   * application made is never withdrawn by a learner turning a chip off.
   */
  const persistKnown = useCallback(async (
    next: readonly string[], source: 'selfReported' | 'orientationSeed',
  ) => {
    const nextSet = new Set(next);
    // A concept the learner claims upgrades the workspace's default to their own claim; a
    // default never downgrades a claim, and nothing overwrites a judgement.
    const claims = next.filter((conceptId) => {
      const current = knownSources.get(conceptId);
      return current === undefined || (current === 'orientationSeed' && source === 'selfReported');
    });
    const withdrawn = [...knownSources]
      .filter(([conceptId, current]) => !nextSet.has(conceptId) && current !== 'judged'
        && graphConceptIds.has(conceptId))
      .map(([conceptId]) => conceptId);
    if (!claims.length && !withdrawn.length) return;
    setKnownError(null);
    if (!learnerRecords) {
      setKnownError('这个宿主没有应用数据目录，自述无处可存，所以没有记下来。');
      return;
    }
    // The screen answers before the write lands, sources included; a refusal takes it back off.
    setPending({ claimed: claims.map((conceptId) => ({ conceptId, basis: '', source })), withdrawn });
    try {
      const basis = await Promise.all(claims.map(async (conceptId) => ({ conceptId, basis: await basisFor(conceptId), source })));
      setMastery(await writeMastery(learnerRecords, { claimed: basis, withdrawn }));
    } catch (error) {
      setKnownError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  }, [basisFor, graphConceptIds, knownSources, learnerRecords]);

  /**
   * The configuration's default known is a starting baseline, not an assessment: it is
   * written once, when this learner has no record file at all. Reopening after the learner
   * took one back must not put it there again.
   */
  const seededKnown = useRef(false);
  useEffect(() => {
    if (seededKnown.current || mastery === null || mastery.presence !== 'missing' || mastery.issue !== null) return;
    seededKnown.current = true;
    const seed = orientationSeedKnown(plan);
    if (seed.length) void persistKnown([...new Set([...liveKnownIds, ...seed])], 'orientationSeed');
  }, [liveKnownIds, mastery, persistKnown, plan]);

  const intent = (value: OrientationIntent) => {
    const step = applyOrientationIntent(plan, run, liveKnownIds, value);
    setFlow(step.run);
    onChangeTargets(step.run.targets);
    // A restart puts the configuration's defaults back as defaults; every other intent is the
    // learner's own action, and their claim is what it writes.
    void persistKnown(step.known, value.kind === 'restart' ? 'orientationSeed' : 'selfReported');
  };

  const graph = useMemo(() => content.graph, [content.graphText]);
  // A host with no record store has no known set to wait for, and neither has one that read
  // and found nothing: only the read in flight is worth waiting for.
  const preview = useRoutePreview(routeSolver, graph, targetIds,
    mastery === null && learnerRecords ? null : liveKnownIds);
  const [panels, setPanels] = useState<PanelLayout>(DEFAULT_PANELS);
  const [walk, setWalk] = useState(initialLearningWalkState);

  const [listed, setListed] = useState<RouteList>(NO_ROUTES);
  const [stale, setStale] = useState<ReadonlySet<string>>(NOTHING_STALE);
  /** The create flow's second step: the route the questions produced. Not a place of its own. */
  const [reviewing, setReviewing] = useState(false);
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

  // Leaving the create flow drops its second step, so coming back starts from the questions.
  useEffect(() => { if (view !== 'orientation') setReviewing(false); }, [view]);

  const writeRoutes = async (change: () => Promise<RouteList>) => {
    setWriteError(null);
    try {
      setListed(await change());
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    }
  };

  const confirmRoute = async () => {
    if (!solved || !learnerRecords) return;
    setWriting(true);
    setWriteError(null);
    try {
      const record = await routeRecord({
        id: generateObjectId('r', listed.routes.map((route) => route.id)),
        // The name is derived, not asked for: a route is not edited, so there is nowhere a
        // learner could change it, and the starting point is what tells two routes apart.
        description: `从 ${liveKnownIds.length ? liveKnownIds.map((id) => labelOf(graph, id)).join('、') : '零'} 走到 ${targetIds.map((id) => labelOf(graph, id)).join('、')}`,
        graph,
        solution: solved,
        targets: targetIds,
        known: liveKnownIds,
      });
      setListed(await addRoute(learnerRecords, record));
      setWalk(startRoute);
      onConfirmRoute(record.id);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setWriting(false);
    }
  };

  const deleteRoute = (routeId: string) => {
    if (!learnerRecords) return;
    void writeRoutes(async () => {
      const next = await removeRoute(learnerRecords, routeId);
      if (activeRouteId === routeId) onSelectRoute(null);
      return next;
    });
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
  // The route stage is two screens, chosen by whether a route is active — never by the view
  // alone, so a route being walked can never stay on screen under another view.
  const picker = view === 'route' && activeRecord === null;
  const walking = view === 'route' && activeRecord !== null;

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-view={view}
    data-learning-targets={targetIds.join(' ')} data-learning-known={liveKnownIds.join(' ')}
    data-learning-self-reported={[...knownSources].filter(([, source]) => source === 'selfReported').map(([id]) => id).join(' ')}
    data-learning-active-route={activeRouteId ?? ''} aria-label="学习侧">
    {mastery?.issue && <p className="learning-record-issue" role="alert">
      掌握记录读不出来：{mastery.issue}。在你修好它之前，已经会的概念都按没有算。
    </p>}
    {orphanIds.length > 0 && <p className="learning-record-issue" role="status">
      有 {orphanIds.length} 条掌握记录指向已经不在图里的概念（{orphanIds.join('、')}）。它们被保留着、不参与求解，也不会被自动删掉。
    </p>}
    {knownError && <p className="learning-record-issue" role="alert">{knownError}</p>}

    {view === 'orientation' && (reviewing
      ? <RoutePreviewView active={active} graph={content.graph} tags={content.tags}
        preview={preview} targetIds={targetIds} knownIds={knownIds} confirming={writing}
        confirmError={writeError === null ? null : `路线没能存下来：${writeError}`}
        confirmBlocked={learnerRecords ? null : '这个宿主没有应用数据目录，确认的路线无处可存，所以先不让确认。'}
        onConfirm={() => { void confirmRoute(); }}
        onBackToOrientation={() => setReviewing(false)} onBrowse={() => onEnterView('browse')} />
      : <OrientationView active={active} content={content} plan={plan} run={run}
        knownIds={liveKnownIds} knownSources={knownSources}
        preview={preview} onIntent={intent} onEnterPreview={() => setReviewing(true)}
        readAsset={readAsset} readDocuments={readDocuments} />)}

    {picker && <RouteShelf active={active} graph={graph} routes={shelfRoutes} issue={listed.issue}
      error={writeError} onStart={onSelectRoute} onDelete={deleteRoute}
      onNewRoute={() => onEnterView('orientation')} />}

    {walking && activeRecord && <RouteLearning active={active} content={content}
      solution={routeSolutionOf(activeRecord)} targetIds={[...activeRecord.targets]} knownIds={[...activeRecord.known]}
      knownSources={knownSources}
      stale={stale.has(activeRecord.id)} cursor={walk.cursor} onCursor={moveCursor}
      revealed={walk.revealed} onReveal={(id) => setWalk((current) => revealDefinition(current, id))}
      tasksDone={walk.taskCompletions} onTaskDone={completeTask}
      panels={panels} onPanels={setPanels} onKnow={know}
      onSwitchRoute={() => onSelectRoute(null)} readAsset={readAsset} readDocuments={readDocuments}
      conversation={conversation} drainPendingChanges={drainPendingChanges} />}

    {view === 'browse' && <GraphBrowse active={active} content={content} targetIds={targetIds} knownIds={liveKnownIds}
      knownSources={knownSources}
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

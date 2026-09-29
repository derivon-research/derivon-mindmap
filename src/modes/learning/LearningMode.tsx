import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import {
  canStartPersonalRoute, conceptSources, confirmedRoute, EMPTY_MASTERY, readMastery, readPersonalRoutes,
  savePersonalRoute, writeJudgements, writeMastery,
  type LearnerRecordStore, type MasteryReading, type MasterySource, type MasteryWrite,
  type PersonalRouteStanding, type StoredPersonalRoute,
} from '../../learner-records';
import { copyAsPersonal, generateObjectId, newRoute, type Route, type RouteReading } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { RouteEditor, sameRoute } from '../RouteEditor';
import { GraphBrowse } from './GraphBrowse';
import './learning.css';
import { objectMasteryBasis, type ObjectBasisReader } from './objectBasis';
import {
  applyOrientationIntent, beginOrientation, orientationSeedKnown, planOrientation,
  type OrientationIntent, type OrientationRun,
} from './orientation';
import { OrientationView } from './OrientationView';
import { DEFAULT_PANELS, type PanelLayout } from './panels';
import { RouteLearning } from './RouteLearning';
import { RoutePreviewView } from './RoutePreviewView';
import { personalEntryKey, RouteShelf } from './RouteShelf';
import { routeProgress, stepBasis, stepStanding, useStepBases, type FreshJudgement, type RouteProgress } from './routeProgress';
import { routeSolutionOfReading, routeSteps, type RouteStep, useRoutePreview } from '../routePreview';
import { initialRouteWalk, revealDefinition } from './state';

/** The personal route files as listed, or why the directory could not be listed. */
type RouteList = {
  readonly routes: readonly StoredPersonalRoute[];
  readonly issue: string | null;
};

const NO_ROUTES: RouteList = { routes: [], issue: null };
const NO_STANDINGS: readonly PersonalRouteStanding[] = [];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every personal route file, or the reason there is no list: never an empty list in its place. */
async function listRoutes(store: LearnerRecordStore): Promise<RouteList> {
  try {
    return { routes: await store.listRoutes(), issue: null };
  } catch (error) {
    return { routes: [], issue: messageOf(error) };
  }
}
const NO_STEPS: readonly RouteStep[] = [];

/** A route that can be walked now, wherever it lives. */
type WalkableRoute = {
  readonly routeId: string;
  readonly route: Route;
  readonly reading: RouteReading;
  readonly stale: boolean;
};

/**
 * The personal route being edited: the draft, and the file it replaces when saved — `null`
 * for a route that has never been saved, a copy or a blank one, which is written as a new file.
 */
type PersonalDraft = {
  readonly route: Route;
  readonly saved: { readonly route: Route; readonly version: string } | null;
};

/**
 * The learning side. One mode, five screens: orientation, the route preview, the confirmed
 * routes, walking one of them, and free browsing. Which one shows is the application's
 * business — the top bar switches between them — so this component dispatches rather than
 * deciding.
 *
 * The route stage is two screens rather than one: with no active route it is the shelf — the
 * routes the workspace ships and the learner's personal routes, where the learner chooses one,
 * copies an author's route to make it their own, or edits their own — and with one it walks it.
 * Which route that is lives in the application, as an id that names one route in either group.
 * Editing a personal route writes the learner records and never the workspace.
 *
 * Targets stay application state, because they are one solve's input. **Known does not**: it
 * is the set of concepts with a `complete` record, read from and written back to the learner
 * records here, so reopening a workspace finds it again
 * ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
 *
 * Everything a screen would lose by being unmounted lives here: the orientation flow, the
 * definitions the learner revealed, and the panel layout. **Not how far along the route they
 * are**: that is derived from the learner records at display time, so there is nothing to
 * keep and nothing to lose ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
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
   * The three read capabilities a mastery basis needs, or none when this host cannot list an
   * object's files. Without them there is nothing to write a judgement against, and nothing to
   * check a stored one against, so the screen says so rather than faking a basis.
   */
  const ownerReader = useMemo<ObjectBasisReader | undefined>(() => (readOwnedFiles && readDocuments && readAsset
    ? { listOwnedFiles: readOwnedFiles, readDocuments, readAsset }
    : undefined), [readAsset, readDocuments, readOwnedFiles]);

  /**
   * The basis a record is written against: the object's manifest entry plus every file under its
   * document directory. Without a store or a file inventory there is nowhere to write and
   * nothing to write against, so the write is refused rather than faked — a self-report says so
   * as a claim, a judgement as a judgement.
   */
  const conceptBasis = useCallback(async (conceptId: string, what: string): Promise<string> => {
    const concept = content.graph.points.find((point) => point.id === conceptId);
    if (!concept) throw new Error(`图里没有「${conceptId}」，${what}无处可写。`);
    if (!ownerReader) throw new Error(`这个宿主列不出对象所属的文件，${what}所依据的内容版本算不出来。`);
    return objectMasteryBasis(content.graph, concept.data.document, conceptId, ownerReader);
  }, [content.graph, ownerReader]);

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
      const basis = await Promise.all(claims.map(async (conceptId) => ({ conceptId, basis: await conceptBasis(conceptId, '自述'), source })));
      setMastery(await writeMastery(learnerRecords, { claimed: basis, withdrawn }));
    } catch (error) {
      setKnownError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  }, [conceptBasis, graphConceptIds, knownSources, learnerRecords]);

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
  const [walk, setWalk] = useState(initialRouteWalk);

  const [listed, setListed] = useState<RouteList>(NO_ROUTES);
  const [standings, setStandings] = useState<readonly PersonalRouteStanding[]>(NO_STANDINGS);
  /** The create flow's second step: the route the questions produced. Not a place of its own. */
  const [reviewing, setReviewing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  /** The shelf entry being looked at. Held here so a save can point it at the file it wrote. */
  const [shelfSelection, setShelfSelection] = useState<string | null>(null);
  /** The personal route in the editor. It survives view switches, like every other draft here. */
  const [draft, setDraft] = useState<PersonalDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** The judgement just written, with its basis, until the route's bases are checked again. */
  const [fresh, setFresh] = useState<FreshJudgement | null>(null);

  // A host with no application data directory has no records at all: confirming then leaves a
  // route that lives only in this session, and the screen says so rather than pretending.
  useEffect(() => {
    if (!learnerRecords) { setListed(NO_ROUTES); return; }
    let cancelled = false;
    void listRoutes(learnerRecords).then((value) => { if (!cancelled) setListed(value); });
    return () => { cancelled = true; };
  }, [learnerRecords]);

  // Every route is read on the current graph: validated like any route, and checked for
  // staleness. Both are derived on read, never written: a route that no longer fits the graph is
  // reported and kept, not re-solved, not repaired and not deleted.
  useEffect(() => {
    let cancelled = false;
    void readPersonalRoutes(graph, listed.routes).then((value) => { if (!cancelled) setStandings(value); });
    return () => { cancelled = true; };
  }, [graph, listed]);

  const solved = preview.status === 'ready' && preview.solution.reachable ? preview.solution : null;
  // Only a route that can be started can be walked: an invalid one stays on the shelf, marked.
  // A new route's id is unique across both groups, so one id names one route.
  const activeRoute: WalkableRoute | null = useMemo(() => {
    if (activeRouteId === null) return null;
    const shipped = content.routes.find((route) => route.id === activeRouteId);
    if (shipped?.status === 'ready' && shipped.reading.errors === 0) {
      return { routeId: shipped.id, route: shipped.route, reading: shipped.reading, stale: false };
    }
    const own = standings.find((route): route is Extract<PersonalRouteStanding, { status: 'ready' }> =>
      route.status === 'ready' && route.routeId === activeRouteId && canStartPersonalRoute(route));
    return own ? { routeId: own.routeId, route: own.route, reading: own.reading, stale: own.stale } : null;
  }, [activeRouteId, content.routes, standings]);
  const activeSolution = useMemo(() => activeRoute ? routeSolutionOfReading(activeRoute.reading) : null, [activeRoute]);

  // The route being walked, one step per derivation in the record's order, and where the
  // learner has got to on it. Neither is state: the steps come from the record and the graph,
  // and progress comes from the mastery records, so both survive a reopening.
  const steps = useMemo(() => activeSolution
    ? routeSteps(graph, activeSolution)
    : NO_STEPS, [activeSolution, graph]);
  const concepts = mastery?.state.concepts ?? EMPTY_MASTERY.concepts;
  const stepBases = useStepBases(content, steps, concepts, ownerReader);
  const progress: RouteProgress = useMemo(() => routeProgress(steps,
    (step) => stepStanding(concepts[step.conceptId],
      stepBasis(step.conceptId, stepBases, fresh, content))),
  [concepts, content, fresh, stepBases, steps]);

  // A refusal belongs to the step it was about; leaving that step takes it off the screen.
  useEffect(() => { setSubmitError(null); }, [activeRouteId, progress.currentIndex]);

  // A different route on screen has its own definitions to reveal; a judgement already handed
  // in stays where it belongs, in the records.
  useEffect(() => { setWalk(initialRouteWalk); }, [activeRouteId]);

  // Leaving the create flow drops its second step, so coming back starts from the questions.
  useEffect(() => { if (view !== 'orientation') setReviewing(false); }, [view]);

  // A new id is unique among this learner's routes and the workspace's, so one id names one
  // route wherever it is seen.
  const newRouteId = () => generateObjectId('r', [
    ...listed.routes.flatMap((entry) => (entry.routeId === null ? [] : [entry.routeId])),
    ...content.routes.map((entry) => entry.id),
  ]);

  const confirmRoute = async () => {
    if (!solved || !learnerRecords) return;
    setWriting(true);
    setWriteError(null);
    try {
      const route = confirmedRoute({
        id: newRouteId(),
        // The name is derived, not asked for: the starting point is what tells two confirmed
        // routes apart, and the learner can rename it later.
        label: `从 ${liveKnownIds.length ? liveKnownIds.map((id) => labelOf(graph, id)).join('、') : '零'} 走到 ${targetIds.map((id) => labelOf(graph, id)).join('、')}`,
        solution: solved,
        targets: targetIds,
        known: liveKnownIds,
      });
      // A new file: nothing can be there yet, and if something is, the write loses cleanly.
      await savePersonalRoute(learnerRecords, graph, route, { presence: 'missing' });
      setListed(await listRoutes(learnerRecords));
      onConfirmRoute(route.id);
    } catch (error) {
      setWriteError(messageOf(error));
    } finally {
      setWriting(false);
    }
  };

  /** Deleting a route is an explicit learner action about that one file, and never touches mastery. */
  const deleteRoute = async (routeId: string) => {
    if (!learnerRecords) return;
    const entry = listed.routes.find((route) => route.routeId === routeId);
    if (!entry?.version) return;
    setWriteError(null);
    try {
      await learnerRecords.deleteRoute(routeId, entry.version);
      if (activeRouteId === routeId) onSelectRoute(null);
    } catch (error) {
      setWriteError(messageOf(error));
    }
    setListed(await listRoutes(learnerRecords));
  };

  /*
   * Editing a personal route. Every edit writes the learner records and only them: the learning
   * side has no way to write the workspace, and a workspace route copied here becomes a new
   * personal file that the author's later changes never reach.
   */

  /** «另存为我的路线并修改»: an unsaved copy of a workspace route, in the editor. */
  const copyWorkspaceRoute = (routeId: string) => {
    const shipped = content.routes.find((route) => route.id === routeId)?.route;
    if (!shipped) return;
    setDraft({ route: copyAsPersonal(shipped, newRouteId()), saved: null });
  };

  /** «修改»: the personal route as saved, in the editor. */
  const editPersonalRoute = (routeId: string) => {
    const entry = listed.routes.find((route) => route.routeId === routeId);
    if (entry?.status !== 'ready') return;
    setDraft({ route: entry.route, saved: { route: entry.route, version: entry.version } });
  };

  /** «创建我的路线»: blank but for what the learner already knows; the solver drafts the steps. */
  const createPersonalRoute = () => {
    setDraft({ route: newRoute(newRouteId(), { label: '', known: liveKnownIds, targets: [] }), saved: null });
  };

  /** Save the draft as its file: a new one, or the one it was opened from at the version read. */
  const saveDraft = async (route: Route) => {
    if (!learnerRecords || !draft) return;
    // A refusal propagates to the editor, which shows it and keeps the draft.
    await savePersonalRoute(learnerRecords, graph, route,
      draft.saved ? { presence: 'present', version: draft.saved.version } : { presence: 'missing' });
    setWriteError(null);
    setListed(await listRoutes(learnerRecords));
    setShelfSelection(personalEntryKey(`${route.id}.json`));
    setDraft(null);
  };

  const deleteDraftRoute = async () => {
    if (!learnerRecords || !draft?.saved) return;
    const routeId = draft.saved.route.id;
    try {
      await learnerRecords.deleteRoute(routeId, draft.saved.version);
    } finally {
      setListed(await listRoutes(learnerRecords));
    }
    if (activeRouteId === routeId) onSelectRoute(null);
    setDraft(null);
  };

  const draftDirty = draft !== null && !sameRoute(draft.route, draft.saved?.route);
  const editor = draft && learnerRecords
    ? <RouteEditor active={active} graph={graph} tags={content.tags} route={draft.route} dirty={draftDirty}
      routeSolver={routeSolver}
      onChange={(route) => setDraft((current) => (current ? { ...current, route } : current))}
      onSave={saveDraft} onDiscard={() => setDraft(null)}
      onDelete={draft.saved ? deleteDraftRoute : undefined} deletePrompt="删除这条路线？掌握记录不动"
      actions={!draftDirty && <button type="button" onClick={() => setDraft(null)}>不改了</button>} />
    : null;

  /**
   * The learner handed in this step's verification. What that records is a judgement about the
   * step's conclusion concept, against the content it was answered from — the derivation and the
   * definition are separate objects with their own records, and nothing about the answer itself
   * is stored ([learner records](../../docs/learner-records.md)). The step moved on is derived
   * from that record, not from here.
   *
   * It writes `complete`: nothing in the application grades the answer, so there is no honest way
   * to write `incomplete` yet. That status — *asked, and not reached* — is already specified,
   * already writable through `writeJudgements` and already displayed as leaving the step current;
   * which action establishes it is part of exploring how mastery is evidenced, and belongs to that
   * work rather than to a guessed-at button here.
   */
  const submitTask = async (step: RouteStep) => {
    setSubmitError(null);
    if (!learnerRecords) {
      setSubmitError('这个宿主没有应用数据目录，判定无处可存，所以这一步没有记下来。');
      return;
    }
    setSubmitting(true);
    try {
      const basis = await conceptBasis(step.conceptId, '判定');
      const reading = await writeJudgements(learnerRecords, {
        concepts: { [step.conceptId]: { status: 'complete', basis } },
      });
      // The basis is held for this content, so the walk moves on this render rather than waiting
      // for the route's bases to be recomputed from the workspace it was just computed from.
      setFresh({ content, conceptId: step.conceptId, basis });
      setMastery(reading);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };
  const know = (conceptId: string) => intent({ kind: 'know', conceptIds: [conceptId] });
  const toggleKnown = (conceptId: string) => intent(knownIds.includes(conceptId)
    ? { kind: 'set-known', conceptIds: knownIds.filter((id) => id !== conceptId) }
    : { kind: 'know', conceptIds: [conceptId] });
  const toggleTarget = (conceptId: string) => intent(targetIds.includes(conceptId)
    ? { kind: 'set-targets', conceptIds: targetIds.filter((id) => id !== conceptId) }
    : { kind: 'add-targets', conceptIds: [conceptId] });

  // The route stage is two screens, chosen by whether a route is active — never by the view
  // alone, so a route being walked can never stay on screen under another view.
  const picker = view === 'route' && activeRoute === null;
  const walking = view === 'route' && activeRoute !== null;

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

    {picker && <RouteShelf active={active} graph={graph} workspaceRoutes={content.routes}
      personal={learnerRecords ? { routes: standings, issue: listed.issue } : null}
      error={writeError} selected={shelfSelection} editor={editor}
      onSelect={(key) => { setShelfSelection(key); if (!draftDirty) setDraft(null); }}
      onStart={onSelectRoute} onCopy={copyWorkspaceRoute} onEdit={editPersonalRoute}
      onDelete={(routeId) => { void deleteRoute(routeId); }} onCreate={createPersonalRoute}
      onNewRoute={() => onEnterView('orientation')} />}

    {walking && activeRoute && activeSolution && <RouteLearning active={active} content={content}
      solution={activeSolution} steps={steps} progress={progress}
      targetIds={[...activeRoute.route.targets]} knownIds={[...activeRoute.route.known]}
      knownSources={knownSources} stale={activeRoute.stale}
      revealed={walk.revealed} onReveal={(id) => setWalk((current) => revealDefinition(current, id))}
      onSubmit={(step) => { void submitTask(step); }} submitting={submitting} submitError={submitError}
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

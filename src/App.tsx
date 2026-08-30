import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpCircle,
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  FolderOpen,
  FolderPlus,
  Github,
  GitBranch,
  LayoutGrid,
  Milestone,
  Plus,
  Replace,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import './styles.css';
import {
  DOCUMENT_SCHEMA,
  documentMigrationSource,
  formatWeight,
  normalizeWeight,
  uniqueId,
  type AuthoringDocument,
  type DocumentFormat,
  type Hyperedge,
  type Point,
  type Position,
  type ViewReplacement,
} from './domain';
import { activeHyperedge, groupHyperedges, hyperedgeGroupKey, type HyperedgeGroup } from './hyperedgeGroups';
import { createGraphIndex } from './graphIndex';
import { createGraphScene } from './graphScene';
import { createGraphSceneRuntime } from './graphSceneRuntime';
import type { G6GraphSurfaceHandle, G6PointerModifiers } from './G6GraphSurface';
import { LayoutCancelledError, LayoutService } from './layoutService';
import type { LayoutMode } from './layout';
import { DocumentEditor } from './DocumentEditor';
import type { EditorReferenceTarget } from './editorReferences';
import { ConceptSearch } from './ConceptSearch';
import { DerivationForm } from './DerivationForm';
import { convertDocumentContent } from './documentContent';
import {
  CRASH_REPORT_EVENT,
  clearPendingCrashReports,
  readPendingCrashReport,
} from './crashReport';
import { projectDocument, type ReplacementViewMode } from './projection';
import { replacementFromSelection } from './replacements';
import { RoutePanel } from './RoutePanel';
import {
  createRouteSelection,
  invalidateRoute,
  routeHighlightIds,
  solveWorkspaceRoute,
  toggleRouteStart,
  toggleRouteTarget,
  type RouteSelection,
} from './route';
import {
  createEmptyWorkspace,
  graphTutorialWorkspace,
  graphTutorialWorkspaceForStage,
  graphTutorialWorkspaceWithReplacement,
  navigationSampleWorkspace,
  sampleWorkspace,
  type GraphTutorialStage,
} from './sample';
import {
  GuidedTour,
  ONBOARDING_STORAGE_KEY,
  TOUR_FEATURES,
  notifyTourAction,
  tourTarget,
  type TourId,
  type TourPreparation,
} from './onboarding';
import {
  LOCAL_WORKSPACE_KEY,
  PREVIOUS_LOCAL_WORKSPACE_KEY,
  WORKSPACE_MANIFEST,
  chooseWorkspaceDirectory,
  conceptTemplate,
  createDocumentDirectory,
  derivationTemplate,
  documentEntryPath,
  documentSourcePath,
  importManifest,
  loadLocalWorkspace,
  readWorkspaceDirectoryRevision,
  readWorkspaceDirectorySnapshot,
  readWorkspaceDocumentSource,
  resolveWorkspaceImage,
  saveWorkspaceAsDirectory,
  storeDocumentFiles,
  storeWorkspaceImage,
  upgradeWorkspaceDirectorySchema,
  validateWorkspaceDirectoryFiles,
  writeWorkspaceDirectoryChanges,
  type AuthoringWorkspace,
  type ChosenWorkspaceDirectory,
  type WorkspaceDirectory,
  type WorkspaceDirectorySnapshot,
} from './workspace';
const G6GraphSurface = lazy(() => import('./G6GraphSurface'));

type GraphConnection = {
  source: string;
  target: string;
};
type DerivationFormState =
  | { mode: 'create' }
  | { mode: 'edit'; derivationId: string };
type HyperedgePatch = Partial<Omit<Hyperedge, 'id' | 'data'>> & { data?: Partial<Hyperedge['data']> };
type DocumentHistory = {
  past: AuthoringDocument[];
  present: AuthoringDocument;
  future: AuthoringDocument[];
};
type HistoryAction =
  | { type: 'commit'; updater: (current: AuthoringDocument) => AuthoringDocument }
  | { type: 'replace'; document: AuthoringDocument }
  | { type: 'undo' }
  | { type: 'redo' };
type ExternalWorkspaceChange = {
  snapshot: WorkspaceDirectorySnapshot;
};
type WorkspaceOperationError = {
  title: string;
  summary: string;
  details: string;
};
type TutorialWorkspaceSnapshot = {
  manifest: AuthoringDocument;
  files: Record<string, string>;
  directory: WorkspaceDirectory | null;
  revision: string | null;
};
type DeleteCandidate =
  | {
      kind: 'concept';
      id: string;
      label: string;
      derivationCount: number;
    }
  | {
      kind: 'derivation';
      id: string;
      label: string;
    };

const HISTORY_LIMIT = 100;
const LAYOUT_MODES: Array<{ mode: LayoutMode; label: string }> = [
  { mode: 'auto', label: '自动' },
  { mode: 'dagre', label: 'Dagre' },
  { mode: 'force', label: 'Force' },
];

function formatWorkspaceError(operation: string, error: unknown): WorkspaceOperationError {
  const firstMessage = error instanceof Error ? error.message : String(error);
  const lines = [
    `操作: ${operation}`,
    `工作区清单: ${WORKSPACE_MANIFEST}`,
    `时间: ${new Date().toISOString()}`,
    '',
  ];
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      lines.push(`${depth === 0 ? '' : 'Caused by: '}${current.name}: ${current.message}`);
      if (current.stack) {
        const stackLines = current.stack.split('\n').slice(1);
        if (stackLines.length) lines.push(...stackLines);
      }
      current = current.cause;
    } else {
      lines.push(`${depth === 0 ? '' : 'Caused by: '}${String(current)}`);
      current = undefined;
    }
    depth += 1;
  }
  return {
    title: `${operation}失败`,
    summary: firstMessage.split('\n')[0] || '发生未知错误',
    details: lines.join('\n'),
  };
}

function historyReducer(state: DocumentHistory, action: HistoryAction): DocumentHistory {
  if (action.type === 'replace') {
    return { past: [], present: action.document, future: [] };
  }
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
    };
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    if (!next) return state;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: state.future.slice(1),
    };
  }
  const updated = action.updater(state.present);
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: updated,
    future: [],
  };
}

function isExampleMode(): boolean {
  return new URLSearchParams(window.location.search).get('example') === 'replace-with';
}

function initialWorkspace(): AuthoringWorkspace {
  return loadLocalWorkspace(isExampleMode() ? sampleWorkspace : createEmptyWorkspace());
}

function shouldStartFirstTour(): boolean {
  return !isExampleMode()
    && !localStorage.getItem(LOCAL_WORKSPACE_KEY)
    && !localStorage.getItem(PREVIOUS_LOCAL_WORKSPACE_KEY)
    && !localStorage.getItem(ONBOARDING_STORAGE_KEY);
}

function revealConcept(document: AuthoringDocument, conceptId: string): AuthoringDocument {
  const ownerByPoint = new Map<string, string>();
  document.view.replacements.forEach((replacement) => {
    replacement.points.forEach((id) => ownerByPoint.set(id, replacement.replaceWith));
  });
  const showByTarget = new Map<string, ViewReplacement['show']>();
  if (document.view.replacements.some((item) => item.replaceWith === conceptId)) {
    showByTarget.set(conceptId, 'replacement');
  }
  const visited = new Set<string>();
  let cursor = conceptId;
  while (ownerByPoint.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    const owner = ownerByPoint.get(cursor)!;
    showByTarget.set(owner, 'points');
    cursor = owner;
  }
  return {
    ...document,
    view: {
      ...document.view,
      replacements: document.view.replacements.map((replacement) => ({
        ...replacement,
        show: showByTarget.get(replacement.replaceWith) ?? replacement.show,
      })),
    },
  };
}

function firstVisiblePoint(document: AuthoringDocument, id: string): string {
  const replacement = document.view.replacements.find((item) => item.replaceWith === id);
  if (replacement?.show === 'points' && replacement.points.length) {
    return firstVisiblePoint(document, replacement.points[0]);
  }
  return id;
}

function hasExactEndpoints(edge: Hyperedge, tails: readonly string[], head: string): boolean {
  return edge.head === head
    && edge.tails.length === tails.length
    && tails.every((id) => edge.tails.includes(id));
}

function graphTutorialStageSatisfied(document: AuthoringDocument, stage: GraphTutorialStage): boolean {
  const edges = document.graph.hyperedges;
  const singleInvertible = edges.some((edge) => hasExactEndpoints(edge, ['injective-surjective'], 'invertible'));
  const completeInvertible = edges.some((edge) =>
    hasExactEndpoints(edge, ['injective-surjective', 'surjective'], 'invertible'),
  );
  const surjectiveParallel = edges.filter((edge) => hasExactEndpoints(edge, ['linear-map'], 'surjective')).length >= 2;
  const nullSpaceUpdated = edges.some((edge) =>
    edge.id === 'null-space-def'
    && hasExactEndpoints(edge, ['linear-map', 'subspace'], 'null-range'),
  );
  if (stage === 'base') return !singleInvertible && !completeInvertible;
  if (stage === 'invertible-single') return singleInvertible && !completeInvertible;
  if (stage === 'invertible-complete') return completeInvertible;
  if (stage === 'surjective-parallel') return completeInvertible && surjectiveParallel;
  return completeInvertible && surjectiveParallel && nullSpaceUpdated;
}

function AuthoringCanvas() {
  const initial = useRef<ReturnType<typeof initialWorkspace> | null>(null);
  if (!initial.current) initial.current = initialWorkspace();
  const [history, dispatchHistory] = useReducer(historyReducer, initial.current.manifest, (manifest) => ({
    past: [],
    present: manifest,
    future: [],
  }));
  const document = history.present;
  const [files, setFiles] = useState<Record<string, string>>(initial.current.files);
  const [layoutPositions, setLayoutPositions] = useState<Record<string, Position>>({});
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('auto');
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [workspaceDirectory, setWorkspaceDirectory] = useState<WorkspaceDirectory | null>(null);
  const [pendingWorkspaceUpgrade, setPendingWorkspaceUpgrade] = useState<ChosenWorkspaceDirectory | null>(null);
  const [upgradingWorkspace, setUpgradingWorkspace] = useState(false);
  const [externalWorkspaceChange, setExternalWorkspaceChange] = useState<ExternalWorkspaceChange | null>(null);
  const [resolvingExternalChange, setResolvingExternalChange] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceOperationError | null>(null);
  const [workspaceErrorCopied, setWorkspaceErrorCopied] = useState(false);
  const [crashReport, setCrashReport] = useState<string | null>(null);
  const [crashReportCopied, setCrashReportCopied] = useState(false);
  const workspaceDirectoryRef = useRef<WorkspaceDirectory | null>(null);
  const workspaceRevisionRef = useRef<string | null>(null);
  const externalWorkspaceChangeRef = useRef<ExternalWorkspaceChange | null>(null);
  const directoryOperationRef = useRef<Promise<void>>(Promise.resolve());
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusLayouts, setFocusLayouts] = useState<Record<string, Record<string, Position>>>({});
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [layoutRequestCount, setLayoutRequestCount] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('已自动保存');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const jsonMigrationSource = useMemo(() => documentMigrationSource(jsonText), [jsonText]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [derivationForm, setDerivationForm] = useState<DerivationFormState | null>(null);
  const [replacementDraft, setReplacementDraft] = useState<string[] | null>(null);
  const [detachedReplacementIds, setDetachedReplacementIds] = useState<string[]>([]);
  const [activeDerivationByGroup, setActiveDerivationByGroup] = useState<Record<string, string>>({});
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [routeSelection, setRouteSelection] = useState<RouteSelection>(createRouteSelection);
  const [routeSolving, setRouteSolving] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(shouldStartFirstTour);
  const [tourStart, setTourStart] = useState<TourId | null>(() => shouldStartFirstTour() ? 'basics' : null);
  const [canvasInteracting, setCanvasInteracting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmDeleteButton = useRef<HTMLButtonElement>(null);
  const graphSurfaceRef = useRef<G6GraphSurfaceHandle>(null);
  const layoutServiceRef = useRef<LayoutService | null>(null);
  const layoutControlRef = useRef<HTMLDivElement>(null);
  const canvasInteractionRef = useRef(false);
  const tutorialWorkspaceRef = useRef<TutorialWorkspaceSnapshot | null>(null);
  const previousLayoutStructureRef = useRef<string | null>(null);
  const previousLayoutWeightsRef = useRef<string | null>(null);
  const previousLayoutModeRef = useRef<LayoutMode>(layoutMode);
  const fittedLayoutEpochRef = useRef(-1);
  const tutorialFitAfterLayoutRef = useRef(false);

  const fitGraph = useCallback((ids?: Iterable<string>) => {
    const visibleIds = ids ? [...ids] : undefined;
    return graphSurfaceRef.current?.fitView(visibleIds) ?? Promise.resolve();
  }, []);

  const fitInitialGraph = useCallback(() =>
    graphSurfaceRef.current?.fitInitialView() ?? Promise.resolve(), []);

  const clientToGraph = useCallback((position: Position): Position =>
    graphSurfaceRef.current?.clientToGraph(position) ?? position, []);

  const reportWorkspaceError = useCallback((operation: string, error: unknown) => {
    console.error(`[Derivon] ${operation}`, error);
    setWorkspaceError(formatWorkspaceError(operation, error));
    setWorkspaceErrorCopied(false);
  }, []);

  useEffect(() => {
    const service = new LayoutService();
    layoutServiceRef.current = service;
    return () => {
      layoutServiceRef.current = null;
      service.dispose();
    };
  }, []);

  useEffect(() => {
    if (!layoutMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!layoutControlRef.current?.contains(event.target as Node)) setLayoutMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayoutMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [layoutMenuOpen]);

  useEffect(() => {
    let active = true;
    void readPendingCrashReport().then((details) => {
      if (active && details) setCrashReport(details);
    });
    const handleCrashReport = (event: Event) => {
      const details = (event as CustomEvent<{ details?: string }>).detail?.details;
      if (details) {
        setCrashReport(details);
        setCrashReportCopied(false);
      }
    };
    window.addEventListener(CRASH_REPORT_EVENT, handleCrashReport);
    return () => {
      active = false;
      window.removeEventListener(CRASH_REPORT_EVENT, handleCrashReport);
    };
  }, []);

  useEffect(() => {
    if (workspaceDirectory || tutorialWorkspaceRef.current) return;
    try {
      localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify({ manifest: document, files }));
    } catch (error) {
      reportWorkspaceError('缓存浏览器工作区', error);
    }
  }, [document, files, reportWorkspaceError, workspaceDirectory]);

  const detachedReplacementIdSet = useMemo(() => new Set(detachedReplacementIds), [detachedReplacementIds]);
  const projection = useMemo(
    () => projectDocument(document, { detachedReplacementIds: detachedReplacementIdSet }),
    [detachedReplacementIdSet, document],
  );
  const layoutStructure = useMemo(() => JSON.stringify({
    points: document.graph.points.map((point) => point.id),
    hyperedges: document.graph.hyperedges.map((edge) => [edge.id, edge.tails, edge.head]),
  }), [document.graph.hyperedges, document.graph.points]);
  const layoutWeights = useMemo(
    () => JSON.stringify(document.graph.hyperedges.map((edge) => [edge.id, edge.weight])),
    [document.graph.hyperedges],
  );

  useEffect(() => {
    const service = layoutServiceRef.current;
    if (!service) return;
    if (!document.graph.points.length && !document.graph.hyperedges.length) {
      setLayoutPositions({});
      setLayoutRunning(false);
      previousLayoutStructureRef.current = layoutStructure;
      return;
    }
    const previousStructure = previousLayoutStructureRef.current;
    const previousWeights = previousLayoutWeightsRef.current;
    const previousMode = previousLayoutModeRef.current;
    const structureChanged = previousStructure !== layoutStructure;
    const weightsChanged = previousWeights !== layoutWeights;
    const modeChanged = previousMode !== layoutMode;
    const firstLayout = previousStructure === null || fittedLayoutEpochRef.current !== layoutEpoch;
    previousLayoutStructureRef.current = layoutStructure;
    previousLayoutWeightsRef.current = layoutWeights;
    previousLayoutModeRef.current = layoutMode;
    if (!firstLayout && !structureChanged && !weightsChanged && !modeChanged) return;
    let acceptResult = true;
    const timeout = window.setTimeout(() => {
      if (!acceptResult) return;
      setLayoutRunning(true);
      setLayoutRequestCount((current) => current + 1);
      setStatus(modeChanged ? `正在切换为 ${LAYOUT_MODES.find((item) => item.mode === layoutMode)?.label} 布局` : '正在自动布局');
      void service.layoutDocument(document, layoutMode).then((positions) => {
        if (!acceptResult) return;
        setLayoutPositions(positions);
        setFocusLayouts({});
        setStatus(modeChanged ? '布局方式已切换' : '自动布局已就绪');
        const fitAfterLayout = firstLayout || modeChanged || tutorialFitAfterLayoutRef.current;
        if (firstLayout) fittedLayoutEpochRef.current = layoutEpoch;
        tutorialFitAfterLayoutRef.current = false;
        if (fitAfterLayout) window.requestAnimationFrame(() => {
          if (firstLayout) void fitInitialGraph();
          else void fitGraph();
        });
      }).catch((error: unknown) => {
        if (acceptResult && !(error instanceof LayoutCancelledError)) {
          reportWorkspaceError('计算自动布局', error);
        }
      }).finally(() => {
        if (acceptResult) setLayoutRunning(false);
      });
    }, firstLayout || modeChanged ? 0 : structureChanged ? 120 : 400);
    return () => {
      acceptResult = false;
      window.clearTimeout(timeout);
      service.cancel();
    };
  }, [document, fitGraph, fitInitialGraph, layoutEpoch, layoutMode, layoutStructure, layoutWeights, reportWorkspaceError]);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const enqueueDirectoryOperation = useCallback((operation: () => Promise<void>): Promise<void> => {
    const next = directoryOperationRef.current.then(operation, operation);
    directoryOperationRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const reportExternalWorkspaceChange = useCallback((snapshot: WorkspaceDirectorySnapshot) => {
    if (externalWorkspaceChangeRef.current) return;
    const change = { snapshot };
    externalWorkspaceChangeRef.current = change;
    setExternalWorkspaceChange(change);
    setStatus('检测到项目文件夹已在 WebUI 外部更改');
  }, []);

  useEffect(() => {
    if (!workspaceDirectory || externalWorkspaceChange) return;
    const timeout = window.setTimeout(() => {
      void enqueueDirectoryOperation(async () => {
        if (workspaceDirectoryRef.current !== workspaceDirectory || externalWorkspaceChangeRef.current) return;
        const revision = await readWorkspaceDirectoryRevision(workspaceDirectory);
        if (workspaceRevisionRef.current !== revision) {
          reportExternalWorkspaceChange(
            await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false }),
          );
          return;
        }
        await writeWorkspaceDirectoryChanges(workspaceDirectory, document, files);
        workspaceRevisionRef.current = await readWorkspaceDirectoryRevision(workspaceDirectory);
      }).catch((error: unknown) => reportWorkspaceError('自动保存项目文件夹', error));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [document, enqueueDirectoryOperation, externalWorkspaceChange, files, reportExternalWorkspaceChange, reportWorkspaceError, workspaceDirectory]);

  useEffect(() => {
    if (!workspaceDirectory || externalWorkspaceChange || workspaceError) return;
    const interval = window.setInterval(() => {
      if (canvasInteractionRef.current || globalThis.document.hidden) return;
      void enqueueDirectoryOperation(async () => {
        if (workspaceDirectoryRef.current !== workspaceDirectory || externalWorkspaceChangeRef.current) return;
        const revision = await readWorkspaceDirectoryRevision(workspaceDirectory);
        if (workspaceRevisionRef.current !== revision) {
          reportExternalWorkspaceChange(
            await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false }),
          );
        }
      }).catch((error: unknown) => reportWorkspaceError('检查项目文件夹', error));
    }, 1500);
    return () => window.clearInterval(interval);
  }, [enqueueDirectoryOperation, externalWorkspaceChange, reportExternalWorkspaceChange, reportWorkspaceError, workspaceDirectory, workspaceError]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const commit = useCallback((updater: (current: AuthoringDocument) => AuthoringDocument) => {
    dispatchHistory({ type: 'commit', updater });
    setStatus('已自动保存');
  }, []);

  useEffect(() => {
    const validTargets = new Set(document.view.replacements.map((replacement) => replacement.replaceWith));
    setDetachedReplacementIds((current) => {
      const next = current.filter((id) => validTargets.has(id));
      return next.length === current.length ? current : next;
    });
  }, [document.view.replacements]);

  useEffect(() => {
    const pointIds = new Set(document.graph.points.map((point) => point.id));
    setRouteSelection((current) => ({
      ...invalidateRoute(current),
      startPointIds: current.startPointIds.filter((id) => pointIds.has(id)),
      targetPointIds: current.targetPointIds.filter((id) => pointIds.has(id)),
    }));
    setRouteError(null);
  }, [document]);

  const clearTransientView = useCallback((clearDetached = true) => {
    setFocusLayouts({});
    setFocusedId(null);
    setDerivationForm(null);
    setReplacementDraft(null);
    setSelectedNodeIds([]);
    setSelectedId(null);
    setActiveDerivationByGroup({});
    if (clearDetached) setDetachedReplacementIds([]);
  }, []);

  const undo = useCallback(() => {
    if (!history.past.length) return;
    dispatchHistory({ type: 'undo' });
    clearTransientView(false);
    setStatus('已撤回');
    notifyTourAction('undo-used');
  }, [clearTransientView, history.past.length]);

  const redo = useCallback(() => {
    if (!history.future.length) return;
    dispatchHistory({ type: 'redo' });
    clearTransientView(false);
    setStatus('已重做');
    notifyTourAction('redo-used');
  }, [clearTransientView, history.future.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    if (!deleteCandidate) return;
    confirmDeleteButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteCandidate(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteCandidate]);

  const deleteItem = useCallback((id: string) => {
    const isConcept = document.graph.points.some((concept) => concept.id === id);
    const removedDerivations = new Set(
      isConcept
        ? document.graph.hyperedges.filter((item) => item.head === id || item.tails.includes(id)).map((item) => item.id)
        : [id],
    );
    const removedHyperedge = isConcept ? null : document.graph.hyperedges.find((item) => item.id === id);
    setLayoutPositions((current) => {
      const positions = { ...current };
      const groupPosition = removedHyperedge ? positions[id] : null;
      if (removedHyperedge && groupPosition) {
        document.graph.hyperedges.forEach((item) => {
          if (item.id !== id && hyperedgeGroupKey(item) === hyperedgeGroupKey(removedHyperedge)) {
            positions[item.id] = groupPosition;
          }
        });
      }
      delete positions[id];
      removedDerivations.forEach((derivationId) => delete positions[derivationId]);
      return positions;
    });
    commit((current) => ({
      ...current,
      graph: {
        points: isConcept ? current.graph.points.filter((point) => point.id !== id) : current.graph.points,
        hyperedges: current.graph.hyperedges.filter((item) => !removedDerivations.has(item.id)),
      },
      view: {
        ...current.view,
        replacements: current.view.replacements.filter((replacement) =>
          replacement.replaceWith !== id && !replacement.points.includes(id),
        ),
      },
    }));
    setFocusLayouts({});
    setFocusedId(null);
    setReplacementDraft(null);
    setSelectedNodeIds((current) => current.filter((item) => item !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, [commit, document.graph.hyperedges, document.graph.points]);

  const requestDelete = useCallback((id: string) => {
    const concept = document.graph.points.find((item) => item.id === id);
    if (concept) {
      const derivationCount = document.graph.hyperedges.filter(
        (item) => item.head === id || item.tails.includes(id),
      ).length;
      setDeleteCandidate({
        kind: 'concept',
        id,
        label: concept.data.label.trim() || concept.id,
        derivationCount,
      });
      return;
    }
    const derivation = document.graph.hyperedges.find((item) => item.id === id);
    if (derivation) {
      setDeleteCandidate({ kind: 'derivation', id, label: derivation.id });
    }
  }, [document.graph.hyperedges, document.graph.points]);

  const confirmDelete = useCallback(() => {
    if (!deleteCandidate) return;
    deleteItem(deleteCandidate.id);
    setDeleteCandidate(null);
    notifyTourAction('item-deleted');
  }, [deleteCandidate, deleteItem]);

  const toggleReplacement = useCallback((replaceWith: string, show: ViewReplacement['show']) => {
    const replacement = document.view.replacements.find((item) => item.replaceWith === replaceWith);
    if (!replacement) return;
    setDetachedReplacementIds((current) => current.filter((id) => id !== replaceWith));
    const nextDocument: AuthoringDocument = replacement.show === show ? document : {
      ...document,
      view: {
        ...document.view,
        replacements: document.view.replacements.map((item) =>
          item.replaceWith === replaceWith ? { ...item, show } : item,
        ),
      },
    };
    if (nextDocument !== document) commit(() => nextDocument);
    setSelectedId(show === 'replacement'
      ? replaceWith
      : firstVisiblePoint(nextDocument, replacement.points[0]));
    setSelectedNodeIds([]);
    setFocusedId(null);
    setFocusLayouts({});
    setStatus(show === 'replacement' ? `已显示替换概念 ${replaceWith}` : '已显示原概念');
    notifyTourAction('replacement-toggled');
  }, [commit, document]);

  const setReplacementMode = useCallback((replaceWith: string, mode: ReplacementViewMode) => {
    if (mode !== 'compare') {
      toggleReplacement(replaceWith, mode);
      return;
    }
    if (!document.view.replacements.some((item) => item.replaceWith === replaceWith)) return;
    setDetachedReplacementIds((current) => current.includes(replaceWith) ? current : [...current, replaceWith]);
    setStatus('已打开替换对照');
    notifyTourAction('replacement-compared');
  }, [document.view.replacements, toggleReplacement]);

  const removeReplacement = useCallback((replaceWith: string) => {
    setDetachedReplacementIds((current) => current.filter((id) => id !== replaceWith));
    commit((current) => ({
      ...current,
      view: {
        ...current.view,
        replacements: current.view.replacements.filter((replacement) => replacement.replaceWith !== replaceWith),
      },
    }));
    setSelectedId(null);
    setStatus('替换关系已解除，所有点与推导保持不变');
  }, [commit]);

  const graphIndex = useMemo(() => createGraphIndex(document), [document.graph.hyperedges, document.graph.points]);
  const derivationGroups = useMemo(() => groupHyperedges(document.graph.hyperedges), [document.graph.hyperedges]);
  const groupByMemberId = useMemo(() => {
    const result = new Map<string, HyperedgeGroup>();
    derivationGroups.forEach((group) => group.members.forEach((member) => result.set(member.id, group)));
    return result;
  }, [derivationGroups]);
  const visibleDerivationGroups = useMemo(() => groupHyperedges(projection.hyperedges), [projection.hyperedges]);
  const graphScene = useMemo(
    () => createGraphScene(document, activeDerivationByGroup, {
      projection,
      groups: visibleDerivationGroups,
    }),
    [activeDerivationByGroup, document, projection, visibleDerivationGroups],
  );
  const visibleGroupByNodeId = useMemo(
    () => new Map(visibleDerivationGroups.map((group) => [group.nodeId, group])),
    [visibleDerivationGroups],
  );
  const displayedDerivationByNodeId = useMemo(
    () => new Map(visibleDerivationGroups.map((group) => [
      group.nodeId,
      activeHyperedge(group, activeDerivationByGroup[group.key]),
    ])),
    [activeDerivationByGroup, visibleDerivationGroups],
  );
  const routeIds = useMemo(() => routeHighlightIds(routeSelection.result), [routeSelection.result]);
  const routeEdgeIds = useMemo(() => new Set(routeSelection.result?.hyperedgeIds ?? []), [routeSelection.result]);
  const activeIds = useMemo(() => {
    const candidates = graphIndex.neighborhood(focusedId);
    projection.replacementAssists.forEach((assist) => {
      if (focusedId && [assist.targetId, ...assist.memberIds].includes(focusedId)) {
        candidates.add(assist.targetId);
        assist.memberIds.forEach((id) => candidates.add(id));
      }
    });
    return new Set([...candidates].filter((id) => projection.visibleIds.has(id)));
  }, [focusedId, graphIndex, projection.replacementAssists, projection.visibleIds]);
  const hoveredIds = useMemo(() => {
    const candidates = graphIndex.neighborhood(hoveredId);
    return new Set([...candidates].filter((id) => projection.visibleIds.has(id)));
  }, [graphIndex, hoveredId, projection.visibleIds]);
  useEffect(() => {
    if (!focusedId || focusLayouts[focusedId] || detachedReplacementIds.length) return;
    const service = layoutServiceRef.current;
    if (!service) return;
    let acceptResult = true;
    setLayoutRequestCount((current) => current + 1);
    void service.layoutNeighborhood(
      document,
      activeIds,
      focusedId,
      layoutPositions,
    ).then((positions) => {
      if (!acceptResult) return;
      setFocusLayouts((current) => ({ ...current, [focusedId]: positions }));
    }).catch((error: unknown) => {
      if (acceptResult && !(error instanceof LayoutCancelledError)) {
        reportWorkspaceError('计算局部布局', error);
      }
    });
    return () => {
      acceptResult = false;
    };
  }, [activeIds, detachedReplacementIds.length, document, focusLayouts, focusedId, layoutPositions, reportWorkspaceError]);
  const focusPositions = focusedId ? focusLayouts[focusedId] ?? null : null;
  const selectedSceneIds = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const routeStartIds = useMemo(() => new Set(routeSelection.startPointIds), [routeSelection.startPointIds]);
  const routeTargetIds = useMemo(() => new Set(routeSelection.targetPointIds), [routeSelection.targetPointIds]);
  const graphSceneRuntime = useMemo(() => createGraphSceneRuntime(graphScene, {
    positions: layoutPositions,
    positionOverrides: focusPositions ?? undefined,
    selectedIds: selectedSceneIds,
    activeIds,
    hoveredIds,
    hoveredId,
    routeIds,
    routeDerivationIds: routeEdgeIds,
    routeStartIds,
    routeTargetIds,
    focusActive: !!focusedId,
    hoverActive: !!hoveredId,
    routeActive: !!routeSelection.result,
    nodeInteractionsDisabled: !!derivationForm,
    dragDisabled: !!derivationForm || routeMode || !!replacementDraft || layoutRunning,
    connectionDisabled: !!derivationForm || routeMode || !!replacementDraft || layoutRunning,
  }), [activeIds, derivationForm, focusPositions, focusedId, graphScene, hoveredId, hoveredIds, layoutPositions, layoutRunning, replacementDraft, routeEdgeIds, routeIds, routeMode, routeSelection.result, routeStartIds, routeTargetIds, selectedSceneIds]);

  useEffect(() => {
    if (!focusedId && !routeSelection.result) return;
    const activeSelectionIds = new Set(graphSceneRuntime.nodes.filter((node) => !node.dimmed).map((node) => node.id));
    setSelectedNodeIds((current) => {
      const next = current.filter((id) => activeSelectionIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [focusedId, graphSceneRuntime.nodes, routeSelection.result]);

  const selectDerivation = useCallback((group: HyperedgeGroup, id: string) => {
    setActiveDerivationByGroup((current) => ({ ...current, [group.key]: id }));
    setSelectedId(id);
    setFocusedId((current) => {
      const focusedGroup = current ? groupByMemberId.get(current) : null;
      return focusedGroup?.key === group.key ? id : current;
    });
    setStatus(`正在查看推导 ${id}`);
    notifyTourAction('derivation-selected');
    if (id === 'surjective-def' && group.key === hyperedgeGroupKey({ tails: ['linear-map'], head: 'surjective' })) {
      notifyTourAction('tutorial-surjective-original-selected');
    }
  }, [groupByMemberId]);

  const beginReplacement = useCallback(() => {
    if (replacementDraft) {
      setReplacementDraft(null);
      setStatus('已取消替换');
      return;
    }
    const conceptIds = new Set(document.graph.points.map((concept) => concept.id));
    const points = selectedNodeIds.filter((id) => conceptIds.has(id));
    if (!points.length) {
      setStatus('请先选择概念点');
      return;
    }
    setReplacementDraft(points);
    setStatus('请选择已有概念作为替换点');
    notifyTourAction('replacement-started');
  }, [document.graph.points, replacementDraft, selectedNodeIds]);

  const focusedSceneNodeIds = useMemo(() => focusedId
    ? graphScene.nodes.flatMap((node) =>
        activeIds.has(node.id) || (node.kind === 'derivation' && activeIds.has(node.semanticId)) ? [node.id] : [],
      )
    : undefined,
  [activeIds, focusedId, graphScene.nodes]);

  useEffect(() => {
    if (!focusedSceneNodeIds) return;
    const frame = window.requestAnimationFrame(() => {
      void fitGraph(focusedSceneNodeIds);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitGraph, focusPositions, focusedSceneNodeIds]);

  const persistNodePositions = useCallback((draggedNodes: Array<{ id: string; position: Position }>) => {
    const movedPositions = draggedNodes.flatMap((node) => {
      const group = visibleGroupByNodeId.get(node.id);
      return group
        ? group.members.map((member) => ({ id: member.id, position: node.position }))
        : [{ id: node.id, position: node.position }];
    });
    const localNodes = focusedId ? movedPositions.filter((node) => activeIds.has(node.id)) : [];
    const overviewNodes = focusedId ? movedPositions.filter((node) => !activeIds.has(node.id)) : movedPositions;

    if (localNodes.length && focusedId) {
      setFocusLayouts((current) => ({
        ...current,
        [focusedId]: {
          ...(current[focusedId] ?? Object.fromEntries(
            [...activeIds].flatMap((id) => layoutPositions[id] ? [[id, layoutPositions[id]]] : []),
          )),
          ...Object.fromEntries(localNodes.map((node) => [node.id, node.position])),
        },
      }));
      setStatus('局部视图布局已更新');
    }
    if (overviewNodes.length) {
      setLayoutPositions((current) => ({
        ...current,
        ...Object.fromEntries(overviewNodes.map((node) => [node.id, node.position])),
      }));
      setStatus('整体布局已在本次会话更新');
    }
    if (draggedNodes.length) notifyTourAction('node-moved');
  }, [activeIds, focusedId, layoutPositions, visibleGroupByNodeId]);

  const addConcept = useCallback((position?: Position) => {
    const id = uniqueId('c', document.graph.points.map((concept) => concept.id));
    const directory = createDocumentDirectory('concept', id, [
      ...document.graph.points.map((item) => item.data.document),
      ...document.graph.hyperedges.map((item) => item.data.document),
    ]);
    const format: DocumentFormat = 'markdown';
    const source = conceptTemplate('新概念', format);
    const conceptIndex = document.graph.points.length;
    const nextPosition = position ?? clientToGraph({
      x: window.innerWidth / 2 + (conceptIndex % 3 - 1) * 170,
      y: window.innerHeight / 2 + Math.floor(conceptIndex / 3) * 100,
    });
    setFiles((current) => storeDocumentFiles(current, directory, format, source, '新概念'));
    setLayoutPositions((current) => ({ ...current, [id]: nextPosition }));
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        points: [...current.graph.points, { id, data: { label: '新概念', document: directory, format } }],
      },
    }));
    setFocusLayouts({});
    setFocusedId(null);
    setSelectedNodeIds([id]);
    setSelectedId(id);
    notifyTourAction('concept-added');
  }, [clientToGraph, commit, document.graph.hyperedges, document.graph.points]);

  const createDerivation = useCallback((tails: string[], head: string, weight = 1): string => {
    const id = uniqueId('h', document.graph.hyperedges.map((item) => item.id));
    const directory = createDocumentDirectory('derivation', id, [
      ...document.graph.points.map((item) => item.data.document),
      ...document.graph.hyperedges.map((item) => item.data.document),
    ]);
    const format: DocumentFormat = 'markdown';
    const source = derivationTemplate(id, format);
    const nextHyperedge: Hyperedge = {
      id,
      weight: normalizeWeight(weight),
      tails: [...new Set(tails)],
      head,
      data: { document: directory, format },
    };
    const matchingGroup = derivationGroups.find((group) => group.key === hyperedgeGroupKey(nextHyperedge));
    const endpointPositions = [...nextHyperedge.tails, head]
      .map((endpointId) => layoutPositions[endpointId])
      .filter((position): position is Position => !!position);
    const temporaryPosition = matchingGroup
      ? layoutPositions[matchingGroup.nodeId]
      : endpointPositions.length
        ? {
            x: endpointPositions.reduce((sum, position) => sum + position.x, 0) / endpointPositions.length + 41,
            y: endpointPositions.reduce((sum, position) => sum + position.y, 0) / endpointPositions.length + 5,
          }
        : { x: 40, y: 40 };
    setFiles((current) => storeDocumentFiles(current, directory, format, source, `推导 ${id}`));
    setLayoutPositions((current) => ({ ...current, [id]: temporaryPosition }));
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        hyperedges: [...current.graph.hyperedges, nextHyperedge],
      },
    }));
    setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: id }));
    setSelectedNodeIds([matchingGroup?.nodeId ?? id]);
    setSelectedId(id);
    setFocusLayouts({});
    setFocusedId(null);
    notifyTourAction('derivation-created');
    if (hasExactEndpoints(nextHyperedge, ['injective-surjective'], 'invertible')) {
      notifyTourAction('tutorial-invertible-created');
    }
    if (hasExactEndpoints(nextHyperedge, ['linear-map'], 'surjective')) {
      notifyTourAction('tutorial-surjective-parallel-created');
    }
    return id;
  }, [commit, derivationGroups, document.graph.hyperedges, document.graph.points, layoutPositions]);

  const connectNodes = useCallback((connection: GraphConnection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceConcept = document.graph.points.some((item) => item.id === connection.source);
    const targetConcept = document.graph.points.some((item) => item.id === connection.target);
    const sourceDerivation = displayedDerivationByNodeId.get(connection.source)
      ?? document.graph.hyperedges.find((item) => item.id === connection.source);
    const targetDerivation = displayedDerivationByNodeId.get(connection.target)
      ?? document.graph.hyperedges.find((item) => item.id === connection.target);

    if ((sourceConcept && (targetConcept || targetDerivation)) || (sourceDerivation && targetConcept)) {
      setFocusLayouts({});
      setFocusedId(null);
    }

    if (sourceConcept && targetConcept) {
      createDerivation([connection.source], connection.target, 1);
      return;
    }
    if (sourceConcept && targetDerivation) {
      if (targetDerivation.tails.includes(connection.source)) {
        setStatus('该概念已经是当前推导的前提');
        return;
      }
      const nextHyperedge = { ...targetDerivation, tails: [...targetDerivation.tails, connection.source] };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) => item.id === targetDerivation.id ? nextHyperedge : item),
        },
      }));
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: nextHyperedge.id }));
      setSelectedNodeIds([connection.target]);
      setSelectedId(targetDerivation.id);
      notifyTourAction('derivation-updated');
      if (hasExactEndpoints(nextHyperedge, ['injective-surjective', 'surjective'], 'invertible')) {
        notifyTourAction('tutorial-invertible-premise-added');
      }
      if (targetDerivation.id === 'null-space-def'
        && hasExactEndpoints(nextHyperedge, ['linear-map', 'subspace'], 'null-range')) {
        notifyTourAction('tutorial-null-space-premise-added');
      }
      return;
    }
    if (sourceDerivation && targetConcept) {
      if (sourceDerivation.head === connection.target) {
        setStatus('该概念已经是当前推导的结论');
        return;
      }
      const nextHyperedge = { ...sourceDerivation, head: connection.target };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) => item.id === sourceDerivation.id ? nextHyperedge : item),
        },
      }));
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: nextHyperedge.id }));
      setSelectedNodeIds([connection.source]);
      setSelectedId(sourceDerivation.id);
      notifyTourAction('derivation-updated');
      return;
    }
    setStatus('只能连接“概念 → 概念 / 推导”或“推导 → 概念”');
  }, [commit, createDerivation, displayedDerivationByNodeId, document.graph.hyperedges, document.graph.points]);

  const openCreateDerivationForm = useCallback(() => {
    setRouteMode(false);
    setReplacementDraft(null);
    setDerivationForm({ mode: 'create' });
  }, []);

  const closeDerivationForm = useCallback(() => setDerivationForm(null), []);

  const updatePointData = useCallback((id: string, patch: Partial<Point['data']>) => {
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        points: current.graph.points.map((item) =>
          item.id === id ? { ...item, data: { ...item.data, ...patch } } : item,
        ),
      },
    }));
  }, [commit]);

  const updateConceptName = useCallback((id: string, value: string) => {
    updatePointData(id, { label: value });
    if (value.trim() && value.trim() !== '新概念') notifyTourAction('concept-renamed');
  }, [updatePointData]);

  const updateHyperedge = useCallback((id: string, patch: HyperedgePatch) => {
    const currentHyperedge = document.graph.hyperedges.find((item) => item.id === id);
    if (currentHyperedge) {
      const nextHyperedge = { ...currentHyperedge, ...patch, data: { ...currentHyperedge.data, ...patch.data } };
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: id }));
    }
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        hyperedges: current.graph.hyperedges.map((item) =>
          item.id === id
            ? { ...item, ...patch, data: { ...item.data, ...patch.data } }
            : item,
        ),
      },
    }));
  }, [commit, document.graph.hyperedges]);

  const updateDerivationWeight = useCallback((id: string, value: string) => {
    const parsed = Number(value);
    updateHyperedge(id, { weight: normalizeWeight(parsed) });
    if (value.trim() && Number.isFinite(parsed) && parsed >= 0) notifyTourAction('derivation-weight-edited');
  }, [updateHyperedge]);

  const openEditDerivationForm = useCallback((derivationId: string) => {
    setRouteMode(false);
    setReplacementDraft(null);
    setDerivationForm({ mode: 'edit', derivationId });
  }, []);

  const submitDerivationForm = useCallback((draft: { tails: string[]; head: string; weight: number }) => {
    if (!derivationForm) return;
    if (derivationForm.mode === 'create') {
      createDerivation(draft.tails, draft.head, draft.weight);
      setStatus('已创建推导');
    } else {
      updateHyperedge(derivationForm.derivationId, { tails: [...new Set(draft.tails)], head: draft.head });
      setSelectedId(derivationForm.derivationId);
      setSelectedNodeIds([groupByMemberId.get(derivationForm.derivationId)?.nodeId ?? derivationForm.derivationId]);
      setFocusedId(null);
      setStatus('已更新推导前提与结论');
      notifyTourAction('derivation-updated');
    }
    setDerivationForm(null);
  }, [createDerivation, derivationForm, groupByMemberId, updateHyperedge]);

  const applyLayout = useCallback(() => {
    const service = layoutServiceRef.current;
    if (!service || layoutRunning) return;
    setLayoutRunning(true);
    setFocusedId(null);
    setFocusLayouts({});
    setStatus('正在重新计算自动布局');
    setLayoutRequestCount((current) => current + 1);
    void service.layoutDocument(document, layoutMode).then((positions) => {
      setLayoutPositions(positions);
      setStatus('已重新计算自动布局');
      notifyTourAction('layout-applied');
      window.setTimeout(() => void fitGraph(), 100);
    }).catch((error: unknown) => {
      if (!(error instanceof LayoutCancelledError)) reportWorkspaceError('重新计算自动布局', error);
    }).finally(() => setLayoutRunning(false));
  }, [document, fitGraph, layoutMode, layoutRunning, reportWorkspaceError]);

  const findConcept = useCallback((pointId?: string) => {
    const query = search.trim().toLocaleLowerCase();
    const concept = pointId
      ? document.graph.points.find((item) => item.id === pointId)
      : document.graph.points.find((item) =>
        item.id.toLocaleLowerCase() === query || item.data.label.toLocaleLowerCase().includes(query),
      );
    if (!concept) {
      setStatus('没有匹配的概念');
      return;
    }
    if (replacementDraft) {
      const candidate = replacementFromSelection(document, replacementDraft, concept.id);
      if (!candidate.replacement) {
        setStatus(candidate.analysis.issues[0]?.message ?? '无法建立替换关系');
        return;
      }
      commit((current) => ({
        ...current,
        view: {
          ...current.view,
          replacements: [...current.view.replacements, candidate.replacement!],
        },
      }));
      setReplacementDraft(null);
      setSelectedNodeIds([]);
      setSelectedId(candidate.replacement.points[0]);
      setSearch('');
      setStatus(`已定义 ${candidate.replacement.points.join(' + ')} → ${concept.id}`);
      notifyTourAction('replacement-created');
      return;
    }
    const revealed = revealConcept(document, concept.id);
    const projectionChanged = revealed.view.replacements.some((replacement, index) =>
      replacement.show !== document.view.replacements[index]?.show,
    );
    if (projectionChanged) commit(() => revealed);
    setFocusedId(null);
    setSelectedNodeIds([concept.id]);
    setSelectedId(concept.id);
    notifyTourAction('concept-found');
    window.setTimeout(() => void graphSurfaceRef.current?.focusElement(concept.id), 30);
  }, [commit, document, replacementDraft, search]);

  const adoptChosenWorkspace = useCallback((result: ChosenWorkspaceDirectory, statusMessage?: string) => {
    const imported = result.workspace.manifest;
    workspaceDirectoryRef.current = result.handle;
    workspaceRevisionRef.current = result.revision;
    externalWorkspaceChangeRef.current = null;
    setExternalWorkspaceChange(null);
    setFiles(result.created ? result.workspace.files : {});
    if (!result.created) {
      setLayoutPositions({});
      setLayoutEpoch((current) => current + 1);
    }
    dispatchHistory({ type: 'replace', document: imported });
    setWorkspaceDirectory(result.handle);
    setEditingId(null);
    clearTransientView();
    setStatus(statusMessage ?? (result.created
      ? `已在 ${result.handle.name} 创建工作区`
      : `已打开工作区 ${result.handle.name}`));
    window.setTimeout(() => void fitGraph(), 20);
  }, [clearTransientView, fitGraph]);

  const connectWorkspace = useCallback(async () => {
    try {
      const result = await chooseWorkspaceDirectory({ manifest: document, files });
      setTourOpen(false);
      setTourStart(null);
      tutorialWorkspaceRef.current = null;
      if (result.migrationSource) {
        setPendingWorkspaceUpgrade(result);
        setStatus(`工作区 schema ${result.migrationSource} 需要升级`);
        return;
      }
      adoptChosenWorkspace(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      reportWorkspaceError('打开项目文件夹', error);
    }
  }, [adoptChosenWorkspace, document, files, reportWorkspaceError]);

  const confirmWorkspaceUpgrade = useCallback(async () => {
    if (!pendingWorkspaceUpgrade?.migrationSource || upgradingWorkspace) return;
    const source = pendingWorkspaceUpgrade.migrationSource;
    setUpgradingWorkspace(true);
    try {
      const upgraded = await upgradeWorkspaceDirectorySchema(pendingWorkspaceUpgrade);
      setPendingWorkspaceUpgrade(null);
      adoptChosenWorkspace(
        upgraded,
        `已将 ${upgraded.handle.name} 从 ${source} 升级到 ${DOCUMENT_SCHEMA} 并打开`,
      );
    } catch (error) {
      reportWorkspaceError('升级工作区 schema', error);
    } finally {
      setUpgradingWorkspace(false);
    }
  }, [adoptChosenWorkspace, pendingWorkspaceUpgrade, reportWorkspaceError, upgradingWorkspace]);

  const createWorkspaceInNewDirectory = useCallback(async () => {
    try {
      const workspace = createEmptyWorkspace();
      const handle = await saveWorkspaceAsDirectory(workspace);
      workspaceDirectoryRef.current = handle;
      workspaceRevisionRef.current = await readWorkspaceDirectoryRevision(handle);
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setFiles(workspace.files);
      setLayoutPositions({});
      setLayoutEpoch((current) => current + 1);
      dispatchHistory({ type: 'replace', document: workspace.manifest });
      setWorkspaceDirectory(handle);
      setEditingId(null);
      clearTransientView();
      setStatus(`已在 ${handle.name} 创建空项目`);
      notifyTourAction('workspace-created');
      window.setTimeout(() => void fitGraph(), 20);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      reportWorkspaceError('创建空项目', error);
    }
  }, [clearTransientView, fitGraph, reportWorkspaceError]);

  const saveWorkspaceAs = useCallback(async () => {
    try {
      const workspace = { manifest: document, files };
      const handle = await saveWorkspaceAsDirectory(workspace, workspaceDirectory ?? undefined);
      workspaceDirectoryRef.current = handle;
      workspaceRevisionRef.current = await readWorkspaceDirectoryRevision(handle);
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setWorkspaceDirectory(handle);
      setStatus(`已另存到新工作区 ${handle.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      reportWorkspaceError('另存项目文件夹', error);
    }
  }, [document, files, reportWorkspaceError, workspaceDirectory]);

  const importFile = useCallback(async (file: File) => {
    try {
      const importedWorkspace = importManifest(await file.text(), files);
      const imported = importedWorkspace.manifest;
      workspaceDirectoryRef.current = null;
      workspaceRevisionRef.current = null;
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setFiles(importedWorkspace.files);
      setLayoutPositions({});
      setLayoutEpoch((current) => current + 1);
      setWorkspaceDirectory(null);
      commit(() => imported);
      setEditingId(null);
      clearTransientView();
      setStatus('JSON 已迁移到本地工作区');
      window.setTimeout(() => void fitGraph(), 20);
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : '无法导入 JSON');
    }
  }, [clearTransientView, commit, files, fitGraph]);

  const openJsonEditor = useCallback(() => {
    setJsonText(JSON.stringify(document, null, 2));
    setJsonOpen(true);
    notifyTourAction('json-opened');
  }, [document]);

  const applyJson = useCallback(async () => {
    try {
      const importedWorkspace = importManifest(jsonText, files, { allowMissingFiles: !!workspaceDirectory });
      const parsed = importedWorkspace.manifest;
      if (workspaceDirectory) await validateWorkspaceDirectoryFiles(workspaceDirectory, parsed, files);
      setLayoutPositions({});
      setLayoutEpoch((current) => current + 1);
      commit(() => parsed);
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setReplacementDraft(null);
      setDetachedReplacementIds([]);
      setJsonOpen(false);
      setStatus(jsonMigrationSource
        ? `JSON schema 已从 ${jsonMigrationSource} 自动升级到 ${DOCUMENT_SCHEMA}`
        : 'JSON 已应用');
      notifyTourAction('json-applied');
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : 'JSON 无效');
    }
  }, [commit, files, jsonMigrationSource, jsonText, workspaceDirectory]);

  const adoptExternalWorkspaceChange = useCallback(() => {
    if (!externalWorkspaceChange) return;
    const importedWorkspace = externalWorkspaceChange.snapshot.workspace;
    const imported = importedWorkspace.manifest;
    workspaceRevisionRef.current = externalWorkspaceChange.snapshot.revision;
    externalWorkspaceChangeRef.current = null;
    setFiles({});
    setLayoutPositions({});
    setLayoutEpoch((current) => current + 1);
    dispatchHistory({ type: 'replace', document: imported });
    setExternalWorkspaceChange(null);
    setEditingId(null);
    clearTransientView();
    setStatus('已采用项目文件夹中的更改');
    window.setTimeout(() => void fitGraph(), 20);
  }, [clearTransientView, externalWorkspaceChange, fitGraph]);

  const keepWebUiWorkspaceChange = useCallback(() => {
    if (!externalWorkspaceChange || !workspaceDirectory || resolvingExternalChange) return;
    setResolvingExternalChange(true);
    void enqueueDirectoryOperation(async () => {
      if (workspaceDirectoryRef.current !== workspaceDirectory) return;
      await writeWorkspaceDirectoryChanges(workspaceDirectory, document, files);
      workspaceRevisionRef.current = await readWorkspaceDirectoryRevision(workspaceDirectory);
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setStatus('已保留 WebUI 更改并覆盖项目文件夹');
    }).catch((error: unknown) => reportWorkspaceError('覆盖项目文件夹', error))
      .finally(() => setResolvingExternalChange(false));
  }, [document, enqueueDirectoryOperation, externalWorkspaceChange, files, reportWorkspaceError, resolvingExternalChange, workspaceDirectory]);

  const toggleRouteMode = useCallback(() => {
    setRouteMode((current) => {
      if (!current) notifyTourAction('route-mode-opened');
      return !current;
    });
    setRouteError(null);
    setFocusedId(null);
    setSelectedNodeIds([]);
    setSelectedId(null);
  }, []);

  const toggleStartPoint = useCallback((pointId: string) => {
    setRouteSelection((current) => {
      if (!current.startPointIds.includes(pointId)) notifyTourAction('route-start-selected');
      return toggleRouteStart(current, pointId);
    });
    setRouteError(null);
  }, []);

  const toggleTargetPoint = useCallback((pointId: string) => {
    setRouteSelection((current) => {
      if (!current.targetPointIds.includes(pointId)) notifyTourAction('route-target-selected');
      return toggleRouteTarget(current, pointId);
    });
    setRouteError(null);
  }, []);

  const clearRoute = useCallback(() => {
    setRouteSelection(createRouteSelection());
    setRouteError(null);
    setActiveDerivationByGroup({});
  }, []);

  const runRouteSolve = useCallback(() => {
    setRouteSolving(true);
    setRouteError(null);
    void solveWorkspaceRoute(document, routeSelection).then((result) => {
      startTransition(() => {
        setRouteSelection((current) => ({ ...current, result }));
        notifyTourAction('route-solved');
        if (result.reachable) {
          const active = Object.fromEntries(result.hyperedgeIds.flatMap((id) => {
            const group = groupByMemberId.get(id);
            return group ? [[group.key, id]] : [];
          }));
          setActiveDerivationByGroup((current) => ({ ...current, ...active }));
          setStatus(result.provenOptimal ? '已找到并证明最优路线' : '已找到当前最佳路线');
        } else {
          setStatus('部分目标当前不可达');
        }
      });
    }).catch((error: unknown) => {
      setRouteError(error instanceof Error ? error.message : String(error));
    }).finally(() => setRouteSolving(false));
  }, [document, groupByMemberId, routeSelection]);

  const selectNode = useCallback((id: string, shiftKey: boolean) => {
    const displayedDerivation = displayedDerivationByNodeId.get(id);
    const semanticId = displayedDerivation?.id ?? id;
    const derivationGroup = visibleGroupByNodeId.get(id);
    if (displayedDerivation && derivationGroup) {
      setActiveDerivationByGroup((current) => ({ ...current, [derivationGroup.key]: displayedDerivation.id }));
    }
    if (routeMode) {
      if (document.graph.points.some((concept) => concept.id === semanticId)) {
        toggleStartPoint(semanticId);
      }
      return;
    }
    if (replacementDraft) {
      if (!document.graph.points.some((concept) => concept.id === semanticId)) {
        setStatus('替换点必须是概念');
        return;
      }
      const candidate = replacementFromSelection(document, replacementDraft, semanticId);
      if (!candidate.replacement) {
        setStatus(candidate.analysis.issues[0]?.message ?? '无法建立替换关系');
        return;
      }
      commit((current) => ({
        ...current,
        view: {
          ...current.view,
          replacements: [...current.view.replacements, candidate.replacement!],
        },
      }));
      setReplacementDraft(null);
      setSelectedNodeIds([]);
      setSelectedId(candidate.replacement.points[0]);
      setStatus(`已定义 ${candidate.replacement.points.join(' + ')} → ${semanticId}`);
      notifyTourAction('replacement-created');
      return;
    }
    if (selectedId === semanticId && !shiftKey) {
      if (layoutRunning) {
        setStatus('自动布局完成后可进入局部视图');
        return;
      }
      setFocusedId(semanticId);
      notifyTourAction('focused-view-toggled');
      return;
    }
    setSelectedId(semanticId);
  }, [commit, displayedDerivationByNodeId, document, layoutRunning, replacementDraft, routeMode, selectedId, toggleStartPoint, visibleGroupByNodeId]);

  const toggleFocusedView = useCallback(() => {
    setFocusedId((current) => current ? null : selectedId);
    notifyTourAction('focused-view-toggled');
  }, [selectedId]);

  const openDocument = useCallback((id: string, reportTourAction = true) => {
    const item = document.graph.points.find((point) => point.id === id)
      ?? document.graph.hyperedges.find((hyperedge) => hyperedge.id === id);
    if (!item) return;
    const sourcePath = documentSourcePath(item.data);
    if (!workspaceDirectory || typeof files[sourcePath] === 'string') {
      setEditingId(id);
      if (reportTourAction) notifyTourAction('document-opened');
      return;
    }
    setStatus(`正在读取 ${sourcePath}`);
    void enqueueDirectoryOperation(async () => {
      const source = await readWorkspaceDocumentSource(workspaceDirectory, item.data);
      if (workspaceDirectoryRef.current !== workspaceDirectory) return;
      setFiles((current) => ({ ...current, [sourcePath]: source }));
      setEditingId(id);
      setStatus('文档已加载');
      if (reportTourAction) notifyTourAction('document-opened');
    }).catch((error: unknown) => reportWorkspaceError(`读取 ${sourcePath}`, error));
  }, [document.graph.hyperedges, document.graph.points, enqueueDirectoryOperation, files, reportWorkspaceError, workspaceDirectory]);

  const clearCanvasSelection = useCallback(() => {
    if (derivationForm) return;
    setHoveredId(null);
    setFocusedId(null);
    setSelectedId(null);
    setSelectedNodeIds([]);
    if (replacementDraft) {
      setReplacementDraft(null);
      setStatus('已取消替换');
    }
  }, [derivationForm, replacementDraft]);

  const handleG6NodeHover = useCallback((id: string | null) => {
    if (!id) {
      setHoveredId(null);
      return;
    }
    setHoveredId(displayedDerivationByNodeId.get(id)?.id ?? id);
  }, [displayedDerivationByNodeId]);

  const handleG6NodeClick = useCallback((id: string, pointer: G6PointerModifiers) => {
    const semanticId = displayedDerivationByNodeId.get(id)?.id ?? id;
    if (pointer.ctrlKey || pointer.metaKey) {
      openDocument(semanticId);
      return;
    }
    setSelectedNodeIds((current) => {
      const next = pointer.shiftKey
        ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id].sort()
        : [id];
      const conceptIds = new Set(document.graph.points.map((concept) => concept.id));
      if (next.filter((item) => conceptIds.has(item)).length >= 2) {
        notifyTourAction('multiple-concepts-selected');
      }
      return next;
    });
    selectNode(id, pointer.shiftKey);
  }, [displayedDerivationByNodeId, document.graph.points, openDocument, selectNode]);

  const handleG6NodeContextMenu = useCallback((id: string, pointer: G6PointerModifiers) => {
    const semanticId = displayedDerivationByNodeId.get(id)?.id ?? id;
    if (pointer.ctrlKey || pointer.metaKey) {
      openDocument(semanticId);
      return;
    }
    if (routeMode && document.graph.points.some((concept) => concept.id === semanticId)) {
      toggleTargetPoint(semanticId);
    }
  }, [displayedDerivationByNodeId, document.graph.points, openDocument, routeMode, toggleTargetPoint]);

  const handleG6NodeDragEnd = useCallback((nodes: Array<{ id: string; position: Position }>) => {
    persistNodePositions(nodes);
  }, [persistNodePositions]);

  const handleG6Connect = useCallback((source: string, target: string) => {
    connectNodes({ source, target });
  }, [connectNodes]);

  const handleG6MarqueeSelect = useCallback((ids: string[]) => {
    setSelectedNodeIds((current) => [...new Set([...current, ...ids])].sort());
    if (ids.length) {
      const first = ids[0];
      setSelectedId(displayedDerivationByNodeId.get(first)?.id ?? first);
    }
    const conceptIds = new Set(document.graph.points.map((concept) => concept.id));
    if (ids.filter((id) => conceptIds.has(id)).length >= 2) notifyTourAction('multiple-concepts-selected');
  }, [displayedDerivationByNodeId, document.graph.points]);

  const handleG6InteractionChange = useCallback((active: boolean) => {
    canvasInteractionRef.current = active;
    setCanvasInteracting(active);
  }, []);

  const returnToCanvas = useCallback(() => {
    const id = editingId;
    setEditingId(null);
    notifyTourAction('canvas-returned');
    if (!id || !workspaceDirectory) return;
    const item = document.graph.points.find((point) => point.id === id)
      ?? document.graph.hyperedges.find((hyperedge) => hyperedge.id === id);
    if (!item) return;
    const paths = new Set([documentSourcePath(item.data), documentEntryPath(item.data.document)]);
    window.setTimeout(() => {
      if (editingIdRef.current === id || workspaceDirectoryRef.current !== workspaceDirectory) return;
      void directoryOperationRef.current.finally(() => {
        if (editingIdRef.current === id || workspaceDirectoryRef.current !== workspaceDirectory) return;
        setFiles((current) => {
          const next = { ...current };
          paths.forEach((path) => delete next[path]);
          return next;
        });
      });
    }, 500);
  }, [document.graph.hyperedges, document.graph.points, editingId, workspaceDirectory]);

  const selectedConcept = document.graph.points.find((item) => item.id === selectedId);
  const selectedDerivation = document.graph.hyperedges.find((item) => item.id === selectedId);
  const selectedDerivationGroup = selectedDerivation ? groupByMemberId.get(selectedDerivation.id) : null;
  const formDerivation = derivationForm?.mode === 'edit'
    ? document.graph.hyperedges.find((item) => item.id === derivationForm.derivationId) ?? null
    : null;
  const selectedReplacements = selectedConcept
    ? document.view.replacements
      .filter((item) => item.replaceWith === selectedConcept.id || item.points.includes(selectedConcept.id))
      .sort((left, right) => Number(right.replaceWith === selectedConcept.id) - Number(left.replaceWith === selectedConcept.id))
    : [];
  const labelById = useMemo(
    () => new Map(document.graph.points.map((item) => [item.id, item.data.label])),
    [document.graph.points],
  );
  const editingConcept = document.graph.points.find((item) => item.id === editingId);
  const editingDerivation = document.graph.hyperedges.find((item) => item.id === editingId);
  const editingReference = editingConcept?.data ?? editingDerivation?.data;
  const editingSourcePath = editingReference ? documentSourcePath(editingReference) : null;
  const editingEntryPath = editingReference ? documentEntryPath(editingReference.document) : null;
  const editingLabel = editingConcept?.data.label ?? (editingDerivation ? `推导 ${editingDerivation.id}` : '');
  const editingReferenceTargets = useMemo<EditorReferenceTarget[]>(() => [
    ...document.graph.points.map((point) => ({
      kind: 'concept' as const,
      id: point.id,
      label: point.data.label,
      detail: point.id,
      document: point.data.document,
      searchTerms: [point.id, point.data.label],
    })),
    ...document.graph.hyperedges.map((edge) => {
      const tailLabels = edge.tails.map((id) => labelById.get(id) ?? id);
      const headLabel = labelById.get(edge.head) ?? edge.head;
      return {
        kind: 'derivation' as const,
        id: edge.id,
        label: `推导 ${edge.id}`,
        detail: `${tailLabels.length ? tailLabels.join(' + ') : '∅'} → ${headLabel}`,
        document: edge.data.document,
        searchTerms: [
          edge.id,
          ...edge.tails,
          ...tailLabels,
          edge.head,
          headLabel,
        ],
      };
    }),
  ], [document.graph.hyperedges, document.graph.points, labelById]);
  const resolveEditingImage = useCallback((source: string) => {
    if (!editingSourcePath) return Promise.reject(new Error('当前没有正在编辑的文档'));
    return resolveWorkspaceImage(workspaceDirectory, editingSourcePath, source);
  }, [editingSourcePath, workspaceDirectory]);
  const storeEditingImage = useCallback(async (file: File) => {
    if (!editingReference) throw new Error('当前没有正在编辑的文档');
    const stored = await storeWorkspaceImage(workspaceDirectory, editingReference.document, file);
    setStatus(`图片已保存到 ${editingReference.document}/${stored.source}`);
    return stored;
  }, [editingReference, workspaceDirectory]);
  const reportEditingImageError = useCallback((error: unknown) => {
    setStatus(error instanceof Error ? `图片粘贴失败：${error.message}` : '图片粘贴失败');
  }, []);
  const updateDocumentSource = useCallback((reference: { document: string; format: DocumentFormat }, content: string, title: string) => {
    setFiles((current) => storeDocumentFiles(current, reference.document, reference.format, content, title));
    commit((current) => current);
    notifyTourAction('document-edited');
  }, [commit]);

  const migrateHtmlDocument = useCallback(() => {
    if (!editingReference || editingReference.format !== 'html' || !editingSourcePath || !editingId) return;
    const format: DocumentFormat = 'markdown';
    const converted = convertDocumentContent(
      files[editingSourcePath] ?? '',
      editingReference.format,
      format,
      editingLabel,
    );
    setFiles((current) => storeDocumentFiles(current, editingReference.document, format, converted, editingLabel));
    commit((current) => ({
      ...current,
      graph: {
        points: current.graph.points.map((item) => item.id === editingId
          ? { ...item, data: { ...item.data, format } }
          : item),
        hyperedges: current.graph.hyperedges.map((item) => item.id === editingId
          ? { ...item, data: { ...item.data, format } }
          : item),
      },
    }));
    setStatus('旧版 HTML 已迁移到 Markdown');
  }, [commit, editingId, editingLabel, editingReference, editingSourcePath, files]);

  useEffect(() => {
    if (editingId && !editingConcept && !editingDerivation) setEditingId(null);
    else migrateHtmlDocument();
  }, [editingConcept, editingDerivation, editingId, migrateHtmlDocument]);

  const restoreTutorialWorkspace = useCallback(() => {
    const snapshot = tutorialWorkspaceRef.current;
    if (!snapshot) return;
    tutorialWorkspaceRef.current = null;
    workspaceDirectoryRef.current = snapshot.directory;
    workspaceRevisionRef.current = snapshot.revision;
    externalWorkspaceChangeRef.current = null;
    setExternalWorkspaceChange(null);
    setFiles(snapshot.files);
    setLayoutPositions({});
    setLayoutEpoch((current) => current + 1);
    dispatchHistory({ type: 'replace', document: snapshot.manifest });
    setWorkspaceDirectory(snapshot.directory);
    setEditingId(null);
    setRouteMode(false);
    setRouteSelection(createRouteSelection());
    clearTransientView();
    window.setTimeout(() => void fitGraph(), 20);
  }, [clearTransientView, fitGraph]);

  const openBundledTutorialWorkspace = useCallback((workspace: AuthoringWorkspace, message: string, initialSelectedId: string | null) => {
    if (tutorialWorkspaceRef.current) return;
    tutorialWorkspaceRef.current = {
      manifest: document,
      files,
      directory: workspaceDirectory,
      revision: workspaceRevisionRef.current,
    };
    const example = workspace.manifest;
    workspaceDirectoryRef.current = null;
    workspaceRevisionRef.current = null;
    externalWorkspaceChangeRef.current = null;
    setExternalWorkspaceChange(null);
    setWorkspaceDirectory(null);
    setFiles(workspace.files);
    setLayoutPositions({});
    setLayoutEpoch((current) => current + 1);
    dispatchHistory({ type: 'replace', document: example });
    setEditingId(null);
    setRouteMode(false);
    setRouteSelection(createRouteSelection());
    clearTransientView();
    setSelectedId(initialSelectedId);
    setStatus(message);
    window.setTimeout(() => void fitGraph(), 20);
  }, [clearTransientView, document, files, fitGraph, workspaceDirectory]);

  const openTutorialExample = useCallback(() => {
    openBundledTutorialWorkspace(
      navigationSampleWorkspace,
      '已临时打开 math-reforged 教学项目',
      null,
    );
  }, [openBundledTutorialWorkspace]);

  const openGraphTutorialExample = useCallback((withReplacement = false) => {
    openBundledTutorialWorkspace(
      withReplacement ? graphTutorialWorkspaceWithReplacement : graphTutorialWorkspace,
      '已临时打开线性代数图模型案例',
      'linear-map',
    );
  }, [openBundledTutorialWorkspace]);

  const ensureGraphTutorialStage = useCallback((stage: GraphTutorialStage): AuthoringDocument => {
    if (tutorialWorkspaceRef.current && graphTutorialStageSatisfied(document, stage)) return document;
    const workspace = graphTutorialWorkspaceForStage(stage);
    if (!tutorialWorkspaceRef.current) {
      openBundledTutorialWorkspace(workspace, '已临时打开线性代数图模型案例', 'linear-map');
      return workspace.manifest;
    }
    setFiles(workspace.files);
    setLayoutPositions({});
    setLayoutEpoch((current) => current + 1);
    dispatchHistory({ type: 'replace', document: workspace.manifest });
    setEditingId(null);
    setRouteMode(false);
    setRouteSelection(createRouteSelection());
    clearTransientView();
    setSelectedId('linear-map');
    setStatus('已恢复当前教程步骤');
    return workspace.manifest;
  }, [clearTransientView, document, openBundledTutorialWorkspace]);

  const prepareTourStep = useCallback(async (preparation: TourPreparation, stepId?: string) => {
    const selectedConcept = document.graph.points.find((point) => point.id === selectedId);
    const selectedDerivation = document.graph.hyperedges.find((item) => item.id === selectedId);
    const concept = selectedConcept ?? document.graph.points.at(-1) ?? document.graph.points[0];
    const derivation = selectedDerivation ?? document.graph.hyperedges.at(-1);

    if (preparation.startsWith('open-route-example')) {
      openTutorialExample();
      setEditingId(null);
      setFocusedId(null);
      setSelectedId(null);
      setRouteError(null);

      const startPointIds = preparation === 'open-route-example-with-start'
        || preparation === 'open-route-example-with-start-and-target'
        || preparation === 'open-route-example-with-result'
        ? ['linear-map']
        : [];
      const targetPointIds = preparation === 'open-route-example-with-start-and-target'
        || preparation === 'open-route-example-with-result'
        ? ['invertible']
        : [];
      const selection = { startPointIds, targetPointIds, result: null };
      setRouteMode(preparation !== 'open-route-example');
      setRouteSelection(selection);

      if (preparation === 'open-route-example-with-result') {
        try {
          const result = await solveWorkspaceRoute(navigationSampleWorkspace.manifest, selection);
          const resultMemberIds = new Set(result.hyperedgeIds);
          const active = Object.fromEntries(groupHyperedges(navigationSampleWorkspace.manifest.graph.hyperedges)
            .flatMap((group) => {
              const member = group.members.find((item) => resultMemberIds.has(item.id));
              return member ? [[group.key, member.id]] : [];
            }));
          setActiveDerivationByGroup((current) => ({ ...current, ...active }));
          setRouteSelection({ ...selection, result });
          setStatus(result.provenOptimal ? '已找到并证明最优路线' : '已找到当前最佳路线');
        } catch (error) {
          setRouteError(error instanceof Error ? error.message : String(error));
        }
      }
      return;
    }

    if (preparation.startsWith('open-graph-example')) {
      const stageByPreparation: Partial<Record<TourPreparation, GraphTutorialStage>> = {
        'open-graph-example-stage-base': 'base',
        'open-graph-example-stage-invertible-single': 'invertible-single',
        'open-graph-example-stage-invertible-complete': 'invertible-complete',
        'open-graph-example-stage-surjective-parallel': 'surjective-parallel',
        'open-graph-example-stage-null-space-updated': 'null-space-updated',
      };
      const stage = stageByPreparation[preparation];
      const preparedDocument = stage
        ? ensureGraphTutorialStage(stage)
        : (openGraphTutorialExample(preparation === 'open-graph-example-with-replacement'), document);
      setEditingId(null);
      setRouteMode(false);
      setFocusedId(null);

      if (preparation === 'open-graph-example-and-select-concept') {
        setSelectedId('linear-map');
      } else if (preparation === 'open-graph-example-and-open-concept-document') {
        setSelectedId('linear-map');
        setEditingId('linear-map');
      } else if (preparation === 'open-graph-example-and-select-derivation') {
        setSelectedId('null-space-def');
        setActiveDerivationByGroup((current) => ({
          ...current,
          [hyperedgeGroupKey({ tails: ['linear-map'], head: 'null-range' })]: 'null-space-def',
        }));
      } else if (preparation === 'open-graph-example-and-open-derivation-document') {
        setSelectedId('null-space-def');
        setEditingId('null-space-def');
      } else if (preparation === 'open-graph-example-and-select-parallel-derivation') {
        const parallelIds = ['null-space-def', 'null-space-equations'];
        const currentId = selectedId && parallelIds.includes(selectedId) ? selectedId : 'null-space-def';
        setSelectedId(currentId);
        setActiveDerivationByGroup((current) => ({
          ...current,
          [hyperedgeGroupKey({ tails: ['linear-map'], head: 'null-range' })]: currentId,
        }));
      } else if (preparation === 'open-graph-example-and-select-replacement-points') {
        const points = ['injective-surjective', 'surjective'];
        setSelectedNodeIds(points);
        setSelectedId(points[0]);
        setReplacementDraft(null);
      } else if (preparation === 'open-graph-example-and-prepare-replacement') {
        const points = ['injective-surjective', 'surjective'];
        setSelectedNodeIds(points);
        setSelectedId(points[0]);
        setReplacementDraft(points);
      } else if (preparation === 'open-graph-example-with-replacement') {
        setSelectedNodeIds([]);
        setSelectedId('injective-surjective');
        setReplacementDraft(null);
      } else if (stage) {
        if (stepId === 'open-derivation-document') {
          setSelectedId('null-space-def');
          setActiveDerivationByGroup((current) => ({
            ...current,
            [hyperedgeGroupKey({ tails: ['linear-map'], head: 'null-range' })]: 'null-space-def',
          }));
        } else if (stepId === 'understand-derivation-document' || stepId === 'return-from-derivation') {
          setSelectedId('null-space-def');
          setEditingId('null-space-def');
        } else if (stepId === 'complete-invertible-premises') {
          const edge = preparedDocument.graph.hyperedges.find((item) =>
            hasExactEndpoints(item, ['injective-surjective'], 'invertible'),
          );
          if (edge) {
            setSelectedId(edge.id);
            setActiveDerivationByGroup((current) => ({
              ...current,
              [hyperedgeGroupKey(edge)]: edge.id,
            }));
          }
        } else if (stepId === 'parallel' || stepId === 'parallel-select') {
          const edge = [...preparedDocument.graph.hyperedges].reverse().find((item) =>
            item.id !== 'surjective-def' && hasExactEndpoints(item, ['linear-map'], 'surjective'),
          ) ?? preparedDocument.graph.hyperedges.find((item) => item.id === 'surjective-def');
          if (edge) {
            setSelectedId(edge.id);
            setActiveDerivationByGroup((current) => ({
              ...current,
              [hyperedgeGroupKey(edge)]: edge.id,
            }));
          }
        } else if (stepId === 'weight') {
          setSelectedId('surjective-def');
          setActiveDerivationByGroup((current) => ({
            ...current,
            [hyperedgeGroupKey({ tails: ['linear-map'], head: 'surjective' })]: 'surjective-def',
          }));
        } else if (stepId === 'more-premises' || stepId === 'active-member-result') {
          setSelectedId('null-space-def');
          setActiveDerivationByGroup((current) => ({
            ...current,
            [hyperedgeGroupKey({ tails: stepId === 'more-premises' ? ['linear-map'] : ['linear-map', 'subspace'], head: 'null-range' })]: 'null-space-def',
          }));
        }
      }
      return;
    }

    if (preparation === 'show-canvas') {
      setEditingId(null);
      setRouteMode(false);
      return;
    }
    if (preparation === 'show-project-overview') {
      setEditingId(null);
      setRouteMode(false);
      setFocusedId(null);
      setSelectedId(null);
      return;
    }
    if (preparation === 'select-concept') {
      setEditingId(null);
      setRouteMode(false);
      setFocusedId(null);
      if (concept) setSelectedId(concept.id);
      return;
    }
    if (preparation === 'select-derivation') {
      setEditingId(null);
      setRouteMode(false);
      setFocusedId(null);
      if (derivation) setSelectedId(derivation.id);
      return;
    }
    if (preparation === 'select-parallel-derivation') {
      const parallelDerivation = derivationGroups.find((group) => group.members.length > 1)?.members[0];
      setEditingId(null);
      setRouteMode(false);
      setFocusedId(null);
      if (parallelDerivation) setSelectedId(parallelDerivation.id);
      return;
    }
    if (preparation === 'open-selected-document') {
      if (concept) {
        setRouteMode(false);
        setFocusedId(null);
        setSelectedId(concept.id);
        openDocument(concept.id, false);
      }
      return;
    }
    if (preparation === 'open-selected-derivation-document') {
      if (derivation) {
        setRouteMode(false);
        setFocusedId(null);
        setSelectedId(derivation.id);
        openDocument(derivation.id, false);
      }
      return;
    }
    openTutorialExample();
    setEditingId(null);
    setRouteMode(false);
    setFocusedId(null);
    if (preparation === 'open-navigation-example-and-select-concept') {
      setSelectedId(navigationSampleWorkspace.manifest.graph.points[0]?.id ?? null);
    }
  }, [derivationGroups, document, ensureGraphTutorialStage, openDocument, openGraphTutorialExample, openTutorialExample, selectedId]);

  const layoutReady = useMemo(() => [
    ...document.graph.points.map((point) => point.id),
    ...document.graph.hyperedges.map((edge) => edge.id),
  ].every((id) => !!layoutPositions[id]), [document.graph.hyperedges, document.graph.points, layoutPositions]);
  const layoutModeLabel = LAYOUT_MODES.find((item) => item.mode === layoutMode)?.label ?? '自动';
  const layoutActionLabel = layoutRunning
    ? '正在自动布局'
    : layoutMode === 'auto' ? '自动布局' : `使用 ${layoutModeLabel} 重新布局`;

  return (
    <main
      className="app-shell"
      data-layout-ready={layoutReady ? 'true' : 'false'}
      data-layout-running={layoutRunning ? 'true' : 'false'}
      data-layout-requests={layoutRequestCount}
      data-layout-mode={layoutMode}
    >
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">D</span>
          <input
            className="document-title"
            value={document.document.title}
            aria-label="文档标题"
            {...tourTarget(TOUR_FEATURES.projectTitle)}
            onChange={(event) => {
              const title = event.target.value;
              commit((current) => ({ ...current, document: { ...current.document, title } }));
              if (title.trim() && title.trim() !== '未命名项目') notifyTourAction('project-title-edited');
            }}
          />
        </div>
        <div className={`search-cluster ${editingId ? 'is-hidden' : ''}`}>
          <ConceptSearch
            points={document.graph.points}
            value={search}
            tourFeatureId={TOUR_FEATURES.search.id}
            onChange={setSearch}
            onSelect={findConcept}
            onSubmit={() => findConcept()}
          />
          <a
            className="github-link"
            href="https://github.com/derivon-research/derivon-mindmap"
            target="_blank"
            rel="noreferrer"
            title="查看 GitHub 仓库"
            aria-label="查看 GitHub 仓库"
          >
            <Github size={17} />
          </a>
        </div>
        <div className="toolbar" aria-label="文档工具栏">
          {editingId ? (
            <>
              <button type="button" title="返回画布" {...tourTarget(TOUR_FEATURES.returnCanvas)} onClick={returnToCanvas}><ArrowLeft size={18} /></button>
              <button type="button" title="操作引导" aria-label="操作引导" {...tourTarget(TOUR_FEATURES.help)} onClick={() => { setTourStart(null); setTourOpen(true); }}><CircleHelp size={17} /></button>
            </>
          ) : (
            <>
              <button type="button" title="新建概念" disabled={!!derivationForm} {...tourTarget(TOUR_FEATURES.addConcept)} onClick={() => addConcept()}><Plus size={18} /></button>
              <button
                type="button"
                title="新建推导"
                aria-label="新建推导"
                disabled={!!derivationForm}
                {...tourTarget(TOUR_FEATURES.newDerivation)}
                onClick={openCreateDerivationForm}
              >
                <GitBranch size={17} />
              </button>
              <button
                type="button"
                className={replacementDraft ? 'is-active' : ''}
                {...tourTarget(TOUR_FEATURES.replaceWith)}
                title={replacementDraft ? '取消替换' : '替换'}
                disabled={!!derivationForm || (!replacementDraft && selectedNodeIds.length === 0)}
                onClick={beginReplacement}
              >
                {replacementDraft ? <X size={17} /> : <Replace size={17} />}
              </button>
              <div className="layout-control" ref={layoutControlRef}>
                <button
                  type="button"
                  className={layoutMode !== 'auto' ? 'is-active' : ''}
                  title={layoutActionLabel}
                  aria-label={layoutActionLabel}
                  disabled={layoutRunning || !!derivationForm}
                  {...tourTarget(TOUR_FEATURES.autoLayout)}
                  onClick={applyLayout}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  type="button"
                  className="layout-menu-trigger"
                  title="选择布局算法"
                  aria-label="选择布局算法"
                  aria-haspopup="menu"
                  aria-expanded={layoutMenuOpen}
                  disabled={layoutRunning || !!derivationForm}
                  onClick={() => setLayoutMenuOpen((open) => !open)}
                >
                  <ChevronDown size={12} />
                </button>
                {layoutMenuOpen && (
                  <div className="layout-menu" role="menu" aria-label="布局算法">
                    {LAYOUT_MODES.map((item) => (
                      <button
                        key={item.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={layoutMode === item.mode}
                        onClick={() => {
                          setLayoutMenuOpen(false);
                          if (layoutMode === item.mode) applyLayout();
                          else setLayoutMode(item.mode);
                        }}
                      >
                        <span className="layout-menu-check">{layoutMode === item.mode && <Check size={13} />}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={focusedId ? 'is-active' : ''}
                {...tourTarget(TOUR_FEATURES.focusedView)}
                title={focusedId ? '关闭局部视图' : '开启局部视图'}
                disabled={!selectedId || !!replacementDraft || layoutRunning || !!derivationForm}
                onClick={toggleFocusedView}
              >
                {focusedId ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
              <button
                type="button"
                className={routeMode ? 'is-active' : ''}
                {...tourTarget(TOUR_FEATURES.routeMode)}
                title={routeMode ? '关闭路线模式' : '打开路线模式'}
                aria-label={routeMode ? '关闭路线模式' : '打开路线模式'}
                disabled={!!derivationForm}
                onClick={toggleRouteMode}
              >
                <Milestone size={17} />
              </button>
              <span className="toolbar-divider" />
              <button type="button" title="连接工作区文件夹" disabled={!!derivationForm} {...tourTarget(TOUR_FEATURES.openWorkspace)} onClick={() => void connectWorkspace()}><FolderOpen size={17} /></button>
              <button type="button" title="在新文件夹创建空项目" disabled={!!derivationForm} {...tourTarget(TOUR_FEATURES.newWorkspace)} onClick={() => void createWorkspaceInNewDirectory()}><FolderPlus size={17} /></button>
              <button type="button" title="另存到新文件夹" disabled={!!derivationForm} onClick={() => void saveWorkspaceAs()}><Save size={17} /></button>
              <button type="button" title="编辑工作区 JSON" disabled={!!derivationForm} {...tourTarget(TOUR_FEATURES.workspaceJson)} onClick={openJsonEditor}><Braces size={17} /></button>
              <button type="button" title="导入旧版 JSON" disabled={!!derivationForm} onClick={() => fileInput.current?.click()}><FileUp size={17} /></button>
              <button type="button" title="操作引导" aria-label="操作引导" disabled={!!derivationForm} {...tourTarget(TOUR_FEATURES.help)} onClick={() => { setTourStart(null); setTourOpen(true); }}><CircleHelp size={17} /></button>
            </>
          )}
          <input ref={fileInput} hidden type="file" accept=".json,.derivon.json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }} />
        </div>
      </header>

      {editingId && editingReference && editingSourcePath && editingEntryPath ? (
        <section className="document-workspace">
          <div className="document-editor-main" {...tourTarget(TOUR_FEATURES.documentWorkspace)}>
            <DocumentEditor
              key={editingId}
              label={editingLabel}
              value={files[editingSourcePath] ?? ''}
              currentId={editingId}
              documentPath={editingSourcePath}
              referenceTargets={editingReferenceTargets}
              onOpenReference={openDocument}
              resolveImage={resolveEditingImage}
              storeImage={storeEditingImage}
              onImageError={reportEditingImageError}
              onChange={(content) => updateDocumentSource(editingReference, content, editingLabel)}
            />
          </div>
          <aside className="editor-context">
            <div className="inspector-heading">
              <div>
                <span className="eyebrow">{editingConcept ? '概念文档' : '推导文档'}</span>
                <strong>{editingId}</strong>
              </div>
              <button type="button" title="返回画布" onClick={returnToCanvas}><ArrowLeft size={17} /></button>
            </div>
            {editingConcept && (
              <label>名称<input value={editingConcept.data.label} {...tourTarget(TOUR_FEATURES.conceptName)} onChange={(event) => updateConceptName(editingConcept.id, event.target.value)} /></label>
            )}
            {editingDerivation && (
              <>
                <div className="endpoint-block">
                  <span className="field-title">前提集合</span>
                  <div className="chips">
                    {editingDerivation.tails.length === 0 && <span className="empty-tail">空集 ∅</span>}
                    {editingDerivation.tails.map((id) => <span className="chip is-static" key={id}>{labelById.get(id) ?? id}</span>)}
                  </div>
                  <span className="field-title">结论</span>
                  <span className="conclusion-label">{labelById.get(editingDerivation.head) ?? editingDerivation.head}</span>
                </div>
                <label className="weight-field">成本权重<input type="number" min="0" step="0.1" value={formatWeight(editingDerivation.weight)} {...tourTarget(TOUR_FEATURES.derivationWeight)} onChange={(event) => updateDerivationWeight(editingDerivation.id, event.target.value)} /></label>
              </>
            )}
            <div className="workspace-file">
              <span className="field-title">文档目录</span>
              <code>{editingReference.document}/</code>
              <span className="field-title">访问入口</span>
              <code>{editingEntryPath}</code>
              <code>{editingSourcePath}</code>
              <span>{workspaceDirectory ? `${workspaceDirectory.name}/` : '未打开项目文件夹'}</span>
              {status && <span className="editor-save-status" role="status">{status}</span>}
            </div>
          </aside>
        </section>
      ) : (
      <section className="workspace">
        <div
          className={`canvas-wrap ${replacementDraft ? 'is-replacing' : ''} ${derivationForm ? 'is-authoring-derivation' : ''} ${canvasInteracting ? 'is-interacting' : ''}`}
          {...tourTarget(TOUR_FEATURES.canvas)}
        >
          <Suspense fallback={<div className="graph-renderer-loading" role="status" aria-label="正在加载图画布" />}>
            <G6GraphSurface
              ref={graphSurfaceRef}
              runtime={graphSceneRuntime}
              onNodeHover={handleG6NodeHover}
              onNodeClick={handleG6NodeClick}
              onNodeContextMenu={handleG6NodeContextMenu}
              onNodeDragEnd={handleG6NodeDragEnd}
              onConnect={handleG6Connect}
              onMarqueeSelect={handleG6MarqueeSelect}
              onPaneClick={clearCanvasSelection}
              onInteractionChange={handleG6InteractionChange}
              onReplacementModeChange={setReplacementMode}
              replacementControlsDisabled={!!derivationForm || routeMode || !!replacementDraft}
              fitViewIds={focusedSceneNodeIds}
              onError={(error) => reportWorkspaceError('渲染 G6 知识图', error)}
            />
          </Suspense>
          {!layoutReady && <div className="graph-renderer-loading" role="status" aria-label="正在自动布局" />}
          <div className="history-controls" role="group" aria-label="历史操作" {...tourTarget(TOUR_FEATURES.history)}>
            <button type="button" aria-label="撤回" title="撤回 (Ctrl/Cmd+Z)" disabled={!history.past.length} onClick={undo}>
              <RotateCcw size={16} />
            </button>
            <button type="button" aria-label="重做" title="重做 (Ctrl/Cmd+Shift+Z)" disabled={!history.future.length} onClick={redo}>
              <RotateCw size={16} />
            </button>
          </div>
          <div className="legend" aria-label="图例">
            <span><i className="legend-concept" />概念</span>
            <span><i className="legend-replacement-member" />替换成员</span>
            <span><i className="legend-replacement-result" />替换结果</span>
            <span><i className="legend-derivation" />推导</span>
            <span><i className="legend-premise" />前提</span>
            <span><i className="legend-conclusion" />结论</span>
          </div>
          {status && <div className="status-toast" role="status">{status}</div>}
        </div>

        {derivationForm ? (
          <DerivationForm
            key={derivationForm.mode === 'create' ? 'create-derivation' : `edit-${derivationForm.derivationId}`}
            mode={derivationForm.mode}
            derivationId={formDerivation?.id}
            points={document.graph.points}
            visibleIds={projection.visibleIds}
            initial={formDerivation
              ? { tails: formDerivation.tails, head: formDerivation.head, weight: formDerivation.weight }
              : { tails: [], head: null, weight: 1 }}
            onSubmit={submitDerivationForm}
            onCancel={closeDerivationForm}
          />
        ) : routeMode ? (
          <RoutePanel
            document={document}
            selection={routeSelection}
            solving={routeSolving}
            error={routeError}
            onToggleStart={toggleStartPoint}
            onToggleTarget={toggleTargetPoint}
            onSolve={runRouteSolve}
            onClear={clearRoute}
            onClose={() => setRouteMode(false)}
          />
        ) : <aside className="inspector">
          {selectedConcept ? (
            <>
              <div className="inspector-heading">
                <div><span className="eyebrow">概念</span><strong>{selectedConcept.id}</strong></div>
                <button type="button" title="删除概念" {...tourTarget(TOUR_FEATURES.deleteItem)} onClick={() => requestDelete(selectedConcept.id)}><Trash2 size={16} /></button>
              </div>
              <label>名称<input value={selectedConcept.data.label} {...tourTarget(TOUR_FEATURES.conceptName)} onChange={(event) => updateConceptName(selectedConcept.id, event.target.value)} /></label>
              <button className="open-document-button" type="button" {...tourTarget(TOUR_FEATURES.openDocument)} onClick={() => openDocument(selectedConcept.id)}>
                <FileText size={16} />
                <span>编辑文档</span>
              </button>
              <code className="document-path">{selectedConcept.data.document}/index.html</code>
              {selectedReplacements.map((replacement) => {
                const mode: ReplacementViewMode = detachedReplacementIdSet.has(replacement.replaceWith)
                  ? 'compare'
                  : replacement.show;
                const role = replacement.replaceWith === selectedConcept.id ? '作为替换结果' : '作为替换成员';
                return (
                  <div className="replacement-definition" key={replacement.replaceWith}>
                    <div className="replacement-definition-heading">
                      <span>{role}</span>
                      <button className="replacement-unlink" type="button" title="解除替换关系" aria-label={`解除 ${replacement.replaceWith} 替换关系`} onClick={() => removeReplacement(replacement.replaceWith)}><Unlink size={13} /></button>
                    </div>
                    <div className="replacement-expression">
                      <span>{replacement.points.join(' + ')}</span>
                      <strong>→</strong>
                      <span>{replacement.replaceWith}</span>
                    </div>
                    <div className="replacement-segment" role="group" aria-label={`${replacement.replaceWith} 显示方式`} {...tourTarget(TOUR_FEATURES.replacementToggle)}>
                      <button type="button" className={mode === 'points' ? 'is-active' : ''} onClick={() => setReplacementMode(replacement.replaceWith, 'points')}>原概念</button>
                      <button type="button" className={mode === 'replacement' ? 'is-active' : ''} onClick={() => setReplacementMode(replacement.replaceWith, 'replacement')}>替换概念</button>
                      <button type="button" className={mode === 'compare' ? 'is-active' : ''} onClick={() => setReplacementMode(replacement.replaceWith, 'compare')}>对照</button>
                    </div>
                  </div>
                );
              })}
              <div className="relation-summary">
                <span>作为前提 {document.graph.hyperedges.filter((item) => item.tails.includes(selectedConcept.id)).length}</span>
                <span>作为结论 {document.graph.hyperedges.filter((item) => item.head === selectedConcept.id).length}</span>
              </div>
            </>
          ) : selectedDerivation ? (
            <>
              <div className="inspector-heading">
                <div><span className="eyebrow">推导步骤</span><strong>{selectedDerivation.id}</strong></div>
                <button type="button" title="删除推导" {...tourTarget(TOUR_FEATURES.deleteItem)} onClick={() => requestDelete(selectedDerivation.id)}><Trash2 size={16} /></button>
              </div>
              {selectedDerivationGroup && selectedDerivationGroup.members.length > 1 && (
                <div className="derivation-alternatives">
                  <span>该推导路径有 {selectedDerivationGroup.members.length} 种方式实现</span>
                  <select
                    aria-label="查看推导方式"
                    value={selectedDerivation.id}
                    onChange={(event) => selectDerivation(selectedDerivationGroup, event.target.value)}
                  >
                    {selectedDerivationGroup.members.map((member, index) => (
                      <option value={member.id} key={member.id}>
                        {index + 1}/{selectedDerivationGroup.members.length} · 成本 {formatWeight(member.weight)} · {member.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="endpoint-block">
                <span className="field-title">前提集合</span>
                <div className="chips">
                  {selectedDerivation.tails.length === 0 && <span className="empty-tail">空集 ∅</span>}
                  {selectedDerivation.tails.map((id) => (
                    <span className="chip is-static" key={id}>{labelById.get(id) ?? id}</span>
                  ))}
                </div>
                <span className="field-title">结论</span>
                <span className="conclusion-label">{labelById.get(selectedDerivation.head) ?? selectedDerivation.head}</span>
                <button className="edit-endpoints-button" type="button" onClick={() => openEditDerivationForm(selectedDerivation.id)}>
                  <GitBranch size={14} />
                  <span>编辑前提与结论</span>
                </button>
              </div>
              <button className="open-document-button" type="button" {...tourTarget(TOUR_FEATURES.openDocument)} onClick={() => openDocument(selectedDerivation.id)}>
                <FileText size={16} />
                <span>编辑文档</span>
              </button>
              <code className="document-path">{selectedDerivation.data.document}/index.html</code>
              <label className="weight-field">成本权重<input type="number" min="0" step="0.1" value={formatWeight(selectedDerivation.weight)} {...tourTarget(TOUR_FEATURES.derivationWeight)} onChange={(event) => updateDerivationWeight(selectedDerivation.id, event.target.value)} /></label>
            </>
          ) : (
            <>
              <div className="inspector-heading">
                <div>
                  <span className="eyebrow">Graph</span>
                  <strong className="workspace-directory-name" title={workspaceDirectory ? `${workspaceDirectory.name}/` : '未打开项目文件夹'}>
                    {workspaceDirectory ? `${workspaceDirectory.name}/` : '未打开项目文件夹'}
                  </strong>
                </div>
              </div>
              <label>说明<textarea value={document.document.description} {...tourTarget(TOUR_FEATURES.projectDescription)} onChange={(event) => {
                const description = event.target.value;
                commit((current) => ({ ...current, document: { ...current.document, description } }));
                if (description.trim()) notifyTourAction('project-description-edited');
              }} /></label>
              <div className="document-stats">
                <div><strong>{document.graph.points.length}</strong><span>概念</span></div>
                <div><strong>{document.graph.hyperedges.length}</strong><span>推导</span></div>
                <div><strong>{document.view.replacements.length}</strong><span>替换关系</span></div>
              </div>
              <div className="schema-note"><code>T(h) → y</code></div>
            </>
          )}
        </aside>}
      </section>
      )}

      {crashReport && (
        <div className="modal-backdrop crash-report-backdrop" role="presentation">
          <section className="workspace-error-modal crash-report-modal" role="alertdialog" aria-modal="true" aria-labelledby="crash-report-title" aria-describedby="crash-report-summary">
            <header>
              <div>
                <span className="eyebrow">崩溃报告</span>
                <strong id="crash-report-title">检测到应用异常</strong>
              </div>
              <button type="button" title="关闭" onClick={() => setCrashReport(null)}><X size={18} /></button>
            </header>
            <p id="crash-report-summary">报告仅保存在本机，不会自动上传。复制后可将其附在 GitHub issue 中。</p>
            <pre tabIndex={0}>{crashReport}</pre>
            <footer>
              <button type="button" className="text-button" onClick={() => {
                void clearPendingCrashReports().then(() => {
                  setCrashReport(null);
                  setCrashReportCopied(false);
                }).catch((error: unknown) => {
                  setStatus(error instanceof Error ? `清除报告失败：${error.message}` : '清除报告失败');
                });
              }}>清除报告</button>
              <button type="button" className="primary-button" onClick={() => {
                void navigator.clipboard.writeText(crashReport).then(() => {
                  setCrashReportCopied(true);
                }).catch((error: unknown) => {
                  setStatus(error instanceof Error ? `复制失败：${error.message}` : '复制失败，请手动选择报告详情');
                });
              }}><Copy size={14} />{crashReportCopied ? '已复制' : '复制报告'}</button>
            </footer>
          </section>
        </div>
      )}

      {workspaceError && !crashReport && (
        <div className="modal-backdrop workspace-error-backdrop" role="presentation">
          <section className="workspace-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="workspace-error-title" aria-describedby="workspace-error-summary">
            <header>
              <div>
                <span className="eyebrow">项目文件夹错误</span>
                <strong id="workspace-error-title">{workspaceError.title}</strong>
              </div>
              <button type="button" title="关闭" onClick={() => setWorkspaceError(null)}><X size={18} /></button>
            </header>
            <p id="workspace-error-summary">{workspaceError.summary}</p>
            <pre tabIndex={0}>{workspaceError.details}</pre>
            <footer>
              <button type="button" className="text-button" onClick={() => setWorkspaceError(null)}>关闭</button>
              <button type="button" className="primary-button" onClick={() => {
                void navigator.clipboard.writeText(workspaceError.details).then(() => {
                  setWorkspaceErrorCopied(true);
                }).catch((error: unknown) => {
                  setStatus(error instanceof Error ? `复制失败：${error.message}` : '复制失败，请手动选择错误详情');
                });
              }}><Copy size={14} />{workspaceErrorCopied ? '已复制' : '复制错误'}</button>
            </footer>
          </section>
        </div>
      )}

      {pendingWorkspaceUpgrade?.migrationSource && !workspaceError && !crashReport && (
        <div className="modal-backdrop workspace-conflict-backdrop" role="presentation">
          <section className="workspace-conflict-modal schema-upgrade-modal" role="alertdialog" aria-modal="true" aria-labelledby="schema-upgrade-title" aria-describedby="schema-upgrade-description">
            <header>
              <div>
                <span className="eyebrow">工作区 schema 落后一个版本</span>
                <strong id="schema-upgrade-title">{pendingWorkspaceUpgrade.handle.name}/</strong>
              </div>
            </header>
            <p id="schema-upgrade-description">
              当前为 <code>{pendingWorkspaceUpgrade.migrationSource}</code>，可自动升级到 <code>{DOCUMENT_SCHEMA}</code>。
              升级会移除旧时间戳和运行时坐标；确认前不会修改 <code>{WORKSPACE_MANIFEST}</code>。
            </p>
            <footer>
              <button type="button" className="text-button" disabled={upgradingWorkspace} onClick={() => {
                setPendingWorkspaceUpgrade(null);
                setStatus('已取消打开，工作区文件未更改');
              }}>取消</button>
              <button type="button" className="primary-button" disabled={upgradingWorkspace} onClick={() => void confirmWorkspaceUpgrade()}>
                <ArrowUpCircle size={15} />
                {upgradingWorkspace ? '正在升级' : '升级并打开'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {externalWorkspaceChange && workspaceDirectory && (
        <div className="modal-backdrop workspace-conflict-backdrop" role="presentation">
          <section className="workspace-conflict-modal" role="alertdialog" aria-modal="true" aria-labelledby="workspace-conflict-title" aria-describedby="workspace-conflict-description">
            <header>
              <div>
                <span className="eyebrow">项目文件夹已更改</span>
                <strong id="workspace-conflict-title">{workspaceDirectory.name}/</strong>
              </div>
            </header>
            <p id="workspace-conflict-description">
              WebUI 外部的程序修改了项目文件。自动保存已暂停，请选择要保留的版本。
            </p>
            <footer>
              <button type="button" className="text-button" disabled={resolvingExternalChange} onClick={keepWebUiWorkspaceChange}>忽视文件夹更改，保留 WebUI 版本</button>
              <button type="button" className="primary-button" disabled={resolvingExternalChange} onClick={adoptExternalWorkspaceChange}>采用文件夹更改</button>
            </footer>
          </section>
        </div>
      )}

      {deleteCandidate && (
        <div className="modal-backdrop delete-confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteCandidate(null)}>
          <section className="delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
            <header>
              <strong id="delete-confirm-title">{deleteCandidate.kind === 'concept' ? '删除概念' : '删除推导'}</strong>
              <button type="button" title="关闭" onClick={() => setDeleteCandidate(null)}><X size={18} /></button>
            </header>
            <p id="delete-confirm-description">
              {deleteCandidate.kind === 'concept' ? (
                <>将删除 <strong>{deleteCandidate.label}</strong> 概念以及相关的 <strong>{deleteCandidate.derivationCount}</strong> 个推导。</>
              ) : (
                <>将删除 <strong>{deleteCandidate.label}</strong> 推导。</>
              )}
            </p>
            <footer>
              <button type="button" className="text-button" onClick={() => setDeleteCandidate(null)}>取消</button>
              <button ref={confirmDeleteButton} type="button" className="danger-button" onClick={confirmDelete}>删除</button>
            </footer>
          </section>
        </div>
      )}

      {jsonOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setJsonOpen(false)}>
          <section className={`json-modal${jsonMigrationSource ? ' has-schema-upgrade' : ''}`} role="dialog" aria-modal="true" aria-label="原始 JSON 编辑器" {...tourTarget(TOUR_FEATURES.jsonEditor)}>
            <header><div><span className="eyebrow">{WORKSPACE_MANIFEST}</span><strong>{document.schema}</strong></div><button type="button" title="关闭" onClick={() => setJsonOpen(false)}><X size={18} /></button></header>
            {jsonMigrationSource && (
              <div className="schema-upgrade-notice" role="status">
                <ArrowUpCircle size={17} />
                <span><strong>{jsonMigrationSource}</strong> 落后一个版本，应用时会自动升级到 <strong>{DOCUMENT_SCHEMA}</strong>，并移除旧时间戳和运行时坐标。</span>
              </div>
            )}
            <textarea spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
            <footer><button type="button" className="text-button" onClick={() => {
              try {
                setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
              } catch {
                setStatus('JSON 语法无效');
              }
            }}>格式化</button><button type="button" className="primary-button" onClick={() => void applyJson()}>{jsonMigrationSource ? '升级并应用' : '检查并应用'}</button></footer>
          </section>
        </div>
      )}

      <GuidedTour
        open={tourOpen}
        startTour={tourStart}
        currentSurface={editingId ? 'editor' : 'canvas'}
        onClose={() => setTourOpen(false)}
        onTourStart={(tourId) => {
          setTourStart(null);
          if (tourId === 'navigation') openTutorialExample();
        }}
        onTourEnd={restoreTutorialWorkspace}
        onStepComplete={(tourId, stepId) => {
          if (tourId === 'graph' && stepId === 'create-derivation-drag') {
            tutorialFitAfterLayoutRef.current = true;
          }
        }}
        onPrepareStep={prepareTourStep}
      />
    </main>
  );
}

export default function App() {
  return <AuthoringCanvas />;
}

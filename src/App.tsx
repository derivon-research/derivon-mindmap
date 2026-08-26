import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type OnSelectionChangeParams,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import {
  ArrowLeft,
  Braces,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  FolderOpen,
  FolderPlus,
  Github,
  LayoutGrid,
  Milestone,
  Plus,
  Replace,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import {
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
import { ConceptNode, DerivationNode, type AuthoringFlowNode } from './GraphNodes';
import { activeHyperedge, groupHyperedges, hyperedgeGroupKey, type HyperedgeGroup } from './hyperedgeGroups';
import { layoutDocument, layoutNeighborhood } from './layout';
import { DocumentEditor } from './DocumentEditor';
import { convertDocumentContent } from './documentContent';
import { projectDocument } from './projection';
import { replacementFromSelection } from './replacements';
import { RoutePanel } from './RoutePanel';
import {
  createRouteSelection,
  invalidateRoute,
  routeHighlightIds,
  setRouteTarget,
  solveWorkspaceRoute,
  toggleRouteStart,
  type RouteSelection,
} from './route';
import { createEmptyWorkspace, sampleWorkspace } from './sample';
import {
  GuidedTour,
  ONBOARDING_STORAGE_KEY,
  TOUR_FEATURES,
  notifyTourAction,
  tourTarget,
} from './onboarding';
import {
  LOCAL_WORKSPACE_KEY,
  WORKSPACE_MANIFEST,
  chooseWorkspaceDirectory,
  conceptTemplate,
  createDocumentDirectory,
  derivationTemplate,
  documentEntryPath,
  documentSourcePath,
  importManifest,
  loadLocalWorkspace,
  readWorkspaceDirectorySnapshot,
  readWorkspaceDocumentSource,
  saveWorkspaceAsDirectory,
  storeDocumentFiles,
  validateWorkspaceDirectoryFiles,
  writeWorkspaceDirectoryChanges,
  type AuthoringWorkspace,
  type WorkspaceDirectory,
  type WorkspaceDirectorySnapshot,
} from './workspace';
const nodeTypes = { concept: ConceptNode, derivation: DerivationNode };

type ProjectedEdgeData = {
  kind: 'premise' | 'conclusion';
  derivationId: string;
  premiseId?: string;
};

type ProjectedEdge = Edge<ProjectedEdgeData>;
type HyperedgePatch = Partial<Omit<Hyperedge, 'id' | 'data'>> & { data?: Partial<Hyperedge['data']> };
type DocumentHistory = {
  past: AuthoringDocument[];
  present: AuthoringDocument;
  future: AuthoringDocument[];
};
type HistoryAction =
  | { type: 'commit'; updater: (current: AuthoringDocument) => AuthoringDocument; updatedAt: string }
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
  const next = {
    ...updated,
    document: { ...updated.document, updatedAt: action.updatedAt },
  };
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

function isExampleMode(): boolean {
  return new URLSearchParams(window.location.search).get('example') === 'replace-with';
}

function initialWorkspace(): AuthoringWorkspace {
  const workspace = loadLocalWorkspace(isExampleMode() ? sampleWorkspace : createEmptyWorkspace());
  if (!Object.keys(workspace.manifest.view.positions).length && workspace.manifest.graph.points.length) {
    workspace.manifest.view.positions = layoutDocument(workspace.manifest);
  }
  return workspace;
}

function neighborhood(document: AuthoringDocument, selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const ids = new Set([selectedId]);
  const selectedHyperedge = document.graph.hyperedges.find((item) => item.id === selectedId);
  const selectedGroupKey = selectedHyperedge ? hyperedgeGroupKey(selectedHyperedge) : null;
  for (const derivation of document.graph.hyperedges) {
    if (
      derivation.id === selectedId
      || (selectedGroupKey && hyperedgeGroupKey(derivation) === selectedGroupKey)
      || derivation.head === selectedId
      || derivation.tails.includes(selectedId)
    ) {
      ids.add(derivation.id);
      ids.add(derivation.head);
      derivation.tails.forEach((id) => ids.add(id));
    }
  }
  return ids;
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

function AuthoringCanvas() {
  const initial = useRef<AuthoringWorkspace | null>(null);
  if (!initial.current) initial.current = initialWorkspace();
  const [history, dispatchHistory] = useReducer(historyReducer, initial.current.manifest, (manifest) => ({
    past: [],
    present: manifest,
    future: [],
  }));
  const document = history.present;
  const [files, setFiles] = useState<Record<string, string>>(initial.current.files);
  const [workspaceDirectory, setWorkspaceDirectory] = useState<WorkspaceDirectory | null>(null);
  const [externalWorkspaceChange, setExternalWorkspaceChange] = useState<ExternalWorkspaceChange | null>(null);
  const [resolvingExternalChange, setResolvingExternalChange] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceOperationError | null>(null);
  const [workspaceErrorCopied, setWorkspaceErrorCopied] = useState(false);
  const workspaceDirectoryRef = useRef<WorkspaceDirectory | null>(null);
  const workspaceRevisionRef = useRef<string | null>(null);
  const externalWorkspaceChangeRef = useRef<ExternalWorkspaceChange | null>(null);
  const directoryOperationRef = useRef<Promise<void>>(Promise.resolve());
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusLayouts, setFocusLayouts] = useState<Record<string, Record<string, Position>>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('已自动保存');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [replacementDraft, setReplacementDraft] = useState<string[] | null>(null);
  const [activeDerivationByGroup, setActiveDerivationByGroup] = useState<Record<string, string>>({});
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [routeSelection, setRouteSelection] = useState<RouteSelection>(createRouteSelection);
  const [routeSolving, setRouteSolving] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(() => {
    const hasSavedWorkspace = !!localStorage.getItem(LOCAL_WORKSPACE_KEY);
    return !isExampleMode() && !hasSavedWorkspace && localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'complete';
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmDeleteButton = useRef<HTMLButtonElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow<AuthoringFlowNode, ProjectedEdge>();

  const reportWorkspaceError = useCallback((operation: string, error: unknown) => {
    setWorkspaceError(formatWorkspaceError(operation, error));
    setWorkspaceErrorCopied(false);
  }, []);

  useEffect(() => {
    if (workspaceDirectory) return;
    try {
      localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify({ manifest: document, files }));
    } catch (error) {
      reportWorkspaceError('缓存浏览器工作区', error);
    }
  }, [document, files, reportWorkspaceError, workspaceDirectory]);

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
        const disk = await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false });
        if (workspaceRevisionRef.current !== disk.revision) {
          reportExternalWorkspaceChange(disk);
          return;
        }
        await writeWorkspaceDirectoryChanges(workspaceDirectory, document, files);
        workspaceRevisionRef.current = (
          await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false })
        ).revision;
      }).catch((error: unknown) => reportWorkspaceError('自动保存项目文件夹', error));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [document, enqueueDirectoryOperation, externalWorkspaceChange, files, reportExternalWorkspaceChange, reportWorkspaceError, workspaceDirectory]);

  useEffect(() => {
    if (!workspaceDirectory || externalWorkspaceChange || workspaceError) return;
    const interval = window.setInterval(() => {
      void enqueueDirectoryOperation(async () => {
        if (workspaceDirectoryRef.current !== workspaceDirectory || externalWorkspaceChangeRef.current) return;
        const disk = await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false });
        if (workspaceRevisionRef.current !== disk.revision) reportExternalWorkspaceChange(disk);
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
    dispatchHistory({ type: 'commit', updater, updatedAt: new Date().toISOString() });
    setStatus('已自动保存');
  }, []);

  useEffect(() => {
    const pointIds = new Set(document.graph.points.map((point) => point.id));
    setRouteSelection((current) => ({
      ...invalidateRoute(current),
      startPointIds: current.startPointIds.filter((id) => pointIds.has(id)),
      targetPointId: current.targetPointId && pointIds.has(current.targetPointId)
        ? current.targetPointId
        : null,
    }));
    setRouteError(null);
  }, [document]);

  const clearTransientView = useCallback(() => {
    setFocusLayouts({});
    setFocusedId(null);
    setReplacementDraft(null);
    setSelectedNodeIds([]);
    setSelectedId(null);
    setActiveDerivationByGroup({});
  }, []);

  const undo = useCallback(() => {
    if (!history.past.length) return;
    dispatchHistory({ type: 'undo' });
    clearTransientView();
    setStatus('已撤回');
    notifyTourAction('undo-used');
  }, [clearTransientView, history.past.length]);

  const redo = useCallback(() => {
    if (!history.future.length) return;
    dispatchHistory({ type: 'redo' });
    clearTransientView();
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
    commit((current) => {
      const isConcept = current.graph.points.some((concept) => concept.id === id);
      const removedDerivations = new Set(
        isConcept
          ? current.graph.hyperedges.filter((item) => item.head === id || item.tails.includes(id)).map((item) => item.id)
          : [id],
      );
      const positions = { ...current.view.positions };
      const removedHyperedge = isConcept ? null : current.graph.hyperedges.find((item) => item.id === id);
      const groupPosition = removedHyperedge ? positions[id] : null;
      if (removedHyperedge && groupPosition) {
        current.graph.hyperedges.forEach((item) => {
          if (item.id !== id && hyperedgeGroupKey(item) === hyperedgeGroupKey(removedHyperedge)) {
            positions[item.id] = groupPosition;
          }
        });
      }
      delete positions[id];
      removedDerivations.forEach((derivationId) => delete positions[derivationId]);
      return {
        ...current,
        graph: {
          points: isConcept ? current.graph.points.filter((point) => point.id !== id) : current.graph.points,
          hyperedges: current.graph.hyperedges.filter((item) => !removedDerivations.has(item.id)),
        },
        view: {
          positions,
          replacements: current.view.replacements.filter((replacement) =>
            replacement.replaceWith !== id && !replacement.points.includes(id),
          ),
        },
      };
    });
    setFocusLayouts({});
    setFocusedId(null);
    setReplacementDraft(null);
    setSelectedNodeIds((current) => current.filter((item) => item !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, [commit]);

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
    const nextDocument: AuthoringDocument = {
      ...document,
      view: {
        ...document.view,
        replacements: document.view.replacements.map((item) =>
          item.replaceWith === replaceWith ? { ...item, show } : item,
        ),
      },
    };
    commit(() => nextDocument);
    setSelectedId(show === 'replacement'
      ? replaceWith
      : firstVisiblePoint(nextDocument, replacement.points[0]));
    setSelectedNodeIds([]);
    setFocusedId(null);
    setFocusLayouts({});
    setStatus(show === 'replacement' ? `已替换为 ${replaceWith}` : '已显示原点集');
    notifyTourAction('replacement-toggled');
    const visibleIds = projectDocument(nextDocument).visibleIds;
    window.setTimeout(() => void fitView({
      nodes: [...visibleIds].map((id) => ({ id })),
      padding: 0.18,
      duration: 260,
      maxZoom: 1.1,
    }), 100);
  }, [commit, document, fitView]);

  const removeReplacement = useCallback((replaceWith: string) => {
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

  const projection = useMemo(() => projectDocument(document), [document]);
  const derivationGroups = useMemo(() => groupHyperedges(document.graph.hyperedges), [document.graph.hyperedges]);
  const groupByMemberId = useMemo(() => {
    const result = new Map<string, HyperedgeGroup>();
    derivationGroups.forEach((group) => group.members.forEach((member) => result.set(member.id, group)));
    return result;
  }, [derivationGroups]);
  const visibleDerivationGroups = useMemo(() => groupHyperedges(projection.hyperedges), [projection.hyperedges]);
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
    const candidates = neighborhood(document, focusedId);
    return new Set([...candidates].filter((id) => projection.visibleIds.has(id)));
  }, [document, focusedId, projection.visibleIds]);
  const focusPositions = useMemo(
    () => focusedId
      ? focusLayouts[focusedId] ?? layoutNeighborhood(document, activeIds, focusedId)
      : null,
    [activeIds, document, focusLayouts, focusedId],
  );

  const selectDerivation = useCallback((group: HyperedgeGroup, id: string) => {
    setActiveDerivationByGroup((current) => ({ ...current, [group.key]: id }));
    setSelectedId(id);
    setFocusedId((current) => {
      const focusedGroup = current ? groupByMemberId.get(current) : null;
      return focusedGroup?.key === group.key ? id : current;
    });
    setStatus(`正在查看推导 ${id}`);
    notifyTourAction('derivation-selected');
  }, [groupByMemberId]);

  const projectedNodes = useMemo<AuthoringFlowNode[]>(() => {
    const conceptById = new Map(document.graph.points.map((concept) => [concept.id, concept]));
    const dimmed = (id: string) => routeSelection.result
      ? !routeIds.has(id)
      : !!focusedId && !activeIds.has(id);
    const position = (id: string) => focusPositions?.[id] ?? document.view.positions[id] ?? { x: 0, y: 0 };
    return [
      ...projection.points.map((item): AuthoringFlowNode => {
        const concept = conceptById.get(item.id)!;
        return {
          id: concept.id,
          type: 'concept',
          className: routeSelection.targetPointId === concept.id
            ? 'is-route-target'
            : routeSelection.startPointIds.includes(concept.id)
              ? 'is-route-start'
              : routeSelection.result && routeIds.has(concept.id) ? 'is-route-member' : undefined,
          position: position(concept.id),
          data: {
            label: concept.data.label,
            dimmed: dimmed(concept.id),
            depth: item.depth,
            replacements: item.controls.map((control) => ({ ...control, onToggle: toggleReplacement })),
            onDelete: requestDelete,
          },
        };
      }),
      ...visibleDerivationGroups.map((group): AuthoringFlowNode => {
        const derivation = activeHyperedge(group, activeDerivationByGroup[group.key]);
        return {
          id: group.nodeId,
          type: 'derivation',
          className: group.members.some((member) => routeEdgeIds.has(member.id)) ? 'is-route-member' : undefined,
          position: position(group.nodeId),
          data: {
            activeId: derivation.id,
            weight: derivation.weight,
            premiseCount: derivation.tails.length,
            dimmed: routeSelection.result
              ? !group.members.some((member) => routeEdgeIds.has(member.id))
              : dimmed(group.nodeId),
            alternatives: group.members.map((member) => ({ id: member.id, weight: member.weight })),
            onSelect: (id) => selectDerivation(group, id),
            onDelete: requestDelete,
          },
        };
      }),
    ];
  }, [activeDerivationByGroup, activeIds, document.graph.points, document.view.positions, focusPositions, focusedId, projection.points, requestDelete, routeEdgeIds, routeIds, routeSelection.result, routeSelection.startPointIds, routeSelection.targetPointId, selectDerivation, toggleReplacement, visibleDerivationGroups]);

  const [nodes, setNodes, onNodesChange] = useNodesState<AuthoringFlowNode>([]);

  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return projectedNodes.map((node) => ({
        ...node,
        selected: previous.get(node.id)?.selected ?? false,
        measured: previous.get(node.id)?.measured,
      }));
    });
  }, [projectedNodes, setNodes]);

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

  useEffect(() => {
    if (!focusedId) return;
    const frame = window.requestAnimationFrame(() => {
      void fitView({ nodes: [...activeIds].map((id) => ({ id })), padding: 0.28, duration: 260, maxZoom: 1.25 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIds, fitView, focusedId]);

  const edges = useMemo<ProjectedEdge[]>(() => {
    const result: ProjectedEdge[] = [];
    for (const group of visibleDerivationGroups) {
      const derivation = activeHyperedge(group, activeDerivationByGroup[group.key]);
      const derivationActive = routeSelection.result
        ? routeEdgeIds.has(derivation.id)
        : !focusedId || activeIds.has(group.nodeId);
      for (const premise of derivation.tails) {
        result.push({
          id: `premise:${group.nodeId}:${premise}`,
          source: premise,
          target: group.nodeId,
          sourceHandle: 'concept-out',
          targetHandle: 'premise-in',
          type: 'default',
          deletable: false,
          data: { kind: 'premise', derivationId: derivation.id, premiseId: premise },
          style: { stroke: '#2f7087', strokeWidth: derivationActive ? 1.8 : 1.1, opacity: derivationActive ? 0.9 : 0.08 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2f7087', width: 14, height: 14 },
        });
      }
      result.push({
        id: `head:${group.nodeId}`,
        source: group.nodeId,
        target: derivation.head,
        sourceHandle: 'conclusion-out',
        targetHandle: 'concept-in',
        type: 'default',
        deletable: false,
        data: { kind: 'conclusion', derivationId: derivation.id },
        style: { stroke: '#a44f3f', strokeWidth: derivationActive ? 2 : 1.2, opacity: derivationActive ? 0.92 : 0.08 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a44f3f', width: 15, height: 15 },
      });
    }
    return result;
  }, [activeDerivationByGroup, activeIds, focusedId, routeEdgeIds, routeSelection.result, visibleDerivationGroups]);

  const persistNodePositions = useCallback((draggedNodes: AuthoringFlowNode[]) => {
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
          ...(current[focusedId] ?? layoutNeighborhood(document, activeIds, focusedId)),
          ...Object.fromEntries(localNodes.map((node) => [node.id, node.position])),
        },
      }));
      setStatus('局部视图布局已更新');
    }
    if (overviewNodes.length) {
      commit((current) => ({
        ...current,
        view: {
          ...current.view,
          positions: {
            ...current.view.positions,
            ...Object.fromEntries(overviewNodes.map((node) => [node.id, node.position])),
          },
        },
      }));
    }
    if (draggedNodes.length) notifyTourAction('node-moved');
  }, [activeIds, commit, document, focusedId, visibleGroupByNodeId]);

  const addConcept = useCallback((position?: Position) => {
    const id = uniqueId('c', document.graph.points.map((concept) => concept.id));
    const directory = createDocumentDirectory('concept', id, [
      ...document.graph.points.map((item) => item.data.document),
      ...document.graph.hyperedges.map((item) => item.data.document),
    ]);
    const format: DocumentFormat = 'markdown';
    const source = conceptTemplate('新概念', format);
    const conceptIndex = document.graph.points.length;
    const nextPosition = position ?? screenToFlowPosition({
      x: window.innerWidth / 2 + (conceptIndex % 3 - 1) * 170,
      y: window.innerHeight / 2 + Math.floor(conceptIndex / 3) * 100,
    });
    setFiles((current) => storeDocumentFiles(current, directory, format, source, '新概念'));
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        points: [...current.graph.points, { id, data: { label: '新概念', document: directory, format } }],
      },
      view: { ...current.view, positions: { ...current.view.positions, [id]: nextPosition } },
    }));
    setFocusLayouts({});
    setFocusedId(null);
    setSelectedId(id);
    notifyTourAction('concept-added');
  }, [commit, document.graph.hyperedges, document.graph.points, screenToFlowPosition]);

  const onConnect = useCallback((connection: Connection) => {
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
      const id = uniqueId('h', document.graph.hyperedges.map((item) => item.id));
      const directory = createDocumentDirectory('derivation', id, [
        ...document.graph.points.map((item) => item.data.document),
        ...document.graph.hyperedges.map((item) => item.data.document),
      ]);
      const format: DocumentFormat = 'markdown';
      const source = derivationTemplate(id, format);
      const nextHyperedge: Hyperedge = {
        id,
        weight: 1,
        tails: [connection.source],
        head: connection.target,
        data: { document: directory, format },
      };
      setFiles((current) => storeDocumentFiles(current, directory, format, source, `推导 ${id}`));
      const sourcePosition = document.view.positions[connection.source] ?? { x: 0, y: 0 };
      const targetPosition = document.view.positions[connection.target] ?? { x: sourcePosition.x + 240, y: sourcePosition.y };
      const matchingGroup = derivationGroups.find((group) => group.key === hyperedgeGroupKey(nextHyperedge));
      const nextPosition = matchingGroup
        ? document.view.positions[matchingGroup.nodeId]
          ?? { x: (sourcePosition.x + targetPosition.x) / 2 + 44, y: (sourcePosition.y + targetPosition.y) / 2 }
        : { x: (sourcePosition.x + targetPosition.x) / 2 + 44, y: (sourcePosition.y + targetPosition.y) / 2 };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: [...current.graph.hyperedges, nextHyperedge],
        },
        view: {
          ...current.view,
          positions: { ...current.view.positions, [id]: nextPosition },
        },
      }));
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: id }));
      setSelectedId(id);
      notifyTourAction('derivation-created');
      return;
    }
    if (sourceConcept && targetDerivation) {
      const nextHyperedge = targetDerivation.tails.includes(connection.source)
        ? targetDerivation
        : { ...targetDerivation, tails: [...targetDerivation.tails, connection.source] };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) => item.id === targetDerivation.id ? nextHyperedge : item),
        },
      }));
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: nextHyperedge.id }));
      setSelectedId(targetDerivation.id);
      notifyTourAction('derivation-updated');
      return;
    }
    if (sourceDerivation && targetConcept) {
      const nextHyperedge = { ...sourceDerivation, head: connection.target };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) => item.id === sourceDerivation.id ? nextHyperedge : item),
        },
      }));
      setActiveDerivationByGroup((current) => ({ ...current, [hyperedgeGroupKey(nextHyperedge)]: nextHyperedge.id }));
      setSelectedId(sourceDerivation.id);
      notifyTourAction('derivation-updated');
      return;
    }
    setStatus('只能连接“概念 → 概念 / 推导”或“推导 → 概念”');
  }, [commit, derivationGroups, displayedDerivationByNodeId, document]);

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

  const applyLayout = useCallback(() => {
    const positions = layoutDocument(document);
    setFocusedId(null);
    setFocusLayouts({});
    commit((current) => ({ ...current, view: { ...current.view, positions } }));
    notifyTourAction('layout-applied');
    window.setTimeout(() => void fitView({ padding: 0.12, duration: 350 }), 40);
  }, [commit, document, fitView]);

  const findConcept = useCallback(() => {
    const query = search.trim().toLocaleLowerCase();
    const concept = document.graph.points.find((item) =>
      item.id.toLocaleLowerCase() === query || item.data.label.toLocaleLowerCase().includes(query),
    );
    if (!concept) {
      setStatus('没有匹配的概念');
      return;
    }
    const revealed = revealConcept(document, concept.id);
    commit(() => revealed);
    setFocusedId(null);
    setSelectedId(concept.id);
    notifyTourAction('concept-found');
    window.setTimeout(() => void fitView({ nodes: [{ id: concept.id }], padding: 2, duration: 300, maxZoom: 1.4 }), 30);
  }, [commit, document, fitView, search]);

  const connectWorkspace = useCallback(async () => {
    try {
      const result = await chooseWorkspaceDirectory({ manifest: document, files });
      const imported = result.workspace.manifest;
      const positions = Object.keys(imported.view.positions).length ? imported.view.positions : layoutDocument(imported);
      workspaceDirectoryRef.current = result.handle;
      workspaceRevisionRef.current = result.revision;
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setFiles(result.created ? result.workspace.files : {});
      dispatchHistory({ type: 'replace', document: { ...imported, view: { ...imported.view, positions } } });
      setWorkspaceDirectory(result.handle);
      setEditingId(null);
      clearTransientView();
      setStatus(result.created ? `已在 ${result.handle.name} 创建工作区` : `已打开工作区 ${result.handle.name}`);
      window.setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 20);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      reportWorkspaceError('打开项目文件夹', error);
    }
  }, [clearTransientView, document, files, fitView, reportWorkspaceError]);

  const createWorkspaceInNewDirectory = useCallback(async () => {
    try {
      const workspace = createEmptyWorkspace();
      const handle = await saveWorkspaceAsDirectory(workspace);
      workspaceDirectoryRef.current = handle;
      workspaceRevisionRef.current = (
        await readWorkspaceDirectorySnapshot(handle, { loadFiles: false })
      ).revision;
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setFiles(workspace.files);
      dispatchHistory({ type: 'replace', document: workspace.manifest });
      setWorkspaceDirectory(handle);
      setEditingId(null);
      clearTransientView();
      setStatus(`已在 ${handle.name} 创建空项目`);
      notifyTourAction('workspace-created');
      window.setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 20);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      reportWorkspaceError('创建空项目', error);
    }
  }, [clearTransientView, fitView, reportWorkspaceError]);

  const saveWorkspaceAs = useCallback(async () => {
    try {
      const workspace = { manifest: document, files };
      const handle = await saveWorkspaceAsDirectory(workspace, workspaceDirectory ?? undefined);
      workspaceDirectoryRef.current = handle;
      workspaceRevisionRef.current = (
        await readWorkspaceDirectorySnapshot(handle, { loadFiles: false })
      ).revision;
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
      const positions = Object.keys(imported.view.positions).length ? imported.view.positions : layoutDocument(imported);
      workspaceDirectoryRef.current = null;
      workspaceRevisionRef.current = null;
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setFiles(importedWorkspace.files);
      setWorkspaceDirectory(null);
      commit(() => ({ ...imported, view: { ...imported.view, positions } }));
      setEditingId(null);
      clearTransientView();
      setStatus('JSON 已迁移到本地工作区');
      window.setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 20);
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : '无法导入 JSON');
    }
  }, [clearTransientView, commit, files, fitView]);

  const openJsonEditor = useCallback(() => {
    setJsonText(JSON.stringify(document, null, 2));
    setJsonOpen(true);
    notifyTourAction('json-opened');
  }, [document]);

  const applyJson = useCallback(async () => {
    try {
      const parsed = importManifest(jsonText, files, { allowMissingFiles: !!workspaceDirectory }).manifest;
      if (workspaceDirectory) await validateWorkspaceDirectoryFiles(workspaceDirectory, parsed);
      const positions = Object.keys(parsed.view.positions).length ? parsed.view.positions : layoutDocument(parsed);
      commit(() => ({ ...parsed, view: { ...parsed.view, positions } }));
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setReplacementDraft(null);
      setJsonOpen(false);
      setStatus('JSON 已应用');
      notifyTourAction('json-applied');
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : 'JSON 无效');
    }
  }, [commit, files, jsonText, workspaceDirectory]);

  const adoptExternalWorkspaceChange = useCallback(() => {
    if (!externalWorkspaceChange) return;
    const imported = externalWorkspaceChange.snapshot.workspace.manifest;
    const positions = Object.keys(imported.view.positions).length ? imported.view.positions : layoutDocument(imported);
    workspaceRevisionRef.current = externalWorkspaceChange.snapshot.revision;
    externalWorkspaceChangeRef.current = null;
    setFiles({});
    dispatchHistory({ type: 'replace', document: { ...imported, view: { ...imported.view, positions } } });
    setExternalWorkspaceChange(null);
    setEditingId(null);
    clearTransientView();
    setStatus('已采用项目文件夹中的更改');
    window.setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 20);
  }, [clearTransientView, externalWorkspaceChange, fitView]);

  const keepWebUiWorkspaceChange = useCallback(() => {
    if (!externalWorkspaceChange || !workspaceDirectory || resolvingExternalChange) return;
    setResolvingExternalChange(true);
    void enqueueDirectoryOperation(async () => {
      if (workspaceDirectoryRef.current !== workspaceDirectory) return;
      await writeWorkspaceDirectoryChanges(workspaceDirectory, document, files);
      workspaceRevisionRef.current = (
        await readWorkspaceDirectorySnapshot(workspaceDirectory, { loadFiles: false })
      ).revision;
      externalWorkspaceChangeRef.current = null;
      setExternalWorkspaceChange(null);
      setStatus('已保留 WebUI 更改并覆盖项目文件夹');
    }).catch((error: unknown) => reportWorkspaceError('覆盖项目文件夹', error))
      .finally(() => setResolvingExternalChange(false));
  }, [document, enqueueDirectoryOperation, externalWorkspaceChange, files, reportWorkspaceError, resolvingExternalChange, workspaceDirectory]);

  const toggleRouteMode = useCallback(() => {
    setRouteMode((current) => !current);
    setRouteError(null);
    setFocusedId(null);
    setSelectedId(null);
  }, []);

  const toggleStartPoint = useCallback((pointId: string) => {
    setRouteSelection((current) => toggleRouteStart(current, pointId));
    setRouteError(null);
  }, []);

  const changeRouteTarget = useCallback((pointId: string | null) => {
    setRouteSelection((current) => setRouteTarget(current, pointId));
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
      setRouteSelection((current) => ({ ...current, result }));
      if (result.reachable) {
        const active = Object.fromEntries(result.hyperedgeIds.flatMap((id) => {
          const group = groupByMemberId.get(id);
          return group ? [[group.key, id]] : [];
        }));
        setActiveDerivationByGroup((current) => ({ ...current, ...active }));
        setStatus(result.provenOptimal ? '已找到并证明最优路线' : '已找到当前最佳路线');
      } else {
        setStatus('目标当前不可达');
      }
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
      setFocusedId(semanticId);
      notifyTourAction('focused-view-toggled');
      return;
    }
    setSelectedId(semanticId);
  }, [commit, displayedDerivationByNodeId, document, replacementDraft, routeMode, selectedId, toggleStartPoint, visibleGroupByNodeId]);

  const handleSelectionChange = useCallback((selection: OnSelectionChangeParams<AuthoringFlowNode, ProjectedEdge>) => {
    const ids = selection.nodes.map((node) => node.id).sort();
    setSelectedNodeIds((current) =>
      current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids,
    );
  }, []);

  const toggleFocusedView = useCallback(() => {
    setFocusedId((current) => current ? null : selectedId);
    notifyTourAction('focused-view-toggled');
  }, [selectedId]);

  const openDocument = useCallback((id: string) => {
    const item = document.graph.points.find((point) => point.id === id)
      ?? document.graph.hyperedges.find((hyperedge) => hyperedge.id === id);
    if (!item) return;
    const sourcePath = documentSourcePath(item.data);
    if (!workspaceDirectory || typeof files[sourcePath] === 'string') {
      setEditingId(id);
      notifyTourAction('document-opened');
      return;
    }
    setStatus(`正在读取 ${sourcePath}`);
    void enqueueDirectoryOperation(async () => {
      const source = await readWorkspaceDocumentSource(workspaceDirectory, item.data);
      if (workspaceDirectoryRef.current !== workspaceDirectory) return;
      setFiles((current) => ({ ...current, [sourcePath]: source }));
      setEditingId(id);
      setStatus('文档已加载');
      notifyTourAction('document-opened');
    }).catch((error: unknown) => reportWorkspaceError(`读取 ${sourcePath}`, error));
  }, [document.graph.hyperedges, document.graph.points, enqueueDirectoryOperation, files, reportWorkspaceError, workspaceDirectory]);

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

  const confirmConceptName = useCallback(() => notifyTourAction('concept-renamed'), []);
  const confirmDerivationWeight = useCallback(() => notifyTourAction('derivation-weight-edited'), []);

  const selectedConcept = document.graph.points.find((item) => item.id === selectedId);
  const selectedDerivation = document.graph.hyperedges.find((item) => item.id === selectedId);
  const selectedDerivationGroup = selectedDerivation ? groupByMemberId.get(selectedDerivation.id) : null;
  const selectedReplacements = selectedConcept
    ? document.view.replacements.filter((item) => item.replaceWith === selectedConcept.id || item.points.includes(selectedConcept.id))
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">D</span>
          <input
            className="document-title"
            value={document.document.title}
            aria-label="文档标题"
            {...tourTarget(TOUR_FEATURES.projectTitle)}
            onChange={(event) => commit((current) => ({ ...current, document: { ...current.document, title: event.target.value } }))}
            onBlur={() => notifyTourAction('project-title-edited')}
            onKeyDown={(event) => event.key === 'Enter' && notifyTourAction('project-title-edited')}
          />
        </div>
        <div className={`search-cluster ${editingId ? 'is-hidden' : ''}`}>
          <div className="search-box" {...tourTarget(TOUR_FEATURES.search)}>
            <Search size={15} />
            <input value={search} aria-label="搜索概念" placeholder="搜索概念" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && findConcept()} />
          </div>
          <a
            className="github-link"
            href="https://github.com/derivon-research/mindmap-demo"
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
            <button type="button" title="返回画布" {...tourTarget(TOUR_FEATURES.returnCanvas)} onClick={returnToCanvas}><ArrowLeft size={18} /></button>
          ) : (
            <>
              <button type="button" title="新建概念" {...tourTarget(TOUR_FEATURES.addConcept)} onClick={() => addConcept()}><Plus size={18} /></button>
              <button
                type="button"
                className={replacementDraft ? 'is-active' : ''}
                {...tourTarget(TOUR_FEATURES.replaceWith)}
                title={replacementDraft ? '取消替换' : 'Replace with'}
                disabled={!replacementDraft && selectedNodeIds.length === 0}
                onClick={beginReplacement}
              >
                {replacementDraft ? <X size={17} /> : <Replace size={17} />}
              </button>
              <button type="button" title="自动布局" {...tourTarget(TOUR_FEATURES.autoLayout)} onClick={applyLayout}><LayoutGrid size={17} /></button>
              <button
                type="button"
                className={focusedId ? 'is-active' : ''}
                {...tourTarget(TOUR_FEATURES.focusedView)}
                title={focusedId ? '关闭局部视图' : '开启局部视图'}
                disabled={!selectedId || !!replacementDraft}
                onClick={toggleFocusedView}
              >
                {focusedId ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
              <button
                type="button"
                className={routeMode ? 'is-active' : ''}
                title={routeMode ? '关闭路线模式' : '打开路线模式'}
                aria-label={routeMode ? '关闭路线模式' : '打开路线模式'}
                onClick={toggleRouteMode}
              >
                <Milestone size={17} />
              </button>
              <span className="toolbar-divider" />
              <button type="button" title="连接工作区文件夹" {...tourTarget(TOUR_FEATURES.openWorkspace)} onClick={() => void connectWorkspace()}><FolderOpen size={17} /></button>
              <button type="button" title="在新文件夹创建空项目" {...tourTarget(TOUR_FEATURES.newWorkspace)} onClick={() => void createWorkspaceInNewDirectory()}><FolderPlus size={17} /></button>
              <button type="button" title="另存到新文件夹" onClick={() => void saveWorkspaceAs()}><Save size={17} /></button>
              <button type="button" title="编辑工作区 JSON" {...tourTarget(TOUR_FEATURES.workspaceJson)} onClick={openJsonEditor}><Braces size={17} /></button>
              <button type="button" title="导入旧版 JSON" onClick={() => fileInput.current?.click()}><FileUp size={17} /></button>
              <button type="button" title="操作引导" aria-label="操作引导" {...tourTarget(TOUR_FEATURES.help)} onClick={() => setTourOpen(true)}><CircleHelp size={17} /></button>
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
          <div className="document-editor-main">
            <DocumentEditor
              label={editingLabel}
              value={files[editingSourcePath] ?? ''}
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
              <label>名称<input value={editingConcept.data.label} {...tourTarget(TOUR_FEATURES.conceptName)} onChange={(event) => updatePointData(editingConcept.id, { label: event.target.value })} onBlur={confirmConceptName} onKeyDown={(event) => event.key === 'Enter' && confirmConceptName()} /></label>
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
                <label className="weight-field">成本权重<input type="number" min="0" step="0.1" value={formatWeight(editingDerivation.weight)} {...tourTarget(TOUR_FEATURES.derivationWeight)} onChange={(event) => updateHyperedge(editingDerivation.id, { weight: normalizeWeight(Number(event.target.value)) })} onBlur={confirmDerivationWeight} onKeyDown={(event) => event.key === 'Enter' && confirmDerivationWeight()} /></label>
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
        <div className={`canvas-wrap ${replacementDraft ? 'is-replacing' : ''}`} {...tourTarget(TOUR_FEATURES.canvas)}>
          <ReactFlow<AuthoringFlowNode, ProjectedEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={handleSelectionChange}
            onConnect={onConnect}
            onNodeDragStop={(_, node, draggedNodes) => persistNodePositions(draggedNodes.length ? draggedNodes : [node])}
            onNodeClick={(event, node) => selectNode(node.id, event.shiftKey)}
            onNodeDoubleClick={(_, node) => openDocument(displayedDerivationByNodeId.get(node.id)?.id ?? node.id)}
            onPaneClick={() => {
              setFocusedId(null);
              setSelectedId(null);
              setSelectedNodeIds([]);
              if (replacementDraft) {
                setReplacementDraft(null);
                setStatus('已取消替换');
              }
            }}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
            minZoom={0.08}
            maxZoom={2}
            multiSelectionKeyCode="Shift"
            connectionLineStyle={{ stroke: '#4f5961', strokeWidth: 1.5 }}
            connectionLineType={ConnectionLineType.Bezier}
            defaultEdgeOptions={{ type: 'default' }}
            elevateEdgesOnSelect={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d7d8d4" />
            <Controls showInteractive={false} position="bottom-left" {...tourTarget(TOUR_FEATURES.zoom)} />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => node.type === 'derivation' ? '#a44f3f' : '#d9ddd9'}
              nodeStrokeColor={(node) => node.type === 'derivation' ? '#a44f3f' : '#59625e'}
              maskColor="rgba(247,247,245,0.76)"
            />
          </ReactFlow>
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
            <span><i className="legend-replacement" />可替换</span>
            <span><i className="legend-derivation" />推导</span>
            <span><i className="legend-premise" />前提</span>
            <span><i className="legend-conclusion" />结论</span>
          </div>
          {status && <div className="status-toast" role="status">{status}</div>}
        </div>

        {routeMode ? (
          <RoutePanel
            document={document}
            selection={routeSelection}
            solving={routeSolving}
            error={routeError}
            onToggleStart={toggleStartPoint}
            onTargetChange={changeRouteTarget}
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
              <label>名称<input value={selectedConcept.data.label} {...tourTarget(TOUR_FEATURES.conceptName)} onChange={(event) => updatePointData(selectedConcept.id, { label: event.target.value })} onBlur={confirmConceptName} onKeyDown={(event) => event.key === 'Enter' && confirmConceptName()} /></label>
              <button className="open-document-button" type="button" {...tourTarget(TOUR_FEATURES.openDocument)} onClick={() => openDocument(selectedConcept.id)}>
                <FileText size={16} />
                <span>编辑文档</span>
              </button>
              <code className="document-path">{selectedConcept.data.document}/index.html</code>
              {selectedReplacements.map((replacement) => (
                <div className="replacement-definition" key={replacement.replaceWith}>
                  <div className="replacement-expression">
                    <span>{replacement.points.join(' + ')}</span>
                    <strong>→</strong>
                    <span>{replacement.replaceWith}</span>
                  </div>
                  <div className="replacement-segment" role="group" aria-label={`${replacement.replaceWith} 显示方式`} {...tourTarget(TOUR_FEATURES.replacementToggle)}>
                    <button
                      type="button"
                      className={replacement.show === 'points' ? 'is-active' : ''}
                      onClick={() => toggleReplacement(replacement.replaceWith, 'points')}
                    >点集</button>
                    <button
                      type="button"
                      className={replacement.show === 'replacement' ? 'is-active' : ''}
                      onClick={() => toggleReplacement(replacement.replaceWith, 'replacement')}
                    >{replacement.replaceWith}</button>
                    <button className="replacement-unlink" type="button" title="解除替换关系" onClick={() => removeReplacement(replacement.replaceWith)}><Unlink size={13} /></button>
                  </div>
                </div>
              ))}
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
                    <span className="chip" key={id}>{labelById.get(id) ?? id}<button type="button" title="移除此前提" onClick={() => updateHyperedge(selectedDerivation.id, { tails: selectedDerivation.tails.filter((item) => item !== id) })}><X size={12} /></button></span>
                  ))}
                </div>
                <span className="field-title">结论</span>
                <span className="conclusion-label">{labelById.get(selectedDerivation.head) ?? selectedDerivation.head}</span>
              </div>
              <button className="open-document-button" type="button" {...tourTarget(TOUR_FEATURES.openDocument)} onClick={() => openDocument(selectedDerivation.id)}>
                <FileText size={16} />
                <span>编辑文档</span>
              </button>
              <code className="document-path">{selectedDerivation.data.document}/index.html</code>
              <label className="weight-field">成本权重<input type="number" min="0" step="0.1" value={formatWeight(selectedDerivation.weight)} {...tourTarget(TOUR_FEATURES.derivationWeight)} onChange={(event) => updateHyperedge(selectedDerivation.id, { weight: normalizeWeight(Number(event.target.value)) })} onBlur={confirmDerivationWeight} onKeyDown={(event) => event.key === 'Enter' && confirmDerivationWeight()} /></label>
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
              <label>说明<textarea value={document.document.description} {...tourTarget(TOUR_FEATURES.projectDescription)} onChange={(event) => commit((current) => ({ ...current, document: { ...current.document, description: event.target.value } }))} onBlur={() => notifyTourAction('project-description-edited')} onKeyDown={(event) => (event.metaKey || event.ctrlKey) && event.key === 'Enter' && notifyTourAction('project-description-edited')} /></label>
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

      {workspaceError && (
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
          <section className="json-modal" role="dialog" aria-modal="true" aria-label="原始 JSON 编辑器" {...tourTarget(TOUR_FEATURES.jsonEditor)}>
            <header><div><span className="eyebrow">{WORKSPACE_MANIFEST}</span><strong>{document.schema}</strong></div><button type="button" title="关闭" onClick={() => setJsonOpen(false)}><X size={18} /></button></header>
            <textarea spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
            <footer><button type="button" className="text-button" onClick={() => {
              try {
                setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
              } catch {
                setStatus('JSON 语法无效');
              }
            }}>格式化</button><button type="button" className="primary-button" onClick={() => void applyJson()}>检查并应用</button></footer>
          </section>
        </div>
      )}

      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </main>
  );
}

export default function App() {
  return <ReactFlowProvider><AuthoringCanvas /></ReactFlowProvider>;
}

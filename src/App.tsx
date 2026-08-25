import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Braces,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  LayoutGrid,
  Plus,
  Replace,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import type { AuthoringDocument, Hyperedge, Point, Position, ViewReplacement } from './domain';
import { parseDocument, touchDocument, uniqueId } from './domain';
import { ConceptNode, DerivationNode, type AuthoringFlowNode } from './GraphNodes';
import { layoutDocument, layoutNeighborhood } from './layout';
import { projectDocument } from './projection';
import { replacementFromSelection } from './replacements';
import { sampleDocument } from './sample';

const STORAGE_KEY = 'derivon.authoring.demo/v0.1.0';
const nodeTypes = { concept: ConceptNode, derivation: DerivationNode };

type ProjectedEdgeData = {
  kind: 'premise' | 'conclusion';
  derivationId: string;
  premiseId?: string;
};

type ProjectedEdge = Edge<ProjectedEdgeData>;
type HyperedgePatch = Partial<Omit<Hyperedge, 'id' | 'data'>> & { data?: Partial<Hyperedge['data']> };

function initialDocument(): AuthoringDocument {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseDocument(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  const document = structuredClone(sampleDocument);
  if (!Object.keys(document.view.positions).length) document.view.positions = layoutDocument(document);
  return document;
}

function neighborhood(document: AuthoringDocument, selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const ids = new Set([selectedId]);
  for (const derivation of document.graph.hyperedges) {
    if (derivation.id === selectedId || derivation.head === selectedId || derivation.tails.includes(selectedId)) {
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

function filenameFor(title: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 60);
  return `${safe || 'derivon-graph'}.derivon.json`;
}

function AuthoringCanvas() {
  const [document, setDocument] = useState<AuthoringDocument>(initialDocument);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusLayouts, setFocusLayouts] = useState<Record<string, Record<string, Position>>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('已自动保存');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [replacementDraft, setReplacementDraft] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow<AuthoringFlowNode, ProjectedEdge>();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const commit = useCallback((updater: (current: AuthoringDocument) => AuthoringDocument) => {
    setDocument((current) => touchDocument(updater(current)));
    setStatus('已自动保存');
  }, []);

  const deleteItem = useCallback((id: string) => {
    commit((current) => {
      const isConcept = current.graph.points.some((concept) => concept.id === id);
      const removedDerivations = new Set(
        isConcept
          ? current.graph.hyperedges.filter((item) => item.head === id || item.tails.includes(id)).map((item) => item.id)
          : [id],
      );
      const positions = { ...current.view.positions };
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

  const projectedNodes = useMemo<AuthoringFlowNode[]>(() => {
    const conceptById = new Map(document.graph.points.map((concept) => [concept.id, concept]));
    const dimmed = (id: string) => !!focusedId && !activeIds.has(id);
    const position = (id: string) => focusPositions?.[id] ?? document.view.positions[id] ?? { x: 0, y: 0 };
    return [
      ...projection.points.map((item): AuthoringFlowNode => {
        const concept = conceptById.get(item.id)!;
        return {
          id: concept.id,
          type: 'concept',
          position: position(concept.id),
          data: {
            label: concept.data.label,
            definition: concept.data.definition,
            dimmed: dimmed(concept.id),
            depth: item.depth,
            replacements: item.controls.map((control) => ({ ...control, onToggle: toggleReplacement })),
            onDelete: deleteItem,
          },
        };
      }),
      ...projection.hyperedges.map((derivation): AuthoringFlowNode => ({
        id: derivation.id,
        type: 'derivation',
        position: position(derivation.id),
        data: {
          weight: derivation.weight,
          premiseCount: derivation.tails.length,
          dimmed: dimmed(derivation.id),
          onDelete: deleteItem,
        },
      })),
    ];
  }, [activeIds, deleteItem, document.graph.points, document.view.positions, focusPositions, focusedId, projection, toggleReplacement]);

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
    for (const derivation of projection.hyperedges) {
      const derivationActive = !focusedId || activeIds.has(derivation.id);
      for (const premise of derivation.tails) {
        result.push({
          id: `premise:${derivation.id}:${premise}`,
          source: premise,
          target: derivation.id,
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
        id: `head:${derivation.id}`,
        source: derivation.id,
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
  }, [activeIds, focusedId, projection.hyperedges]);

  const persistNodePosition = useCallback((node: AuthoringFlowNode) => {
    if (focusedId && activeIds.has(node.id)) {
      setFocusLayouts((current) => ({
        ...current,
        [focusedId]: {
          ...(current[focusedId] ?? layoutNeighborhood(document, activeIds, focusedId)),
          [node.id]: node.position,
        },
      }));
      setStatus('局部视图布局已更新');
      return;
    }
    commit((current) => ({
      ...current,
      view: { ...current.view, positions: { ...current.view.positions, [node.id]: node.position } },
    }));
  }, [activeIds, commit, document, focusedId]);

  const addConcept = useCallback((position?: Position) => {
    const id = uniqueId('c', document.graph.points.map((concept) => concept.id));
    const nextPosition = position ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    commit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        points: [...current.graph.points, { id, data: { label: '新概念', definition: '' } }],
      },
      view: { ...current.view, positions: { ...current.view.positions, [id]: nextPosition } },
    }));
    setFocusLayouts({});
    setFocusedId(null);
    setSelectedId(id);
  }, [commit, document.graph.points, screenToFlowPosition]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceConcept = document.graph.points.some((item) => item.id === connection.source);
    const targetConcept = document.graph.points.some((item) => item.id === connection.target);
    const sourceDerivation = document.graph.hyperedges.some((item) => item.id === connection.source);
    const targetDerivation = document.graph.hyperedges.some((item) => item.id === connection.target);

    if ((sourceConcept && (targetConcept || targetDerivation)) || (sourceDerivation && targetConcept)) {
      setFocusLayouts({});
      setFocusedId(null);
    }

    if (sourceConcept && targetConcept) {
      const id = uniqueId('h', document.graph.hyperedges.map((item) => item.id));
      const sourcePosition = document.view.positions[connection.source] ?? { x: 0, y: 0 };
      const targetPosition = document.view.positions[connection.target] ?? { x: sourcePosition.x + 240, y: sourcePosition.y };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: [...current.graph.hyperedges, {
            id,
            weight: 1,
            tails: [connection.source!],
            head: connection.target!,
            data: { introduction: '', reasoning: '' },
          }],
        },
        view: {
          ...current.view,
          positions: {
            ...current.view.positions,
            [id]: { x: (sourcePosition.x + targetPosition.x) / 2 + 44, y: (sourcePosition.y + targetPosition.y) / 2 },
          },
        },
      }));
      setSelectedId(id);
      return;
    }
    if (sourceConcept && targetDerivation) {
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) =>
            item.id === connection.target && !item.tails.includes(connection.source!)
              ? { ...item, tails: [...item.tails, connection.source!] }
              : item,
          ),
        },
      }));
      setSelectedId(connection.target);
      return;
    }
    if (sourceDerivation && targetConcept) {
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          hyperedges: current.graph.hyperedges.map((item) =>
            item.id === connection.source ? { ...item, head: connection.target! } : item,
          ),
        },
      }));
      setSelectedId(connection.source);
      return;
    }
    setStatus('只能连接“概念 → 概念 / 推导”或“推导 → 概念”');
  }, [commit, document]);

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
  }, [commit]);

  const applyLayout = useCallback(() => {
    const positions = layoutDocument(document);
    setFocusedId(null);
    setFocusLayouts({});
    commit((current) => ({ ...current, view: { ...current.view, positions } }));
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
    setDocument(revealed);
    setFocusedId(null);
    setSelectedId(concept.id);
    window.setTimeout(() => void fitView({ nodes: [{ id: concept.id }], padding: 2, duration: 300, maxZoom: 1.4 }), 30);
  }, [document, fitView, search]);

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filenameFor(document.document.title);
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('JSON 已下载');
  }, [document]);

  const importFile = useCallback(async (file: File) => {
    try {
      const imported = parseDocument(await file.text());
      const positions = Object.keys(imported.view.positions).length ? imported.view.positions : layoutDocument(imported);
      setDocument({ ...imported, view: { ...imported.view, positions } });
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setReplacementDraft(null);
      setStatus('文档已打开');
      window.setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 20);
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : '无法打开文档');
    }
  }, [fitView]);

  const openJsonEditor = useCallback(() => {
    setJsonText(JSON.stringify(document, null, 2));
    setJsonOpen(true);
  }, [document]);

  const applyJson = useCallback(() => {
    try {
      const parsed = parseDocument(jsonText);
      const positions = Object.keys(parsed.view.positions).length ? parsed.view.positions : layoutDocument(parsed);
      setDocument({ ...parsed, view: { ...parsed.view, positions } });
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setReplacementDraft(null);
      setJsonOpen(false);
      setStatus('JSON 已应用');
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : 'JSON 无效');
    }
  }, [jsonText]);

  const selectNode = useCallback((id: string) => {
    if (replacementDraft) {
      if (!document.graph.points.some((concept) => concept.id === id)) {
        setStatus('替换点必须是概念');
        return;
      }
      const candidate = replacementFromSelection(document, replacementDraft, id);
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
      setStatus(`已定义 ${candidate.replacement.points.join(' + ')} → ${id}`);
      return;
    }
    if (selectedId === id) {
      setFocusedId(id);
      return;
    }
    setSelectedId(id);
  }, [commit, document, replacementDraft, selectedId]);

  const handleSelectionChange = useCallback((selection: OnSelectionChangeParams<AuthoringFlowNode, ProjectedEdge>) => {
    const ids = selection.nodes.map((node) => node.id).sort();
    setSelectedNodeIds((current) =>
      current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids,
    );
  }, []);

  const toggleFocusedView = useCallback(() => {
    setFocusedId((current) => current ? null : selectedId);
  }, [selectedId]);

  const selectedConcept = document.graph.points.find((item) => item.id === selectedId);
  const selectedDerivation = document.graph.hyperedges.find((item) => item.id === selectedId);
  const selectedReplacements = selectedConcept
    ? document.view.replacements.filter((item) => item.replaceWith === selectedConcept.id || item.points.includes(selectedConcept.id))
    : [];
  const labelById = useMemo(
    () => new Map(document.graph.points.map((item) => [item.id, item.data.label])),
    [document.graph.points],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">D</span>
          <input
            className="document-title"
            value={document.document.title}
            aria-label="文档标题"
            onChange={(event) => commit((current) => ({ ...current, document: { ...current.document, title: event.target.value } }))}
          />
        </div>
        <div className="search-box">
          <Search size={15} />
          <input value={search} aria-label="搜索概念" placeholder="搜索概念" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && findConcept()} />
        </div>
        <div className="toolbar" aria-label="文档工具栏">
          <button type="button" title="新建概念" onClick={() => addConcept()}><Plus size={18} /></button>
          <button
            type="button"
            className={replacementDraft ? 'is-active' : ''}
            title={replacementDraft ? '取消替换' : 'Replace with'}
            disabled={!replacementDraft && selectedNodeIds.length === 0}
            onClick={beginReplacement}
          >
            {replacementDraft ? <X size={17} /> : <Replace size={17} />}
          </button>
          <button type="button" title="自动布局" onClick={applyLayout}><LayoutGrid size={17} /></button>
          <button
            type="button"
            className={focusedId ? 'is-active' : ''}
            title={focusedId ? '关闭局部视图' : '开启局部视图'}
            disabled={!selectedId || !!replacementDraft}
            onClick={toggleFocusedView}
          >
            {focusedId ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
          <span className="toolbar-divider" />
          <button type="button" title="编辑原始 JSON" onClick={openJsonEditor}><Braces size={17} /></button>
          <button type="button" title="打开 JSON 文件" onClick={() => fileInput.current?.click()}><FileUp size={17} /></button>
          <button type="button" title="下载 JSON 文件" onClick={download}><FileDown size={17} /></button>
          <input ref={fileInput} hidden type="file" accept=".json,.derivon.json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }} />
        </div>
      </header>

      <section className="workspace">
        <div className={`canvas-wrap ${replacementDraft ? 'is-replacing' : ''}`}>
          <ReactFlow<AuthoringFlowNode, ProjectedEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={handleSelectionChange}
            onConnect={onConnect}
            onNodeDragStop={(_, node) => persistNodePosition(node)}
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => {
              setFocusedId(null);
              setSelectedId(null);
              setSelectedNodeIds([]);
              if (replacementDraft) {
                setReplacementDraft(null);
                setStatus('已取消替换');
              }
            }}
            onNodesDelete={(deleted) => deleted.forEach((node) => deleteItem(node.id))}
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
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => node.type === 'derivation' ? '#a44f3f' : '#d9ddd9'}
              nodeStrokeColor={(node) => node.type === 'derivation' ? '#a44f3f' : '#59625e'}
              maskColor="rgba(247,247,245,0.76)"
            />
          </ReactFlow>
          <div className="legend" aria-label="图例">
            <span><i className="legend-concept" />概念</span>
            <span><i className="legend-replacement" />可替换</span>
            <span><i className="legend-derivation" />推导</span>
            <span><i className="legend-premise" />前提</span>
            <span><i className="legend-conclusion" />结论</span>
          </div>
          {status && <div className="status-toast" role="status">{status}</div>}
        </div>

        <aside className="inspector">
          {selectedConcept ? (
            <>
              <div className="inspector-heading">
                <div><span className="eyebrow">概念</span><strong>{selectedConcept.id}</strong></div>
                <button type="button" title="删除概念" onClick={() => deleteItem(selectedConcept.id)}><Trash2 size={16} /></button>
              </div>
              <label>名称<input value={selectedConcept.data.label} onChange={(event) => updatePointData(selectedConcept.id, { label: event.target.value })} /></label>
              <label className="grow-field">客观定义<textarea value={selectedConcept.data.definition} onChange={(event) => updatePointData(selectedConcept.id, { definition: event.target.value })} /></label>
              {selectedReplacements.map((replacement) => (
                <div className="replacement-definition" key={replacement.replaceWith}>
                  <div className="replacement-expression">
                    <span>{replacement.points.join(' + ')}</span>
                    <strong>→</strong>
                    <span>{replacement.replaceWith}</span>
                  </div>
                  <div className="replacement-segment" role="group" aria-label={`${replacement.replaceWith} 显示方式`}>
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
                <button type="button" title="删除推导" onClick={() => deleteItem(selectedDerivation.id)}><Trash2 size={16} /></button>
              </div>
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
              <label>问题引入<textarea value={selectedDerivation.data.introduction} onChange={(event) => updateHyperedge(selectedDerivation.id, { data: { introduction: event.target.value } })} /></label>
              <label className="grow-field">推导过程<textarea value={selectedDerivation.data.reasoning} onChange={(event) => updateHyperedge(selectedDerivation.id, { data: { reasoning: event.target.value } })} /></label>
              <label className="weight-field">成本权重<input type="number" min="0" step="1" value={selectedDerivation.weight} onChange={(event) => updateHyperedge(selectedDerivation.id, { weight: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
            </>
          ) : (
            <>
              <div className="inspector-heading"><div><span className="eyebrow">文档</span><strong>{document.schema}</strong></div></div>
              <label>说明<textarea value={document.document.description} onChange={(event) => commit((current) => ({ ...current, document: { ...current.document, description: event.target.value } }))} /></label>
              <div className="document-stats">
                <div><strong>{document.graph.points.length}</strong><span>概念</span></div>
                <div><strong>{document.graph.hyperedges.length}</strong><span>推导</span></div>
                <div><strong>{document.view.replacements.length}</strong><span>替换关系</span></div>
              </div>
              <div className="schema-note"><code>T(h) → y</code></div>
            </>
          )}
        </aside>
      </section>

      {jsonOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setJsonOpen(false)}>
          <section className="json-modal" role="dialog" aria-modal="true" aria-label="原始 JSON 编辑器">
            <header><div><span className="eyebrow">协议文档</span><strong>{document.schema}</strong></div><button type="button" title="关闭" onClick={() => setJsonOpen(false)}><X size={18} /></button></header>
            <textarea spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
            <footer><button type="button" className="text-button" onClick={() => {
              try {
                setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
              } catch {
                setStatus('JSON 语法无效');
              }
            }}>格式化</button><button type="button" className="primary-button" onClick={applyJson}>检查并应用</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  return <ReactFlowProvider><AuthoringCanvas /></ReactFlowProvider>;
}

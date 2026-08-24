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
  Search,
  Trash2,
  X,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import type { AuthoringDocument, Concept, Derivation, Position } from './domain';
import { parseDocument, touchDocument, uniqueId } from './domain';
import { ConceptNode, DerivationNode, type AuthoringFlowNode } from './GraphNodes';
import { layoutDocument, layoutNeighborhood } from './layout';
import { sampleDocument } from './sample';

const STORAGE_KEY = 'derivon.authoring.demo/v1';
const nodeTypes = { concept: ConceptNode, derivation: DerivationNode };

type ProjectedEdgeData = {
  kind: 'premise' | 'conclusion';
  derivationId: string;
  premiseId?: string;
};

type ProjectedEdge = Edge<ProjectedEdgeData>;

function initialDocument(): AuthoringDocument {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseDocument(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  const document = structuredClone(sampleDocument);
  document.view.positions = layoutDocument(document);
  return document;
}

function neighborhood(document: AuthoringDocument, selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const ids = new Set([selectedId]);
  for (const derivation of document.graph.derivations) {
    if (derivation.id === selectedId || derivation.conclusion === selectedId || derivation.premises.includes(selectedId)) {
      ids.add(derivation.id);
      ids.add(derivation.conclusion);
      derivation.premises.forEach((id) => ids.add(id));
    }
  }
  return ids;
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
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow<AuthoringFlowNode, ProjectedEdge>();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const commit = useCallback((updater: (current: AuthoringDocument) => AuthoringDocument) => {
    setDocument((current) => touchDocument(updater(current)));
    setStatus('已自动保存');
  }, []);

  const deleteItem = useCallback((id: string) => {
    commit((current) => {
      const isConcept = current.graph.concepts.some((concept) => concept.id === id);
      const derivationIds = new Set(
        isConcept
          ? current.graph.derivations.filter((item) => item.conclusion === id || item.premises.includes(id)).map((item) => item.id)
          : [id],
      );
      const positions = { ...current.view.positions };
      delete positions[id];
      derivationIds.forEach((derivationId) => delete positions[derivationId]);
      return {
        ...current,
        graph: {
          concepts: isConcept ? current.graph.concepts.filter((concept) => concept.id !== id) : current.graph.concepts,
          derivations: current.graph.derivations.filter((item) => !derivationIds.has(item.id)),
        },
        view: { positions },
      };
    });
    setFocusLayouts({});
    setFocusedId(null);
    setSelectedId((current) => (current === id ? null : current));
  }, [commit]);

  const activeIds = useMemo(() => neighborhood(document, focusedId), [document, focusedId]);
  const focusPositions = useMemo(
    () => focusedId
      ? focusLayouts[focusedId] ?? layoutNeighborhood(document, activeIds, focusedId)
      : null,
    [activeIds, document, focusLayouts, focusedId],
  );

  const projectedNodes = useMemo<AuthoringFlowNode[]>(() => {
    const dimmed = (id: string) => !!focusedId && !activeIds.has(id);
    const position = (id: string) => focusPositions?.[id] ?? document.view.positions[id] ?? { x: 0, y: 0 };
    return [
      ...document.graph.concepts.map((concept): AuthoringFlowNode => ({
        id: concept.id,
        type: 'concept',
        position: position(concept.id),
        selected: selectedId === concept.id,
        data: { label: concept.label, definition: concept.definition, dimmed: dimmed(concept.id), onDelete: deleteItem },
      })),
      ...document.graph.derivations.map((derivation): AuthoringFlowNode => ({
        id: derivation.id,
        type: 'derivation',
        position: position(derivation.id),
        selected: selectedId === derivation.id,
        data: { weight: derivation.weight, premiseCount: derivation.premises.length, dimmed: dimmed(derivation.id), onDelete: deleteItem },
      })),
    ];
  }, [activeIds, deleteItem, document, focusPositions, focusedId, selectedId]);

  // React Flow owns high-frequency drag state; the document is updated only on drag stop.
  const [nodes, setNodes, onNodesChange] = useNodesState<AuthoringFlowNode>([]);

  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return projectedNodes.map((node) => ({
        ...node,
        measured: previous.get(node.id)?.measured,
      }));
    });
  }, [projectedNodes, setNodes]);

  useEffect(() => {
    if (!focusedId) return;
    const frame = window.requestAnimationFrame(() => {
      void fitView({ nodes: [...activeIds].map((id) => ({ id })), padding: 0.28, duration: 260, maxZoom: 1.25 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIds, fitView, focusedId]);

  const edges = useMemo<ProjectedEdge[]>(() => {
    const result: ProjectedEdge[] = [];
    for (const derivation of document.graph.derivations) {
      const derivationActive = !focusedId || activeIds.has(derivation.id);
      for (const premise of derivation.premises) {
        result.push({
          id: `premise:${derivation.id}:${premise}`,
          source: premise,
          target: derivation.id,
          sourceHandle: 'concept-out',
          targetHandle: 'premise-in',
          type: 'bezier',
          deletable: false,
          data: { kind: 'premise', derivationId: derivation.id, premiseId: premise },
          style: { stroke: '#2f7087', strokeWidth: derivationActive ? 1.8 : 1.1, opacity: derivationActive ? 0.9 : 0.08 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2f7087', width: 14, height: 14 },
        });
      }
      result.push({
        id: `conclusion:${derivation.id}`,
        source: derivation.id,
        target: derivation.conclusion,
        sourceHandle: 'conclusion-out',
        targetHandle: 'concept-in',
        type: 'bezier',
        deletable: false,
        data: { kind: 'conclusion', derivationId: derivation.id },
        style: { stroke: '#a44f3f', strokeWidth: derivationActive ? 2 : 1.2, opacity: derivationActive ? 0.92 : 0.08 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a44f3f', width: 15, height: 15 },
      });
    }
    return result;
  }, [activeIds, document.graph.derivations, focusedId]);

  const persistNodePosition = useCallback((id: string, position: Position) => {
    if (focusedId && activeIds.has(id)) {
      setFocusLayouts((current) => ({
        ...current,
        [focusedId]: {
          ...(current[focusedId] ?? layoutNeighborhood(document, activeIds, focusedId)),
          [id]: position,
        },
      }));
      setStatus('局部视图布局已更新');
      return;
    }
    commit((current) => ({
      ...current,
      view: { positions: { ...current.view.positions, [id]: position } },
    }));
  }, [activeIds, commit, document, focusedId]);

  const addConcept = useCallback((position?: Position) => {
    const id = uniqueId('c', document.graph.concepts.map((concept) => concept.id));
    const nextPosition = position ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    commit((current) => ({
      ...current,
      graph: { ...current.graph, concepts: [...current.graph.concepts, { id, label: '新概念', definition: '' }] },
      view: { positions: { ...current.view.positions, [id]: nextPosition } },
    }));
    setFocusLayouts({});
    setFocusedId(null);
    setSelectedId(id);
  }, [commit, document.graph.concepts, screenToFlowPosition]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceConcept = document.graph.concepts.some((item) => item.id === connection.source);
    const targetConcept = document.graph.concepts.some((item) => item.id === connection.target);
    const sourceDerivation = document.graph.derivations.some((item) => item.id === connection.source);
    const targetDerivation = document.graph.derivations.some((item) => item.id === connection.target);

    if ((sourceConcept && (targetConcept || targetDerivation)) || (sourceDerivation && targetConcept)) {
      setFocusLayouts({});
      setFocusedId(null);
    }

    if (sourceConcept && targetConcept) {
      const id = uniqueId('h', document.graph.derivations.map((item) => item.id));
      const sourcePosition = document.view.positions[connection.source] ?? { x: 0, y: 0 };
      const targetPosition = document.view.positions[connection.target] ?? { x: sourcePosition.x + 240, y: sourcePosition.y };
      commit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          derivations: [...current.graph.derivations, {
            id,
            premises: [connection.source!],
            conclusion: connection.target!,
            introduction: '',
            reasoning: '',
            weight: 1,
          }],
        },
        view: {
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
          derivations: current.graph.derivations.map((item) =>
            item.id === connection.target && !item.premises.includes(connection.source!)
              ? { ...item, premises: [...item.premises, connection.source!] }
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
          derivations: current.graph.derivations.map((item) =>
            item.id === connection.source ? { ...item, conclusion: connection.target! } : item,
          ),
        },
      }));
      setSelectedId(connection.source);
      return;
    }
    setStatus('只能连接“概念 → 概念 / 推导”或“推导 → 概念”');
  }, [commit, document]);

  const updateConcept = useCallback((id: string, patch: Partial<Concept>) => {
    commit((current) => ({
      ...current,
      graph: { ...current.graph, concepts: current.graph.concepts.map((item) => item.id === id ? { ...item, ...patch, id } : item) },
    }));
  }, [commit]);

  const updateDerivation = useCallback((id: string, patch: Partial<Derivation>) => {
    commit((current) => ({
      ...current,
      graph: { ...current.graph, derivations: current.graph.derivations.map((item) => item.id === id ? { ...item, ...patch, id } : item) },
    }));
  }, [commit]);

  const applyLayout = useCallback(() => {
    const positions = layoutDocument(document);
    setFocusedId(null);
    setFocusLayouts({});
    commit((current) => ({ ...current, view: { positions } }));
    window.setTimeout(() => void fitView({ padding: 0.12, duration: 350 }), 40);
  }, [commit, document, fitView]);

  const findConcept = useCallback(() => {
    const query = search.trim().toLocaleLowerCase();
    const concept = document.graph.concepts.find((item) => item.id.toLocaleLowerCase() === query || item.label.toLocaleLowerCase().includes(query));
    if (!concept) {
      setStatus('没有匹配的概念');
      return;
    }
    setFocusedId(null);
    setSelectedId(concept.id);
    void fitView({ nodes: [{ id: concept.id }], padding: 2, duration: 300, maxZoom: 1.4 });
  }, [document.graph.concepts, fitView, search]);

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
      const positions = Object.keys(imported.view?.positions ?? {}).length ? imported.view.positions : layoutDocument(imported);
      setDocument({ ...imported, view: { positions } });
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setStatus('文档已打开');
      window.setTimeout(() => fitView({ padding: 0.12, duration: 300 }), 20);
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
      const positions = Object.keys(parsed.view?.positions ?? {}).length ? parsed.view.positions : layoutDocument(parsed);
      setDocument({ ...parsed, view: { positions } });
      setFocusLayouts({});
      setFocusedId(null);
      setSelectedId(null);
      setJsonOpen(false);
      setStatus('JSON 已应用');
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split('\n')[0] : 'JSON 无效');
    }
  }, [jsonText]);

  const selectNode = useCallback((id: string) => {
    if (selectedId === id) {
      setFocusedId(id);
      return;
    }
    // Selecting another node inside a local view must not discard that view.
    setSelectedId(id);
  }, [selectedId]);

  const toggleFocusedView = useCallback(() => {
    setFocusedId((current) => current ? null : selectedId);
  }, [selectedId]);

  const selectedConcept = document.graph.concepts.find((item) => item.id === selectedId);
  const selectedDerivation = document.graph.derivations.find((item) => item.id === selectedId);
  const labelById = useMemo(() => new Map(document.graph.concepts.map((item) => [item.id, item.label])), [document.graph.concepts]);

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
          <button type="button" title="自动布局" onClick={applyLayout}><LayoutGrid size={17} /></button>
          <button
            type="button"
            className={focusedId ? 'is-active' : ''}
            title={focusedId ? '关闭局部视图' : '开启局部视图'}
            disabled={!selectedId}
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
        <div className="canvas-wrap">
          <ReactFlow<AuthoringFlowNode, ProjectedEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeDragStop={(_, node) => persistNodePosition(node.id, node.position)}
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => {
              setFocusedId(null);
              setSelectedId(null);
            }}
            onNodesDelete={(deleted) => deleted.forEach((node) => deleteItem(node.id))}
            defaultViewport={{ x: 28, y: 90, zoom: 0.72 }}
            minZoom={0.08}
            maxZoom={2}
            connectionLineStyle={{ stroke: '#4f5961', strokeWidth: 1.5 }}
            connectionLineType={ConnectionLineType.Bezier}
            defaultEdgeOptions={{ type: 'bezier' }}
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
              <label>名称<input value={selectedConcept.label} onChange={(event) => updateConcept(selectedConcept.id, { label: event.target.value })} /></label>
              <label className="grow-field">客观定义<textarea value={selectedConcept.definition} onChange={(event) => updateConcept(selectedConcept.id, { definition: event.target.value })} /></label>
              <div className="relation-summary">
                <span>作为前提 {document.graph.derivations.filter((item) => item.premises.includes(selectedConcept.id)).length}</span>
                <span>作为结论 {document.graph.derivations.filter((item) => item.conclusion === selectedConcept.id).length}</span>
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
                  {selectedDerivation.premises.length === 0 && <span className="empty-tail">空集 ∅</span>}
                  {selectedDerivation.premises.map((id) => (
                    <span className="chip" key={id}>{labelById.get(id) ?? id}<button type="button" title="移除此前提" onClick={() => updateDerivation(selectedDerivation.id, { premises: selectedDerivation.premises.filter((item) => item !== id) })}><X size={12} /></button></span>
                  ))}
                </div>
                <span className="field-title">结论</span>
                <span className="conclusion-label">{labelById.get(selectedDerivation.conclusion) ?? selectedDerivation.conclusion}</span>
              </div>
              <label>问题引入<textarea value={selectedDerivation.introduction} onChange={(event) => updateDerivation(selectedDerivation.id, { introduction: event.target.value })} /></label>
              <label className="grow-field">推导过程<textarea value={selectedDerivation.reasoning} onChange={(event) => updateDerivation(selectedDerivation.id, { reasoning: event.target.value })} /></label>
              <label className="weight-field">成本权重<input type="number" min="0" step="1" value={selectedDerivation.weight} onChange={(event) => updateDerivation(selectedDerivation.id, { weight: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>
            </>
          ) : (
            <>
              <div className="inspector-heading"><div><span className="eyebrow">文档</span><strong>{document.schema}</strong></div></div>
              <label>说明<textarea value={document.document.description} onChange={(event) => commit((current) => ({ ...current, document: { ...current.document, description: event.target.value } }))} /></label>
              <div className="document-stats">
                <div><strong>{document.graph.concepts.length}</strong><span>概念</span></div>
                <div><strong>{document.graph.derivations.length}</strong><span>推导</span></div>
                <div><strong>{document.graph.derivations.reduce((sum, item) => sum + item.premises.length + 1, 0)}</strong><span>投影线</span></div>
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
            }}>格式化</button><button type="button" className="primary-button" onClick={applyJson}>校验并应用</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  return <ReactFlowProvider><AuthoringCanvas /></ReactFlowProvider>;
}

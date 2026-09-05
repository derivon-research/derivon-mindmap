import { ChevronRight, FileText, GitBranch, Layers, List, Network, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DocumentPreview } from '../../app/DocumentPreview';
import type { AuthoringModeProps } from '../../app/host';
import type { GraphEvent, GraphObject, GraphView } from '../../rendering';
import { objectDocumentPreview, type TextResource } from '../../workspace/index';
import { WorkspaceSearch } from './WorkspaceSearch';
import { AuthoringDocumentEditor, type DocumentDrafts } from './AuthoringDocumentEditor';
import { AuthoringAgentPane } from './AuthoringAgentPane';
import './authoring.css';

const GraphRenderer = lazy(async () => ({ default: (await import('../../rendering')).GraphRenderer }));
type ConceptDraft = { label: string; id: string; format: 'markdown' | 'html' };
const emptyDraft: ConceptDraft = { label: '', id: '', format: 'markdown' };

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="authoring-icon" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

function DocumentView({ title, resource, documentPath, readAsset }: { title: string; resource: TextResource; documentPath: string; readAsset?: AuthoringModeProps['readAsset'] }) {
  return <section className="authoring-document" aria-label={`${title} 文档`}>{resource.status === 'ready'
    ? <DocumentPreview title={`${title} 文档`} html={resource.text} documentPath={documentPath} readAsset={readAsset} />
    : <div className="authoring-document-error" role="alert"><FileText /><div><strong>无法读取对象文档</strong><p>{resource.message}</p></div></div>}</section>;
}

export function AuthoringMode({ workspace, content, authoring, selectedConceptId, onSelectConcept, syncStatus, onRetrySync, readAsset }: AuthoringModeProps) {
  const draftKey = `${workspace.id}:create-concept`;
  const canCreate = Boolean(authoring) && !content.requiresMigrationConsent;
  const [selected, setSelected] = useState<GraphObject | null>(selectedConceptId ? { kind: 'concept', id: selectedConceptId } : null);
  const [draft, setDraft] = useState<ConceptDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [relationsOpen, setRelationsOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches);
  const [agentOpen, setAgentOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches);
  const [documentDrafts] = useState<DocumentDrafts>(() => new Map());
  const [view, setView] = useState<'objects' | 'graph'>('graph');
  const [lastOpenedObject, setLastOpenedObject] = useState<GraphObject | null>(null);
  const [neighbourhoodFocusId, setNeighbourhoodFocusId] = useState<string | null>(selectedConceptId);
  const [graphKind, setGraphKind] = useState<'overview' | 'neighbourhood'>('overview');
  const dirty = Boolean(draft.label || draft.id || draft.format !== 'markdown');

  useEffect(() => { authoring?.protectDraft(draftKey, dirty); }, [authoring, dirty, draftKey]);
  useEffect(() => { if (view === 'objects') setLastOpenedObject(selected); }, [view, selected]);
  useEffect(() => {
    if (selectedConceptId && (selected?.kind !== 'concept' || selected.id !== selectedConceptId)) {
      setSelected({ kind: 'concept', id: selectedConceptId });
      setNeighbourhoodFocusId(selectedConceptId);
    }
  }, [selectedConceptId]);

  const points = content.graph.points;
  const edges = content.graph.hyperedges;
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);
  const concept = selected?.kind === 'concept' ? pointById.get(selected.id) : undefined;
  const derivation = selected?.kind === 'derivation' ? edgeById.get(selected.id) : undefined;
  const title = concept?.data.label ?? (derivation ? derivationTitle(derivation) : '');
  const documentObject = view === 'objects' ? selected : lastOpenedObject;
  const documentConcept = documentObject?.kind === 'concept' ? pointById.get(documentObject.id) : undefined;
  const documentDerivation = documentObject?.kind === 'derivation' ? edgeById.get(documentObject.id) : undefined;
  const reference = documentConcept?.data ?? documentDerivation?.data;
  const documentTitle = documentConcept?.data.label ?? (documentDerivation ? derivationTitle(documentDerivation) : '');
  const incoming = concept ? edges.filter((edge) => edge.head === concept.id) : [];
  const outgoing = concept ? edges.filter((edge) => edge.tails.includes(concept.id)) : [];
  const focusId = neighbourhoodFocusId;
  const neighbourhoodEdges = useMemo(() => focusId ? edges.filter((edge) => edge.head === focusId || edge.tails.includes(focusId)) : [], [edges, focusId]);
  const neighbourhoodIds = useMemo(() => new Set([
    ...(focusId ? [focusId] : []), ...neighbourhoodEdges.flatMap((edge) => [edge.head, ...edge.tails]),
  ]), [focusId, neighbourhoodEdges]);
  const graphView = useMemo<GraphView>(() => ({
    kind: graphKind,
    concepts: points.filter((point) => graphKind === 'overview' || neighbourhoodIds?.has(point.id)).map((point) => ({ id: point.id, label: point.data.label, marks: selected?.kind === 'concept' && point.id === selected.id ? ['selected'] : [] })),
    hyperedges: (graphKind === 'overview' ? edges : neighbourhoodEdges).map((edge) => ({ ...edge, marks: selected?.kind === 'derivation' && edge.id === selected.id ? ['selected'] : [] })),
  }), [edges, graphKind, neighbourhoodIds, neighbourhoodEdges, points, selected]);

  const openObject = (object: GraphObject) => {
    setSelected(object); onSelectConcept(object.kind === 'concept' ? object.id : null); setView('objects'); setFormOpen(false);
    if (object.kind === 'concept') setNeighbourhoodFocusId(object.id);
    if (window.matchMedia('(max-width: 700px)').matches) setRelationsOpen(false);
  };
  const graphEvent = (event: GraphEvent) => {
    const object = event.object;
    if (!object) { setSelected(null); onSelectConcept(null); return; }
    const openSelected = graphKind === 'neighbourhood' && selected?.kind === object.kind && selected.id === object.id;
    if (event.type === 'activate' || openSelected) { openObject(object); return; }
    setSelected(object);
    onSelectConcept(object.kind === 'concept' ? object.id : null);
    if (object.kind === 'concept') setNeighbourhoodFocusId(object.id);
    if (graphKind === 'overview') setGraphKind('neighbourhood');
  };
  const cancelCreate = () => { setDraft(emptyDraft); setFormError(''); setFormOpen(false); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setFormError('');
    if (!draft.label.trim()) { setFormError('请输入概念名称'); return; }
    if (!authoring) { setFormError('当前工作区不可创作'); return; }
    try {
      const id = authoring.createConcept({ label: draft.label, id: draft.id.trim() || undefined, format: draft.format });
      setDraft(emptyDraft); authoring.protectDraft(draftKey, false); setFormOpen(false); setSelected({ kind: 'concept', id }); setNeighbourhoodFocusId(id); onSelectConcept(id); setView('objects');
    } catch (error) { setFormError(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="authoring-workbench" data-derivon-mode="authoring" data-relations-open={relationsOpen} data-agent-open={agentOpen} data-selected-concept={selectedConceptId ?? ''} aria-label="创作侧">
    <div className="authoring-workbar"><div className="authoring-tabs" role="group" aria-label="创作视图"><button type="button" aria-pressed={view === 'objects'} onClick={() => setView('objects')}><List size={15} />对象</button><button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Network size={15} />图浏览</button></div><span className="authoring-flex" />{canCreate && <button type="button" onClick={() => { setFormOpen(true); setView('objects'); }}><Plus size={15} />新建概念</button>}{syncStatus && <span className={`authoring-sync is-${syncStatus.state}`} aria-label="保存状态" aria-live="polite"><span />{syncStatus.label}{syncStatus.state === 'error' && onRetrySync && <button type="button" onClick={onRetrySync}>重试保存</button>}</span>}</div>
    {content.requiresMigrationConsent && <p className="authoring-diagnostics">工作区格式需要升级，当前仅可浏览。</p>}
    <div className="authoring-workspace">
      <aside className={`authoring-context-pane ${relationsOpen ? '' : 'is-collapsed'}`} aria-label="关系区"><header><IconButton label={relationsOpen ? '收起关系区' : '展开关系区'} onClick={() => setRelationsOpen(!relationsOpen)}>{relationsOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</IconButton>{relationsOpen && <strong>关系</strong>}</header><div className="authoring-context-body" hidden={!relationsOpen}>{derivation ? <DerivationEndpoints edge={derivation} pointById={pointById} onOpen={openObject} /> : <><RelationGroup title="前提推导" eyebrow="如何得到" edges={incoming} direction="incoming" pointById={pointById} onOpen={openObject} /><RelationGroup title="后续推导" eyebrow="能够到达哪里" edges={outgoing} direction="outgoing" pointById={pointById} onOpen={openObject} />{!concept && <p className="authoring-empty-note">选择概念后查看关系</p>}</>}</div></aside>
      <div className="authoring-content">{view === 'graph' && <main className="authoring-graph-page"><header><div className="authoring-tabs" role="group" aria-label="图视图"><button type="button" aria-pressed={graphKind === 'overview'} onClick={() => setGraphKind('overview')}>全图</button><button type="button" aria-pressed={graphKind === 'neighbourhood'} disabled={!focusId} onClick={() => setGraphKind('neighbourhood')}>关联布局</button></div><span className="authoring-flex" />{selected && <button type="button" onClick={() => setView('objects')}><FileText size={15} />回到对象</button>}</header><div className="authoring-graph"><Suspense fallback={<span role="status">正在载入图…</span>}><GraphRenderer view={graphView} onEvent={graphEvent} /></Suspense></div><div className="authoring-graph-caption"><span>{title || '未选择对象'}</span><span>{graphView.concepts.length} 个概念 · {graphView.hyperedges.length} 条推导</span></div></main>
        }<main className="authoring-focus-page" hidden={view === 'graph'}><header className="authoring-focus-nav"><Layers size={17} /><WorkspaceSearch content={content} onOpenObject={openObject} /><span className="authoring-current-object">{formOpen ? '新建概念' : title}</span></header><div className="authoring-focus-editor">{formOpen ? <ConceptForm draft={draft} error={formError} onChange={setDraft} onSubmit={submit} onClose={() => setFormOpen(false)} onCancel={cancelCreate} /> : reference ? <article className="authoring-object"><header className="authoring-object-heading"><div><span className="authoring-eyebrow">{documentConcept ? '概念文档' : '推导文档'}</span><h1>{documentTitle}</h1><code>{documentObject?.id}</code></div><span className="authoring-status-ready">有效内容</span></header><div className="authoring-document-meta"><span>{reference.format === 'markdown' ? 'Markdown' : 'HTML'}</span><code>{reference.document}</code></div>{authoring && !content.requiresMigrationConsent && documentObject ? <AuthoringDocumentEditor key={`${documentObject.kind}:${documentObject.id}`} object={documentObject} content={content} authoring={authoring} readAsset={readAsset} drafts={documentDrafts} onOpenObject={openObject} /> : <DocumentView title={documentTitle} documentPath={`${reference.document}/index.html`} readAsset={readAsset} resource={objectDocumentPreview(content, reference)} />}</article> : <div className="authoring-empty"><FileText size={30} strokeWidth={1.3} /><h1>{points.length ? '选择一个对象' : canCreate ? '创建第一个概念' : '工作区中还没有概念'}</h1><p>{workspace.name}</p>{points.length ? <button type="button" onClick={() => { setGraphKind('overview'); setView('graph'); }}><Network size={16} />浏览全图</button> : canCreate && <button type="button" className="authoring-primary" onClick={() => setFormOpen(true)}><Plus size={16} />创建第一个概念</button>}</div>}</div></main></div>
      <AuthoringAgentPane open={agentOpen} onToggle={() => setAgentOpen(!agentOpen)} contextLabel={title || workspace.name} />
    </div>
    {content.diagnostics.length > 0 && <details className="authoring-diagnostics"><summary>{content.diagnostics.length} 个本地内容问题</summary>{content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}><code>{item.path}</code> {item.message}</p>)}</details>}
  </section>;
}

function ConceptForm({ draft, error, onChange, onSubmit, onClose, onCancel }: { draft: ConceptDraft; error: string; onChange: (draft: ConceptDraft) => void; onSubmit: (event: FormEvent) => void; onClose: () => void; onCancel: () => void }) {
  return <article className="authoring-object"><header className="authoring-object-heading"><div><span className="authoring-eyebrow">新建概念</span><code>尚未创建</code></div><div className="authoring-heading-actions"><span className="authoring-status-draft">编辑草稿</span><IconButton label="关闭" onClick={onClose}><X size={16} /></IconButton></div></header><form className="authoring-concept-form" onSubmit={onSubmit}><label className="authoring-field authoring-title-field">名称<input autoFocus aria-label="名称" placeholder="概念名称" value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} /></label><label className="authoring-field">ID（可选）<input value={draft.id} placeholder="自动生成" onChange={(event) => onChange({ ...draft, id: event.target.value })} /></label><label className="authoring-field">文档格式<select value={draft.format} onChange={(event) => onChange({ ...draft, format: event.target.value as ConceptDraft['format'] })}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>{error && <p className="authoring-form-error" role="alert">{error}</p>}<footer className="authoring-editor-actions"><span className="authoring-flex" /><button type="button" onClick={onCancel}>取消</button><button type="submit" className="authoring-primary"><Plus size={16} />创建</button></footer></form></article>;
}

type RelationGroupProps = { title: string; eyebrow: string; edges: AuthoringModeProps['content']['graph']['hyperedges']; direction: 'incoming' | 'outgoing'; pointById: Map<string, AuthoringModeProps['content']['graph']['points'][number]>; onOpen: (object: GraphObject) => void };
function DerivationEndpoints({ edge, pointById, onOpen }: Pick<RelationGroupProps, 'pointById' | 'onOpen'> & { edge: RelationGroupProps['edges'][number] }) {
  return <>{[{ title: '联合前提', ids: edge.tails }, { title: '结果概念', ids: [edge.head] }].map(({ title, ids }) => <section className="authoring-relations" key={title}>
    <header><h2>{title} <small>{ids.length}</small></h2></header><div className="authoring-relation-concepts">{ids.map((id) => <button type="button" key={id} onClick={() => onOpen({ kind: 'concept', id })}><FileText size={13} />{pointById.get(id)?.data.label ?? id}</button>)}</div>{!ids.length && <p className="authoring-empty-note">空前提</p>}
  </section>)}</>;
}
function derivationTitle(edge: RelationGroupProps['edges'][number]): string {
  const label = (edge.data as { label?: unknown }).label;
  return typeof label === 'string' && label.trim() ? label : `推导 ${edge.id}`;
}
function RelationGroup({ title, eyebrow, edges, direction, pointById, onOpen }: RelationGroupProps) {
  return <section className="authoring-relations"><header><div><span className="authoring-eyebrow">{eyebrow}</span><h2>{title} <small>{edges.length}</small></h2></div></header><div className="authoring-relation-items">{edges.map((edge) => <article className="authoring-relation" key={edge.id}><button type="button" className="authoring-relation-title" onClick={() => onOpen({ kind: 'derivation', id: edge.id })}><GitBranch size={15} /><strong>{derivationTitle(edge)}</strong><ChevronRight size={14} /></button><div className="authoring-relation-concepts">{(direction === 'incoming' ? edge.tails : [edge.head]).map((id) => <button type="button" key={id} onClick={() => onOpen({ kind: 'concept', id })}><FileText size={13} />{pointById.get(id)?.data.label ?? id}</button>)}</div><small>{edge.tails.length ? `${edge.tails.length} 个联合前提` : '空前提'} · 成本 {edge.weight}</small></article>)}{!edges.length && <p className="authoring-empty-note">暂无{direction === 'incoming' ? '前提' : '后续'}推导</p>}</div></section>;
}

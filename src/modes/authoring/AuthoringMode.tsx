import { ChevronRight, Compass, FileText, GitBranch, Layers, List, Network, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MarkdownPreview } from '../../app/DocumentPreview';
import { useObjectDocument } from '../../app/useObjectDocument';
import type { AuthoringModeProps } from '../../app/host';
import type { GraphEvent, GraphObject, GraphView } from '../../rendering';
import { objectDocumentSource, type TextResource } from '../../workspace/index';
import { RetainedGraph } from '../RetainedGraph';
import { WorkspaceSearch } from './WorkspaceSearch';
import { CreateObjectDialog, type CreateObjectRequest } from './CreateObjectDialog';
import { DeleteObject } from './DeleteObject';
import { DerivationStructure } from './DerivationStructure';
import { AuthoringDocumentEditor, type DocumentDrafts } from './AuthoringDocumentEditor';
import { AuthoringAgentPane } from './AuthoringAgentPane';
import { ObjectMetadata, derivationTitle } from './ObjectMetadata';
import { OrientationOutline } from './orientation/OrientationOutline';
import { OrientationWorkbench } from './orientation/OrientationWorkbench';
import { useOrientationDraft } from './orientation/useOrientationDraft';
import './orientation/orientation.css';
import './authoring.css';

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="authoring-icon" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

function DocumentView({ title, resource, documentPath, readAsset, readDocuments, active }: {
  title: string; resource: TextResource | undefined; documentPath: string; active: boolean;
  readAsset?: AuthoringModeProps['readAsset']; readDocuments?: AuthoringModeProps['readDocuments'];
}) {
  const current = useObjectDocument(documentPath, resource, readDocuments, active);
  return <section className="authoring-document" aria-label={`${title} 文档`}>{!current ? <p role="status">正在载入文档…</p> : current.status === 'ready'
    ? <MarkdownPreview title={`${title} 文档`} markdown={current.text} documentPath={documentPath} readAsset={readAsset} />
    : <div className="authoring-document-error" role="alert"><FileText /><div><strong>无法读取对象文档</strong><p>{current.message}</p></div></div>}</section>;
}

export function AuthoringMode({ active = true, workspace, content, authoring, routeSolver, selectedConceptId, onSelectConcept, syncStatus, onRetrySync, readAsset, readDocuments }: AuthoringModeProps) {
  const canCreate = Boolean(authoring);
  const [selected, setSelected] = useState<GraphObject | null>(selectedConceptId ? { kind: 'concept', id: selectedConceptId } : null);
  const [createRequest, setCreateRequest] = useState<CreateObjectRequest | null>(null);
  const [relationsOpen, setRelationsOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches);
  const [agentOpen, setAgentOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches);
  const [documentDrafts] = useState<DocumentDrafts>(() => new Map());
  const [view, setView] = useState<'objects' | 'graph' | 'orientation'>('graph');
  // A workspace has one orientation configuration and it is always there, so it is a fixed
  // side of this workbench: a centre view, reached from the workbar.
  const orientation = useOrientationDraft(content, authoring, workspace.id);
  const [lastOpenedObject, setLastOpenedObject] = useState<GraphObject | null>(null);
  // Deletion is a dialogue, like creation: entered from the object's own page, finished or
  // left, with nothing else edited meanwhile. A plan belongs to the object it was read on.
  const [deleting, setDeleting] = useState<GraphObject | null>(null);
  const [neighbourhoodFocusId, setNeighbourhoodFocusId] = useState<string | null>(selectedConceptId);
  const [graphKind, setGraphKind] = useState<'overview' | 'neighbourhood'>('overview');

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
  const title = concept?.data.label ?? (derivation ? derivationTitle(content.graph, derivation) : '');
  const documentObject = view === 'objects' ? selected : lastOpenedObject;
  const documentConcept = documentObject?.kind === 'concept' ? pointById.get(documentObject.id) : undefined;
  const documentDerivation = documentObject?.kind === 'derivation' ? edgeById.get(documentObject.id) : undefined;
  const reference = documentConcept?.data ?? documentDerivation?.data;
  const documentTitle = documentConcept?.data.label ?? (documentDerivation ? derivationTitle(content.graph, documentDerivation) : '');
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
    setSelected(object); onSelectConcept(object.kind === 'concept' ? object.id : null); setView('objects');
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
  // Creating is a dialogue, not a gesture: pick a kind, fill the form, land on the new
  // object's page. The relations pane offers the contextual shortcut — its plus buttons
  // prefill the derivation form with the current concept, without creating anything.
  const created = (object: GraphObject) => {
    setCreateRequest(null);
    openObject(object);
  };
  // A deleted object has no page to return to, and its neighbourhood no longer has a focus.
  const deleted = () => {
    setDeleting(null); setSelected(null); setLastOpenedObject(null); setNeighbourhoodFocusId(null);
    setGraphKind('overview'); onSelectConcept(null);
  };

  return <section className="authoring-workbench" data-derivon-mode="authoring" data-relations-open={relationsOpen} data-agent-open={agentOpen} data-selected-concept={selectedConceptId ?? ''} aria-label="创作侧">
    <div className="authoring-workbar"><div className="authoring-tabs" role="group" aria-label="创作视图"><button type="button" aria-pressed={view === 'objects'} onClick={() => setView('objects')}><List size={15} />对象</button><button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Network size={15} />图浏览</button><button type="button" aria-pressed={view === 'orientation'} onClick={() => setView('orientation')}><Compass size={15} />开局</button></div><span className="authoring-flex" />{canCreate && <button type="button" className="authoring-primary authoring-new-object" onClick={() => setCreateRequest({ step: 'kind' })}><Plus size={15} />新建</button>}{syncStatus && <span className={`authoring-sync is-${syncStatus.state}`} aria-label="保存状态" aria-live="polite"><span />{syncStatus.label}{syncStatus.state === 'error' && onRetrySync && <button type="button" onClick={onRetrySync}>重试保存</button>}</span>}</div>
    <div className="authoring-workspace">
      <aside className={`authoring-context-pane ${relationsOpen ? '' : 'is-collapsed'}`} aria-label={view === 'orientation' ? '开局大纲' : '关系区'}><header><IconButton label={relationsOpen ? '收起上下文区' : '展开上下文区'} onClick={() => setRelationsOpen(!relationsOpen)}>{relationsOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</IconButton>{relationsOpen && <strong>{view === 'orientation' ? '开局大纲' : '关系'}</strong>}</header><div className="authoring-context-body" hidden={!relationsOpen}>{view === 'orientation' ? <OrientationOutline content={content} state={orientation} routeSolver={routeSolver} editable={canCreate} /> : derivation ? (authoring
        ? <DerivationStructure key={derivation.id} edge={derivation} points={points} authoring={authoring} draftKey={`${workspace.id}:derivation-structure:${derivation.id}`} onOpen={openObject} />
        : <DerivationEndpoints edge={derivation} pointById={pointById} onOpen={openObject} />) : <><RelationGroup title="前提推导" eyebrow="如何得到" edges={incoming} direction="incoming" pointById={pointById} onOpen={openObject} onCreate={canCreate && concept ? () => setCreateRequest({ step: 'derivation', prefill: { conceptId: concept.id, role: 'head' } }) : undefined} /><RelationGroup title="后续推导" eyebrow="能够到达哪里" edges={outgoing} direction="outgoing" pointById={pointById} onOpen={openObject} onCreate={canCreate && concept ? () => setCreateRequest({ step: 'derivation', prefill: { conceptId: concept.id, role: 'tail' } }) : undefined} />{!concept && <p className="authoring-empty-note">选择概念后查看关系</p>}</>}</div></aside>
      <div className="authoring-content">{view === 'orientation' && <OrientationWorkbench active={active} content={content} state={orientation} authoring={authoring} routeSolver={routeSolver} />}{view === 'graph' && <main className="authoring-graph-page"><header><div className="authoring-tabs" role="group" aria-label="图视图"><button type="button" aria-pressed={graphKind === 'overview'} onClick={() => setGraphKind('overview')}>全图</button><button type="button" aria-pressed={graphKind === 'neighbourhood'} disabled={!focusId} onClick={() => setGraphKind('neighbourhood')}>关联布局</button></div><span className="authoring-flex" />{selected && <button type="button" onClick={() => setView('objects')}><FileText size={15} />回到对象</button>}</header><div className="authoring-graph"><RetainedGraph active={active} view={graphView} onEvent={graphEvent} /></div><div className="authoring-graph-caption"><span>{title || '未选择对象'}</span><span>{graphView.concepts.length} 个概念 · {graphView.hyperedges.length} 条推导</span></div></main>
        }<main className="authoring-focus-page" hidden={view !== 'objects'}><header className="authoring-focus-nav"><Layers size={17} /><WorkspaceSearch content={content} readDocuments={readDocuments} onOpenObject={openObject} /><span className="authoring-current-object">{title}</span></header><div className="authoring-focus-editor">{reference ? <article className="authoring-object"><ObjectMetadata object={documentConcept ? { kind: 'concept', point: documentConcept } : { kind: 'derivation', edge: documentDerivation! }} graph={content.graph} tags={content.tags} authoring={authoring} onDelete={authoring && documentObject ? () => setDeleting(documentObject) : undefined} />{authoring && documentObject ? <AuthoringDocumentEditor key={`${documentObject.kind}:${documentObject.id}`} object={documentObject} content={content} authoring={authoring} readAsset={readAsset} readDocuments={readDocuments} active={active && view === 'objects'} drafts={documentDrafts} onOpenObject={openObject} /> : <DocumentView title={documentTitle} documentPath={`${reference.document}/document.md`} active={active && view === 'objects'} readAsset={readAsset} readDocuments={readDocuments} resource={objectDocumentSource(content, reference)} />}</article> : <div className="authoring-empty"><FileText size={30} strokeWidth={1.3} /><h1>{points.length ? '选择一个对象' : canCreate ? '创建第一个概念' : '工作区中还没有概念'}</h1><p>{workspace.name}</p>{canCreate && !points.length && <button type="button" className="authoring-primary" onClick={() => setCreateRequest({ step: 'concept' })}><Plus size={16} />新建概念</button>}{points.length > 0 && <button type="button" onClick={() => { setGraphKind('overview'); setView('graph'); }}><Network size={16} />浏览全图</button>}</div>}</div></main></div>
      <AuthoringAgentPane open={agentOpen} onToggle={() => setAgentOpen(!agentOpen)} contextLabel={title || workspace.name} />
    </div>
    {content.diagnostics.length > 0 && <details className="authoring-diagnostics"><summary>{content.diagnostics.length} 个本地内容问题</summary>{content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}><code>{item.path}</code> {item.message}</p>)}</details>}
    {createRequest && authoring && <CreateObjectDialog graph={content.graph} authoring={authoring} request={createRequest} draftKey={`${workspace.id}:create-object`} onClose={() => setCreateRequest(null)} onCreated={created} />}
    {deleting && authoring && <DeleteObject key={`${deleting.kind}:${deleting.id}`} content={content} object={deleting} authoring={authoring} onClose={() => setDeleting(null)} onDeleted={deleted} onOpenObject={(object) => { setDeleting(null); openObject(object); }} blocked={documentDrafts.size > 0 ? '有未应用的文档草稿。删除方案里的引用修正作用在已生效的文档上，先应用或放弃草稿再删除。' : undefined} />}
  </section>;
}

type RelationGroupProps = { title: string; eyebrow: string; edges: AuthoringModeProps['content']['graph']['hyperedges']; direction: 'incoming' | 'outgoing'; pointById: Map<string, AuthoringModeProps['content']['graph']['points'][number]>; onOpen: (object: GraphObject) => void; onCreate?: () => void };
function DerivationEndpoints({ edge, pointById, onOpen }: Pick<RelationGroupProps, 'pointById' | 'onOpen'> & { edge: RelationGroupProps['edges'][number] }) {
  return <>{[{ title: '联合前提', ids: edge.tails }, { title: '结果概念', ids: [edge.head] }].map(({ title, ids }) => <section className="authoring-relations" key={title}>
    <header><h2>{title} <small>{ids.length}</small></h2></header><div className="authoring-relation-concepts">{ids.map((id) => <button type="button" key={id} onClick={() => onOpen({ kind: 'concept', id })}><FileText size={13} />{pointById.get(id)?.data.label ?? id}</button>)}</div>{!ids.length && <p className="authoring-empty-note">空前提</p>}
  </section>)}</>;
}
function RelationGroup({ title, eyebrow, edges, direction, pointById, onOpen, onCreate }: RelationGroupProps) {
  return <section className="authoring-relations"><header><div><span className="authoring-eyebrow">{eyebrow}</span><h2>{title} <small>{edges.length}</small></h2></div>{onCreate && <button type="button" className="authoring-icon authoring-relations-create" title={`新建${direction === 'incoming' ? '前提' : '后续'}推导`} aria-label={`新建${direction === 'incoming' ? '前提' : '后续'}推导`} onClick={onCreate}><Plus size={13} /></button>}</header><div className="authoring-relation-items">{edges.map((edge) => <article className="authoring-relation" key={edge.id}><button type="button" className="authoring-relation-title" onClick={() => onOpen({ kind: 'derivation', id: edge.id })}><GitBranch size={15} /><strong>{derivationTitle(pointById.size ? { points: [...pointById.values()], hyperedges: [] } : { points: [], hyperedges: [] }, edge)}</strong><ChevronRight size={14} /></button><div className="authoring-relation-concepts">{(direction === 'incoming' ? edge.tails : [edge.head]).map((id) => <button type="button" key={id} onClick={() => onOpen({ kind: 'concept', id })}><FileText size={13} />{pointById.get(id)?.data.label ?? id}</button>)}</div><small>{edge.tails.length ? `${edge.tails.length} 个联合前提` : '空前提'} · 成本 {edge.weight}</small></article>)}{!edges.length && <p className="authoring-empty-note">暂无{direction === 'incoming' ? '前提' : '后续'}推导</p>}</div></section>;
}

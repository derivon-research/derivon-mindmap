import Fuse from 'fuse.js';
import { ChevronLeft, ChevronRight, FileText, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AuthoringModeProps } from '../../app/host';
import type { GraphEvent, GraphView } from '../../rendering';
import { objectDocumentPaths, type TextResource } from '../../workspace/index';
import './authoring.css';

const GraphRenderer = lazy(async () => ({ default: (await import('../../rendering')).GraphRenderer }));
type ConceptDraft = { label: string; id: string; format: 'markdown' | 'html' };
const emptyDraft: ConceptDraft = { label: '', id: '', format: 'markdown' };

function htmlResource(content: AuthoringModeProps['content'], reference: { document: string; format: 'markdown' | 'html' }): TextResource {
  const paths = objectDocumentPaths(reference);
  const path = paths.find((candidate) => candidate.endsWith('/index.html')) ?? paths[0];
  return content.documents[path] ?? { status: 'error', message: `Missing document: ${path}` };
}

function DocumentView({ title, resource }: { title: string; resource: TextResource }) {
  return <section className="object-document" aria-label={`${title} 文档`}>
    {resource.status === 'ready'
      ? <iframe title={`${title} 文档`} sandbox="" srcDoc={resource.text} />
      : <div className="document-error" role="alert"><FileText aria-hidden="true" /><div><strong>无法读取对象文档</strong><p>{resource.message}</p></div></div>}
  </section>;
}

export function AuthoringMode({ workspace, content, authoring, selectedConceptId, onSelectConcept }: AuthoringModeProps) {
  const draftKey = `${workspace.id}:create-concept`;
  const canCreate = Boolean(authoring) && !content.requiresMigrationConsent;
  const [draft, setDraft] = useState<ConceptDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(() => canCreate && content.graph.points.length === 0);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [relationsOpen, setRelationsOpen] = useState(() => !window.matchMedia('(max-width: 560px)').matches);
  const [overview, setOverview] = useState(false);
  const dirty = Boolean(draft.label || draft.id || draft.format !== 'markdown');
  useEffect(() => { authoring?.protectDraft(draftKey, dirty); }, [authoring, dirty, draftKey]);

  const points = content.graph.points;
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const searchable = useMemo(() => points.map((point) => ({ point, body: objectDocumentPaths(point.data).map((path) => {
    const resource = content.documents[path];
    return resource?.status === 'ready' ? resource.text : '';
  }).join('\n') })), [content.documents, points]);
  const fuse = useMemo(() => new Fuse(searchable, { keys: ['point.data.label', 'point.id', 'body'], threshold: 0.35 }), [searchable]);
  const results = query.trim() ? fuse.search(query.trim()).slice(0, 12).map(({ item }) => item.point) : [];
  const selected = selectedConceptId ? pointById.get(selectedConceptId) : undefined;
  const incoming = selected ? content.graph.hyperedges.filter((edge) => edge.head === selected.id) : [];
  const outgoing = selected ? content.graph.hyperedges.filter((edge) => edge.tails.includes(selected.id)) : [];
  const view = useMemo<GraphView>(() => ({
    kind: 'overview',
    concepts: points.map((point) => ({ id: point.id, label: point.data.label, marks: point.id === selectedConceptId ? ['selected'] : [] })),
    hyperedges: content.graph.hyperedges.map((edge) => ({ ...edge, marks: [] })),
  }), [content.graph.hyperedges, points, selectedConceptId]);

  const selectConcept = (id: string) => {
    onSelectConcept(id);
    setQuery('');
    if (window.matchMedia('(max-width: 560px)').matches) setRelationsOpen(false);
  };
  const graphEvent = (event: GraphEvent) => {
    if (event.object?.kind === 'concept') onSelectConcept(event.object.id);
    if (event.type === 'activate' && event.object.kind === 'concept') setOverview(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!draft.label.trim()) { setFormError('请输入概念名称'); return; }
    if (!authoring) { setFormError('当前工作区不可创作'); return; }
    try {
      const id = authoring.createConcept({ label: draft.label, id: draft.id.trim() || undefined, format: draft.format });
      setDraft(emptyDraft);
      authoring.protectDraft(draftKey, false);
      setFormOpen(false);
      onSelectConcept(id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  return <section className="authoring-workbench" data-derivon-mode="authoring" data-selected-concept={selectedConceptId ?? ''} aria-label="创作侧">
    <header className="workbench-toolbar">
      <div className="workbench-search"><Search aria-hidden="true" /><input aria-label="搜索概念" placeholder="搜索名称、ID 或正文" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button className="icon-button" type="button" onClick={() => setQuery('')} title="清除搜索"><X aria-hidden="true" /></button>}
        {query.trim() && <div className="search-palette" role="listbox" aria-label="搜索结果">{results.length ? results.map((point) => <button role="option" aria-selected={point.id === selectedConceptId} key={point.id} onClick={() => selectConcept(point.id)}><span>{point.data.label}</span><code>{point.id}</code></button>) : <p>没有匹配的概念</p>}</div>}
      </div>
      {canCreate && <button type="button" className="toolbar-command" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" />新建概念</button>}
      <button type="button" className="toolbar-command" aria-pressed={overview} onClick={() => setOverview((shown) => !shown)}><Network aria-hidden="true" />{overview ? '返回对象' : '全图'}</button>
    </header>
    {content.requiresMigrationConsent && <p className="local-diagnostics">工作区格式需要升级，当前仅可浏览。</p>}
    {formOpen && <form className="concept-form" onSubmit={submit}>
      <div className="form-heading"><strong>新建概念</strong><button type="button" className="icon-button" title="关闭" onClick={() => setFormOpen(false)}><X aria-hidden="true" /></button></div>
      <label>名称<input autoFocus value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
      <label>ID（可选）<input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} /></label>
      <label>文档格式<select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as ConceptDraft['format'] })}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <button type="submit" className="primary-command"><Plus aria-hidden="true" />创建</button>
      <button type="button" className="toolbar-command" onClick={() => { setDraft(emptyDraft); setFormError(''); setFormOpen(false); }}>取消</button>
    </form>}
    {overview ? <div className="overview-pane"><Suspense fallback={<div role="status">正在载入全图…</div>}><GraphRenderer view={view} onEvent={graphEvent} /></Suspense></div> : <div className={`object-layout${relationsOpen ? '' : ' relations-collapsed'}`}>
      <aside className="relations-pane" aria-label="相关推导"><button type="button" className="collapse-command" onClick={() => setRelationsOpen((open) => !open)} title={relationsOpen ? '收起相关推导' : '展开相关推导'}>{relationsOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}</button>
        {relationsOpen && <div className="relations-content"><h2>相关推导</h2>{selected ? <><RelationGroup title="作为结果" edges={incoming} direction="incoming" pointById={pointById} onSelect={selectConcept} /><RelationGroup title="作为前提" edges={outgoing} direction="outgoing" pointById={pointById} onSelect={selectConcept} /></> : <p className="empty-note">选择概念后查看关系</p>}</div>}
      </aside>
      <main className="content-pane">{selected ? <><div className="object-heading"><div><span>概念</span><h1>{selected.data.label}</h1></div><code>{selected.id}</code></div><DocumentView title={selected.data.label} resource={htmlResource(content, selected.data)} /></> : <div className="empty-state"><FileText aria-hidden="true" /><h1>{points.length ? '选择一个概念' : canCreate ? '创建第一个概念' : '工作区中还没有概念'}</h1><p>{workspace.name}</p></div>}</main>
    </div>}
    {content.diagnostics.length > 0 && <details className="local-diagnostics"><summary>{content.diagnostics.length} 个本地内容问题</summary>{content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}><code>{item.path}</code> {item.message}</p>)}</details>}
  </section>;
}

type RelationGroupProps = { title: string; edges: AuthoringModeProps['content']['graph']['hyperedges']; direction: 'incoming' | 'outgoing'; pointById: Map<string, AuthoringModeProps['content']['graph']['points'][number]>; onSelect: (id: string) => void };
function RelationGroup({ title, edges, direction, pointById, onSelect }: RelationGroupProps) {
  return <section className="relation-group"><h3>{title}<span>{edges.length}</span></h3>{edges.length ? edges.map((edge) => {
    const relatedIds = direction === 'incoming' ? edge.tails : [edge.head];
    return <div className="relation-row" key={edge.id}><code>{edge.id}</code><span>{direction === 'incoming' ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}</span>{relatedIds.map((id) => <button type="button" key={id} onClick={() => onSelect(id)}>{pointById.get(id)?.data.label ?? id}</button>)}</div>;
  }) : <p className="empty-note">无</p>}</section>;
}

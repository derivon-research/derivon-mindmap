import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Code2, Eye, Pencil, Undo2 } from 'lucide-react';
import type { GraphObject } from '../../rendering';
import type { WorkspaceContent } from '../../workspace/index';
import type { AuthoringCommands } from '../../synchronization';
import type { EditorReferenceTarget } from '../../editorReferences';
import { resolveWorkspaceImageReference, IMAGE_FILE_EXTENSIONS, imageMimeType } from '../../workspace/imageReference';
import { DocumentPreview } from '../../app/DocumentPreview';
import { markdownToHtml } from '../../documentContent';
import './document-editor.css';

const DocumentEditor = lazy(async () => ({ default: (await import('../../DocumentEditor')).DocumentEditor }));
export type DocumentDraft = { source: string; images: Map<string, File> };
export type DocumentDrafts = Map<string, DocumentDraft>;

export function AuthoringDocumentEditor({ object, content, authoring, drafts, onOpenObject, readAsset }: {
  object: GraphObject; content: WorkspaceContent; authoring: AuthoringCommands;
  drafts: DocumentDrafts; onOpenObject: (object: GraphObject) => void;
  readAsset?: (path: string) => Promise<Uint8Array>;
}) {
  const owner = object.kind === 'concept' ? content.graph.points.find((item) => item.id === object.id)
    : content.graph.hyperedges.find((item) => item.id === object.id);
  const reference = owner?.data;
  const sourcePath = reference ? `${reference.document}/${reference.format === 'markdown' ? 'document.md' : 'index.html'}` : '';
  const resource = content.documents[sourcePath];
  const accepted = resource?.status === 'ready' ? resource.text : '';
  const key = `${object.kind}:${object.id}`;
  const [value, setValue] = useState(() => drafts.get(key)?.source ?? accepted);
  const [view, setView] = useState<'edit' | 'source' | 'preview'>(() => reference?.format === 'html' ? 'source' : 'edit');
  const [failure, setFailure] = useState('');
  const [applying, setApplying] = useState(false);
  const dirty = value !== accepted;
  const title = owner && 'label' in owner.data ? String(owner.data.label) : object.id;
  useEffect(() => { if (!drafts.has(key)) setValue(accepted); }, [accepted, drafts, key]);

  const targets = useMemo<EditorReferenceTarget[]>(() => {
    const names = new Map(content.graph.points.map((point) => [point.id, point.data.label]));
    const name = (id: string) => names.get(id) ?? id;
    return [
      ...content.graph.points.map((item) => ({ kind: 'concept' as const, item })),
      ...content.graph.hyperedges.map((item) => ({ kind: 'derivation' as const, item })),
    ].map(({ kind, item }) => ({ kind, id: item.id,
      label: 'label' in item.data && typeof item.data.label === 'string' ? item.data.label : item.id,
      detail: 'tails' in item ? `${item.tails.map(name).join(' + ') || '空前提'} → ${name(item.head)}` : `概念 · ${item.id}`,
      document: item.data.document,
      searchTerms: 'tails' in item ? [item.head, ...item.tails, name(item.head), ...item.tails.map(name)] : [],
    }));
  }, [content.graph]);

  const change = useCallback((source: string) => {
    const previous = drafts.get(key);
    drafts.set(key, { source, images: previous?.images ?? new Map() });
    setValue(source);
    if ((previous ? previous.source !== accepted : false) !== (source !== accepted)) authoring.protectDraft(`document:${key}`, source !== accepted);
  }, [accepted, authoring, drafts, key]);
  const resolveImage = useCallback(async (source: string) => {
    const resolved = resolveWorkspaceImageReference(sourcePath, source);
    if (resolved.kind === 'invalid') throw new Error(resolved.reason);
    if (resolved.kind === 'remote') return { url: resolved.url };
    const name = resolved.path.startsWith(`${reference!.document}/assets/`) ? resolved.path.slice(`${reference!.document}/assets/`.length) : '';
    const staged = drafts.get(key)?.images.get(name);
    if (!staged && !readAsset) throw new Error('工作区图片读取不可用');
    const bytes = staged ? staged : await readAsset!(resolved.path);
    const mime = staged?.type || imageMimeType(resolved.path);
    const blob = staged ?? new Blob([new Uint8Array(bytes as Uint8Array)], { type: mime });
    const url = URL.createObjectURL(blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  }, [readAsset, drafts, key, reference, sourcePath]);
  const storeImage = useCallback(async (file: File) => {
    const extension = IMAGE_FILE_EXTENSIONS[file.type];
    if (!extension) throw new Error('不支持的图片格式');
    const name = `${crypto.randomUUID()}.${extension}`;
    const draft = drafts.get(key) ?? { source: accepted, images: new Map<string, File>() };
    draft.images.set(name, file);
    drafts.set(key, draft);
    return { source: `assets/${name}`, alt: file.name };
  }, [accepted, drafts, key]);
  const onImageError = useCallback((error: unknown) => setFailure(String(error)), []);
  const openReference = useCallback((id: string) => {
    const target = targets.find((item) => item.id === id);
    if (target) onOpenObject({ kind: target.kind, id });
  }, [onOpenObject, targets]);

  async function apply() {
    const draft = drafts.get(key);
    if (!draft || !dirty || applying) return;
    setApplying(true); setFailure('');
    try {
      const assets = await Promise.all([...draft.images].filter(([name]) => draft.source.includes(`assets/${name}`))
        .map(async ([name, file]) => ({ name, content: new Uint8Array(await file.arrayBuffer()) })));
      authoring.updateDocument({ object, source: draft.source, assets });
      if (drafts.get(key) === draft) {
        drafts.delete(key);
        authoring.protectDraft(`document:${key}`, false);
      } else {
        // A newer edit made during image acquisition remains a protected draft.
        const newer = drafts.get(key)!;
        for (const asset of assets) newer.images.delete(asset.name);
        authoring.protectDraft(`document:${key}`, newer.source !== draft.source);
      }
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setApplying(false); }
  }
  function discard() { drafts.delete(key); setValue(accepted); setFailure(''); authoring.protectDraft(`document:${key}`, false); }
  if (!reference || resource?.status !== 'ready') return <p role="alert">{resource?.status === 'error' ? resource.message : '对象源文档不存在'}</p>;
  return <section className="authoring-document-editor" aria-label="对象文档编辑器">
    <header className="document-viewbar"><span>{reference.format === 'markdown' ? 'Markdown' : 'HTML'}</span>
      <div role="group" aria-label="文档视图">
        {reference.format === 'markdown' && <button type="button" title="编辑文档" aria-label="编辑文档" aria-pressed={view === 'edit'} onClick={() => setView('edit')}><Pencil size={15} /></button>}
        <button type="button" title="源文档" aria-label="源文档" aria-pressed={view === 'source'} onClick={() => setView('source')}><Code2 size={15} /></button>
        <button type="button" title="预览文档" aria-label="预览文档" aria-pressed={view === 'preview'} onClick={() => setView('preview')}><Eye size={15} /></button>
      </div><small>{dirty ? '编辑草稿' : '有效内容'}</small></header>
    {failure && <p className="document-editor-error" role="alert">{failure}</p>}
    {view === 'edit' ? <Suspense fallback={<p role="status">正在载入编辑器…</p>}><DocumentEditor value={value} onChange={change}
      label={title} currentId={object.id} documentPath={sourcePath} referenceTargets={targets} onOpenReference={openReference}
      resolveImage={resolveImage} storeImage={storeImage} onImageError={onImageError} /></Suspense>
      : view === 'source' ? <textarea className="document-source" aria-label="文档源码" value={value} onChange={(event) => change(event.target.value)} spellCheck={false} />
        : <DraftPreview source={value} title={title} format={reference.format} documentPath={sourcePath} resolveImage={resolveImage} />}
    <footer className="document-editor-actions"><small>{value.length} 字符正文</small><span />
      <button type="button" disabled={!dirty || applying} onClick={discard}><Undo2 size={15} />放弃草稿</button>
      <button type="button" className="primary-command" disabled={!dirty || applying} onClick={() => { void apply(); }}><Check size={15} />{applying ? '正在应用…' : '应用修改'}</button>
    </footer>
  </section>;
}

function DraftPreview({ source, title, format, documentPath, resolveImage }: { source: string; title: string; format: string; documentPath: string;
  resolveImage: (source: string) => Promise<{ url: string; release?: () => void }> }) {
  const html = useMemo(() => format === 'markdown' ? markdownToHtml(source, title) : source, [format, source, title]);
  return <DocumentPreview title={`${title} 文档预览`} html={html} documentPath={documentPath} resolveImage={resolveImage} className="document-preview" allowScripts />;
}

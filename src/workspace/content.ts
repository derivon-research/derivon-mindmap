import { DOCUMENT_SCHEMA, parseDocumentWithMigration, uniqueId, type DocumentFormat, type DocumentReference } from '../domain';
import { markdownToHtml } from '../documentContent';
import type { WorkspaceCommit } from '../ports/WorkspaceSource';
import type { WorkspaceGraph } from './index';
import { imageMimeType } from './imageReference';

export type TextResource =
  | { readonly status: 'ready'; readonly text: string }
  | { readonly status: 'error'; readonly message: string };

export type ContentDiagnostic = { readonly path: string; readonly message: string };

/** Legacy fields remain solely in graphText, for lossless boundary round trips. */
export type WorkspaceContent = {
  readonly graphText: string;
  readonly graph: WorkspaceGraph;
  readonly title: string;
  readonly documents: Readonly<Record<string, TextResource>>;
  readonly assets?: Readonly<Record<string, Uint8Array>>;
  readonly companionMetadata: Readonly<Record<string, TextResource | null>>;
  readonly diagnostics: readonly ContentDiagnostic[];
  readonly requiresMigrationConsent: boolean;
};

export type ContentChange = {
  readonly content: WorkspaceContent;
  readonly changes: WorkspaceCommit;
  readonly objectId?: string;
};

export type CreateConceptIntent = {
  readonly label: string;
  readonly id?: string;
  readonly format: DocumentFormat;
};

export type UpdateDocumentIntent = {
  readonly object: { readonly kind: 'concept' | 'derivation'; readonly id: string };
  readonly source: string;
  readonly assets?: readonly { readonly name: string; readonly content: Uint8Array }[];
};

const SUPPORTED_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

function copyAssets(assets: Readonly<Record<string, Uint8Array>> | undefined): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(assets ?? {}).map(([path, bytes]) => [path, new Uint8Array(bytes)]));
}

export function objectDocumentPaths(reference: DocumentReference): readonly string[] {
  return reference.format === 'markdown'
    ? [`${reference.document}/document.md`, `${reference.document}/index.html`]
    : [`${reference.document}/index.html`];
}

export function objectDocumentPreview(content: WorkspaceContent, reference: DocumentReference): TextResource {
  const path = `${reference.document}/index.html`;
  return content.documents[path] ?? { status: 'error', message: `Missing document: ${path}` };
}

export function parseWorkspaceContent(input: {
  graph: string;
  documents: Readonly<Record<string, TextResource>>;
  assets?: Readonly<Record<string, Uint8Array>>;
  companionMetadata?: Readonly<Record<string, TextResource | null>>;
}): WorkspaceContent {
  const parsed = parseDocumentWithMigration(input.graph);
  const references = [...parsed.document.graph.points, ...parsed.document.graph.hyperedges].map((object) => object.data);
  const documents = { ...input.documents };
  for (const path of references.flatMap(objectDocumentPaths)) {
    documents[path] ??= { status: 'error', message: `Missing document: ${path}` };
  }
  const companionMetadata = { ...input.companionMetadata };
  const diagnostics = Object.entries({ ...documents, ...companionMetadata }).flatMap(([path, resource]) =>
    resource?.status === 'error' ? [{ path, message: resource.message }] : []);
  return {
    graphText: input.graph,
    graph: parsed.document.graph,
    title: parsed.document.document.title,
    documents,
    assets: copyAssets(input.assets),
    companionMetadata,
    diagnostics,
    requiresMigrationConsent: parsed.migratedFrom !== null,
  };
}

export function updateObjectDocument(content: WorkspaceContent, intent: UpdateDocumentIntent): ContentChange {
  if (content.requiresMigrationConsent) throw new Error('此工作区需要确认格式升级，当前仅可浏览');
  if (typeof intent.source !== 'string') throw new Error('文档内容必须是字符串');
  const objects = intent.object.kind === 'concept' ? content.graph.points
    : intent.object.kind === 'derivation' ? content.graph.hyperedges : [];
  const object = objects.find(({ id }) => id === intent.object.id);
  if (!object) throw new Error(`未找到${intent.object.kind === 'concept' ? '概念' : '推导'}: ${intent.object.id}`);
  const sourcePath = `${object.data.document}/${object.data.format === 'markdown' ? 'document.md' : 'index.html'}`;
  const existingSource = content.documents[sourcePath];
  if (!existingSource || existingSource.status !== 'ready') {
    throw new Error(existingSource?.status === 'error' ? existingSource.message : `Missing document: ${sourcePath}`);
  }

  const acceptedAssets = { ...content.assets };
  const assetChanges = (intent.assets ?? []).map((asset) => {
    if (!SUPPORTED_IMAGE_NAME.test(asset.name) || imageMimeType(asset.name) === 'application/octet-stream') throw new Error(`图片文件名无效: ${asset.name}`);
    if (!(asset.content instanceof Uint8Array)) throw new Error(`图片内容无效: ${asset.name}`);
    const path = `${object.data.document}/assets/${asset.name}`;
    if (acceptedAssets[path]) throw new Error(`图片已存在: ${asset.name}`);
    const bytes = new Uint8Array(asset.content);
    acceptedAssets[path] = bytes;
    return { path, content: new Uint8Array(bytes) };
  });
  const title = 'label' in object.data ? object.data.label : `推导 ${object.id}`;
  const documentChanges = object.data.format === 'markdown'
    ? [{ path: sourcePath, content: intent.source },
      { path: `${object.data.document}/index.html`, content: markdownToHtml(intent.source, title) }]
    : [{ path: sourcePath, content: intent.source }];
  const documents = { ...content.documents, ...Object.fromEntries(documentChanges.map(({ path, content: text }) =>
    [path, { status: 'ready' as const, text }])) };
  const changedPaths = new Set(documentChanges.map(({ path }) => path));
  return {
    content: { ...content, documents, assets: acceptedAssets,
      diagnostics: content.diagnostics.filter(({ path }) => !changedPaths.has(path)) },
    changes: { documents: documentChanges, assets: assetChanges },
    objectId: object.id,
  };
}

export function createWorkspace(intent: { title: string }): ContentChange {
  const title = intent.title.trim();
  if (!title) throw new Error('工作区名称不能为空');
  const graph = `${JSON.stringify({
    schema: DOCUMENT_SCHEMA,
    document: { title, description: '' },
    graph: { points: [], hyperedges: [] },
    view: { replacements: [] },
  }, null, 2)}\n`;
  return { content: parseWorkspaceContent({ graph, documents: {} }), changes: { graph, createOnly: true } };
}

export function createConcept(content: WorkspaceContent, intent: CreateConceptIntent): ContentChange & { objectId: string } {
  if (content.requiresMigrationConsent) throw new Error('此工作区需要确认格式升级，当前仅可浏览');
  const label = intent.label.trim();
  if (!label) throw new Error('概念名称不能为空');
  if (intent.format !== 'markdown' && intent.format !== 'html') throw new Error('文档格式无效');
  const usedIds = new Set([...content.graph.points, ...content.graph.hyperedges].map((object) => object.id));
  const id = intent.id === undefined || intent.id === '' ? uniqueId('c', usedIds) : intent.id.trim();
  if (!id || usedIds.has(id)) throw new Error('概念 ID 为空或已被使用');
  const segment = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  const base = `docs/concept-${segment}`;
  const usedDirectories = [...content.graph.points, ...content.graph.hyperedges].map((object) => object.data.document);
  let directory = base;
  let suffix = 2;
  while (usedDirectories.some((used) => used === directory || used.startsWith(`${directory}/`) || directory.startsWith(`${used}/`))
    || Object.keys(content.documents).some((path) => path.startsWith(`${directory}/`))) {
    directory = `${base}-${suffix++}`;
  }
  const point = { id, data: { label, document: directory, format: intent.format } };
  const manifest = parseDocumentWithMigration(content.graphText).document;
  const graph = `${JSON.stringify({ ...manifest, graph: {
    ...manifest.graph, points: [...manifest.graph.points, point],
  } }, null, 2)}\n`;
  const documents = [
    ...(intent.format === 'markdown' ? [{ path: `${directory}/document.md`, content: '', createOnly: true as const }] : []),
    { path: `${directory}/index.html`, content: markdownToHtml('', label), createOnly: true as const },
  ];
  return {
    objectId: id,
    content: parseWorkspaceContent({
      graph,
      documents: { ...content.documents, ...Object.fromEntries(documents.map(({ path, content: text }) =>
        [path, { status: 'ready' as const, text }])) },
      companionMetadata: content.companionMetadata,
      assets: content.assets,
    }),
    changes: { graph, documents },
  };
}

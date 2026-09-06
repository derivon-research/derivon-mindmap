import { markdownToHtml } from '../documentContent';
import type { WorkspaceCommit } from '../ports/WorkspaceSource';
import { imageMimeType } from './imageReference';
import {
  WORKSPACE_SCHEMA, parseWorkspaceManifest, serializeWorkspaceManifest, uniqueId,
  type ConceptPoint, type DocumentFormat, type DocumentReference, type ManifestGraph, type TagDeclaration,
  type WorkspaceManifest,
} from './manifest';
import {
  ORIENTATION_PATH, orientationConceptReferences, orientationErrors, parseOrientationConfig,
  serializeOrientationConfig, validateOrientationConfig,
  type OrientationConceptReference, type OrientationConfig, type OrientationDiagnostic,
} from './orientation';

export type TextResource =
  | { readonly status: 'ready'; readonly text: string }
  | { readonly status: 'error'; readonly message: string };

export type ContentDiagnostic = { readonly path: string; readonly message: string };

/**
 * The orientation configuration as effective content sees it.
 *
 * `ready` is the only status a route may be seeded from: a configuration carrying any
 * error diagnostic is `invalid`, so a dangling reference cannot reach a learner. An
 * invalid configuration keeps its diagnostics rather than collapsing to a blank state.
 */
export type WorkspaceOrientation =
  | { readonly status: 'absent' }
  | { readonly status: 'ready'; readonly config: OrientationConfig; readonly diagnostics: readonly OrientationDiagnostic[] }
  | { readonly status: 'invalid'; readonly message: string; readonly config: OrientationConfig | null; readonly diagnostics: readonly OrientationDiagnostic[] };

export type WorkspaceContent = {
  readonly graphText: string;
  readonly graph: ManifestGraph;
  readonly title: string;
  /** Workspace-level tag declarations. Tag-to-colour mapping belongs to the renderer. */
  readonly tags: readonly TagDeclaration[];
  readonly documents: Readonly<Record<string, TextResource>>;
  readonly assets?: Readonly<Record<string, Uint8Array>>;
  readonly companionMetadata: Readonly<Record<string, TextResource | null>>;
  readonly orientation: WorkspaceOrientation;
  readonly diagnostics: readonly ContentDiagnostic[];
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

export type UpdateConceptTagsIntent = {
  readonly conceptId: string;
  readonly tags: readonly string[];
};

const SUPPORTED_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

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

function readOrientation(
  resource: TextResource | null | undefined,
  graph: ManifestGraph,
  tags: readonly TagDeclaration[],
): WorkspaceOrientation {
  if (resource === null || resource === undefined) return { status: 'absent' };
  if (resource.status === 'error') return { status: 'invalid', message: resource.message, config: null, diagnostics: [] };
  let config: OrientationConfig;
  try {
    config = parseOrientationConfig(resource.text);
  } catch (error) {
    return { status: 'invalid', message: message(error), config: null, diagnostics: [] };
  }
  const diagnostics = validateOrientationConfig(config, graph, tags);
  const errors = orientationErrors(diagnostics);
  return errors.length
    ? { status: 'invalid', message: `开局配置有 ${errors.length} 处会影响路线的问题`, config, diagnostics }
    : { status: 'ready', config, diagnostics };
}

export function parseWorkspaceContent(input: {
  graph: string;
  documents: Readonly<Record<string, TextResource>>;
  assets?: Readonly<Record<string, Uint8Array>>;
  companionMetadata?: Readonly<Record<string, TextResource | null>>;
}): WorkspaceContent {
  const parsed = parseWorkspaceManifest(input.graph);
  const references = [...parsed.manifest.graph.points, ...parsed.manifest.graph.hyperedges].map((object) => object.data);
  const documents = { ...input.documents };
  for (const path of references.flatMap(objectDocumentPaths)) {
    documents[path] ??= { status: 'error', message: `Missing document: ${path}` };
  }
  const companionMetadata = { ...input.companionMetadata };
  const orientation = readOrientation(companionMetadata[ORIENTATION_PATH], parsed.manifest.graph, parsed.manifest.tags);
  const diagnostics = [
    ...Object.entries({ ...documents, ...companionMetadata }).flatMap(([path, resource]) =>
      resource?.status === 'error' ? [{ path, message: resource.message }] : []),
    ...(orientation.status === 'invalid' && companionMetadata[ORIENTATION_PATH]?.status === 'ready'
      ? [{ path: ORIENTATION_PATH, message: orientation.message }] : []),
  ];
  return {
    graphText: input.graph,
    graph: parsed.manifest.graph,
    title: parsed.manifest.document.title,
    tags: parsed.manifest.tags,
    documents,
    assets: copyAssets(input.assets),
    companionMetadata,
    orientation,
    diagnostics,
  };
}

/** Re-read the manifest so a graph change starts from validated v1 shapes, not from state. */
function manifestOf(content: WorkspaceContent): WorkspaceManifest {
  return parseWorkspaceManifest(content.graphText).manifest;
}

/** Re-derive effective content from a new manifest text, keeping everything else. */
function withGraphText(content: WorkspaceContent, graph: string): WorkspaceContent {
  return parseWorkspaceContent({
    graph,
    documents: content.documents,
    companionMetadata: content.companionMetadata,
    assets: content.assets,
  });
}

export function updateObjectDocument(content: WorkspaceContent, intent: UpdateDocumentIntent): ContentChange {
  if (typeof intent.source !== 'string') throw new Error('文档内容必须是字符串');
  const objects: readonly { id: string; data: DocumentReference & { label?: string } }[] =
    intent.object.kind === 'concept' ? content.graph.points
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
  const title = object.data.label ?? `推导 ${object.id}`;
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
  const graph = serializeWorkspaceManifest({
    schema: WORKSPACE_SCHEMA,
    document: { title, description: '' },
    tags: [],
    graph: { points: [], hyperedges: [] },
  });
  return { content: parseWorkspaceContent({ graph, documents: {} }), changes: { graph, createOnly: true } };
}

export function createConcept(content: WorkspaceContent, intent: CreateConceptIntent): ContentChange & { objectId: string } {
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
  const point: ConceptPoint = { id, data: { label, document: directory, format: intent.format } };
  const manifest = manifestOf(content);
  const graph = serializeWorkspaceManifest({ ...manifest, graph: {
    ...manifest.graph, points: [...manifest.graph.points, point],
  } });
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

/** Tag a concept. Tags organize and filter; they never change reachability or cost. */
export function updateConceptTags(content: WorkspaceContent, intent: UpdateConceptTagsIntent): ContentChange {
  const manifest = manifestOf(content);
  if (!manifest.graph.points.some((point) => point.id === intent.conceptId)) {
    throw new Error(`未找到概念: ${intent.conceptId}`);
  }
  const tags = [...new Set(intent.tags.map((tag) => tag.trim()).filter(Boolean))];
  const graph = serializeWorkspaceManifest({ ...manifest, graph: { ...manifest.graph,
    points: manifest.graph.points.map((point) => point.id === intent.conceptId
      ? { ...point, data: { ...point.data, tags } } : point) } });
  return { content: withGraphText(content, graph), changes: { graph }, objectId: intent.conceptId };
}

/**
 * Replace the workspace tag registry. An undeclared tag stays usable — it only loses its
 * label — so hand-written manifests and the editor never fight over this list.
 */
export function updateTagDeclarations(content: WorkspaceContent, tags: readonly TagDeclaration[]): ContentChange {
  const declared = new Set<string>();
  for (const tag of tags) {
    const id = tag.id.trim();
    if (!id) throw new Error('标签 ID 不能为空');
    if (!tag.label.trim()) throw new Error(`标签「${id}」需要名称`);
    if (declared.has(id)) throw new Error(`标签 ID 重复: ${id}`);
    declared.add(id);
  }
  const graph = serializeWorkspaceManifest({ ...manifestOf(content), tags: tags.map((tag) => ({
    id: tag.id.trim(), label: tag.label.trim(), ...(tag.description?.trim() ? { description: tag.description.trim() } : {}),
  })) });
  return { content: withGraphText(content, graph), changes: { graph } };
}

/**
 * Accept, replace or remove the orientation configuration.
 *
 * Errors are refused here rather than at the file boundary: an accepted configuration is
 * one both modes may read, and a dangling reference must never reach effective content.
 */
export function updateOrientation(content: WorkspaceContent, config: OrientationConfig | null): ContentChange {
  const text = config === null ? null : serializeOrientationConfig(config);
  if (config !== null) {
    const errors = orientationErrors(validateOrientationConfig(config, content.graph, content.tags));
    if (errors.length) throw new Error(`开局配置无法保存：\n${errors.slice(0, 4).map((issue) => issue.message).join('\n')}`);
  }
  const companionMetadata = { ...content.companionMetadata, [ORIENTATION_PATH]: text === null ? null : { status: 'ready' as const, text } };
  return {
    content: parseWorkspaceContent({ graph: content.graphText, documents: content.documents, assets: content.assets, companionMetadata }),
    changes: { companionMetadata: [{ path: ORIENTATION_PATH, content: text }] },
  };
}

/**
 * Where a set of concepts is named by the orientation configuration. A deletion plan asks
 * this before it can offer a repair, and never writes a dangling configuration instead.
 */
export function orientationConceptImpact(
  content: WorkspaceContent,
  conceptIds: readonly string[],
): readonly OrientationConceptReference[] {
  const config = content.orientation.status === 'absent' ? null : content.orientation.config;
  if (!config) return [];
  const removed = new Set(conceptIds);
  return orientationConceptReferences(config).filter((reference) => removed.has(reference.conceptId));
}

import type { WorkspaceCommit } from '../ports/WorkspaceSource';
import { imageMimeType } from './imageReference';
import {
  WORKSPACE_SCHEMA, generateObjectId, isValidWeight, objectSourcePath, parseWorkspaceManifest, serializeWorkspaceManifest,
  type ConceptPoint, type DerivationHyperedge, type DocumentReference, type ManifestGraph, type TagDeclaration,
  type WorkspaceManifest,
} from './manifest';
import { introducedReferenceProblems } from './references';
import type { ContentDiagnostic, TextResource } from './resource';
import {
  ORIENTATION_PATH, orientationConceptReferences, orientationErrors, parseOrientationConfig,
  serializeOrientationConfig, validateOrientationConfig,
  type OrientationConceptReference, type OrientationConfig, type OrientationDiagnostic,
} from './orientation';

export type { ContentDiagnostic, TextResource };

/**
 * The orientation configuration as effective content sees it. `ready` is the only status a
 * route may be seeded from; anything carrying an error diagnostic is `invalid` and keeps
 * its diagnostics.
 */
export type WorkspaceOrientation =
  | { readonly status: 'absent' }
  | { readonly status: 'ready'; readonly config: OrientationConfig; readonly diagnostics: readonly OrientationDiagnostic[] }
  | { readonly status: 'invalid'; readonly message: string; readonly config: OrientationConfig | null; readonly diagnostics: readonly OrientationDiagnostic[] };

export type WorkspaceContent = {
  readonly graphText: string;
  readonly graph: ManifestGraph;
  readonly title: string;
  /** Workspace-level tag declarations. */
  readonly tags: readonly TagDeclaration[];
  /** Accepted/available Markdown. An absent entry is unread, not a missing-file diagnostic. */
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
};

/**
 * What a derivation joins and what it costs to learn. The author decides the three
 * together, so they travel together: creation states them, modification replaces them
 * whole, and either way they are accepted or refused as one.
 */
export type DerivationStructure = {
  readonly tails: readonly string[];
  readonly head: string;
  readonly weight: number;
};

export type CreateDerivationIntent = DerivationStructure;

/** Identity and the owned document are not part of the structure, so they cannot change here. */
export type UpdateDerivationStructureIntent = DerivationStructure & { readonly derivationId: string };

/** The object's own metadata. Its identity and its document location are not editable. */
export type UpdateMetadataIntent = {
  readonly object: { readonly kind: 'concept' | 'derivation'; readonly id: string };
  readonly label?: string;
  readonly description?: string;
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

/** Markdown is the only persisted object document. */
export function objectDocumentPaths(reference: DocumentReference): readonly string[] {
  return [objectSourcePath(reference)];
}

/**
 * Whether a workspace path is Markdown, which under ADR-0008 means: whether it is a
 * document rather than an asset. Callers that classify a file — a commit that writes text
 * or bytes, a list that says which of an object's files is its body — ask here rather than
 * each writing the rule down.
 */
export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

export { objectSourcePath };

export function objectDocumentSource(content: WorkspaceContent, reference: DocumentReference): TextResource | undefined {
  return content.documents[objectSourcePath(reference)];
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
  const documents = { ...input.documents };
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

type AnyObject = { readonly id: string; readonly data: DocumentReference & { readonly label?: string; readonly description?: string } };

export function findObject(content: WorkspaceContent, ref: { kind: 'concept' | 'derivation'; id: string }): AnyObject {
  const objects: readonly AnyObject[] = ref.kind === 'concept' ? content.graph.points : content.graph.hyperedges;
  const object = objects.find(({ id }) => id === ref.id);
  if (!object) throw new Error(`未找到${ref.kind === 'concept' ? '概念' : '推导'}: ${ref.id}`);
  return object;
}

/** Re-read the manifest so a graph change starts from validated shapes. */
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
  const object = findObject(content, intent.object);
  const sourcePath = objectSourcePath(object.data);
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
  const introduced = introducedReferenceProblems(
    { ...content, assets: acceptedAssets }, sourcePath, existingSource.text, intent.source);
  if (introduced.length) {
    throw new Error(`这次修改引入了无法解析的引用：\n${introduced.slice(0, 4)
      .map((item) => `「${item.raw}」${item.message ?? ''}`).join('\n')}`);
  }
  const documentChanges = [{ path: sourcePath, content: intent.source }];
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

/** A directory that belongs to a new object alone, never nested in or around an existing one. */
function objectDirectory(content: WorkspaceContent, base: string): string {
  const usedDirectories = [...content.graph.points, ...content.graph.hyperedges].map((object) => object.data.document);
  let directory = base;
  let suffix = 2;
  while (usedDirectories.some((used) => used === directory || used.startsWith(`${directory}/`) || directory.startsWith(`${used}/`))
    || Object.keys(content.documents).some((path) => path.startsWith(`${directory}/`))) {
    directory = `${base}-${suffix++}`;
  }
  return directory;
}

export function createConcept(content: WorkspaceContent, intent: CreateConceptIntent): ContentChange & { objectId: string } {
  const label = intent.label.trim();
  if (!label) throw new Error('概念名称不能为空');
  const usedIds = new Set([...content.graph.points, ...content.graph.hyperedges].map((object) => object.id));
  const id = generateObjectId('c', usedIds);
  const directory = objectDirectory(content, `docs/concept-${id.slice(2)}`);
  const point: ConceptPoint = { id, data: { label, document: directory } };
  const manifest = manifestOf(content);
  const graph = serializeWorkspaceManifest({ ...manifest, graph: {
    ...manifest.graph, points: [...manifest.graph.points, point],
  } });
  const documents = [
    { path: `${directory}/document.md`, content: '', createOnly: true as const },
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

/**
 * The endpoints and cost both creation and modification must agree on. Empty premises,
 * cycles, self-loops and parallel derivations are legal graph content; only a head that is
 * not a concept, a dangling premise or an unrepresentable cost is refused.
 */
function validatedStructure(content: WorkspaceContent, intent: DerivationStructure): {
  readonly tails: string[]; readonly head: string; readonly weight: number;
} {
  const pointIds = new Set(content.graph.points.map((point) => point.id));
  if (!pointIds.has(intent.head)) throw new Error(`结果概念 ${intent.head} 不存在`);
  const tails = [...new Set(intent.tails)];
  for (const tail of tails) {
    if (!pointIds.has(tail)) throw new Error(`前提概念 ${tail} 不存在`);
  }
  if (!isValidWeight(intent.weight)) {
    throw new Error('学习成本必须是非负且最多保留一位小数的数值');
  }
  return { tails, head: intent.head, weight: intent.weight };
}

/**
 * Create a derivation as a hyperedge with its own owned document. Empty premises, cycles
 * and parallel derivations are legal; a missing head or a dangling concept reference
 * cannot enter effective content.
 */
export function createDerivation(content: WorkspaceContent, intent: CreateDerivationIntent): ContentChange & { objectId: string } {
  const { tails, head, weight } = validatedStructure(content, intent);
  const usedIds = new Set([...content.graph.points, ...content.graph.hyperedges].map((object) => object.id));
  const id = generateObjectId('h', usedIds);
  const directory = objectDirectory(content, `docs/derivation-${id.slice(2)}`);
  const edge: DerivationHyperedge = { id, weight, tails, head, data: { document: directory } };
  const manifest = manifestOf(content);
  const graph = serializeWorkspaceManifest({ ...manifest, graph: {
    ...manifest.graph, hyperedges: [...manifest.graph.hyperedges, edge],
  } });
  const documents = [
    { path: `${directory}/document.md`, content: '', createOnly: true as const },
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

/**
 * Change which concepts a derivation joins and what it costs to learn. The same rules as
 * creation hold: empty premises, cycles, self-loops and parallel derivations are legal;
 * a missing head or a dangling concept reference cannot enter effective content.
 */
export function updateDerivationStructure(content: WorkspaceContent, intent: UpdateDerivationStructureIntent): ContentChange {
  const manifest = manifestOf(content);
  const edge = manifest.graph.hyperedges.find(({ id }) => id === intent.derivationId);
  if (!edge) throw new Error(`未找到推导: ${intent.derivationId}`);
  const structure = validatedStructure(content, intent);
  const graph = serializeWorkspaceManifest({ ...manifest, graph: { ...manifest.graph,
    hyperedges: manifest.graph.hyperedges.map((current) => current.id === edge.id
      ? { ...current, ...structure } : current) } });
  return { content: withGraphText(content, graph), changes: { graph }, objectId: edge.id };
}

/**
 * Rename an object or reword its one-line description. A concept needs a name; a derivation
 * may drop back to reading from its endpoints.
 */
export function updateObjectMetadata(content: WorkspaceContent, intent: UpdateMetadataIntent): ContentChange {
  findObject(content, intent.object);
  const label = intent.label?.trim();
  const description = intent.description?.trim();
  if (intent.object.kind === 'concept' && label !== undefined && !label) throw new Error('概念名称不能为空');
  const manifest = manifestOf(content);
  const apply = <T extends { id: string; data: Record<string, unknown> }>(object: T): T => (object.id === intent.object.id
    ? { ...object, data: {
      ...object.data,
      ...(label === undefined ? {} : { label: label || undefined }),
      ...(description === undefined ? {} : { description: description || undefined }),
    } }
    : object);
  const graph = serializeWorkspaceManifest({ ...manifest, graph: intent.object.kind === 'concept'
    ? { ...manifest.graph, points: manifest.graph.points.map(apply) }
    : { ...manifest.graph, hyperedges: manifest.graph.hyperedges.map(apply) } });
  return { content: withGraphText(content, graph), changes: { graph }, objectId: intent.object.id };
}

/** Tag a concept. */
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

/** Replace the workspace tag registry. An undeclared tag still resolves; it only loses its label. */
export function updateTagDeclarations(content: WorkspaceContent, tags: readonly TagDeclaration[]): ContentChange {
  const declared = new Set<string>();
  for (const tag of tags) {
    const id = tag.id.trim();
    if (!id) throw new Error('标签 ID 不能为空');
    if (!tag.label.trim()) throw new Error(`标签「${id}」需要名称`);
    if (declared.has(id)) throw new Error(`标签 ID 重复: ${id}`);
    declared.add(id);
  }
  const graph = serializeWorkspaceManifest({ ...manifestOf(content),
    tags: tags.map((tag) => ({ id: tag.id.trim(), label: tag.label.trim() })) });
  return { content: withGraphText(content, graph), changes: { graph } };
}

/**
 * Accept, replace or remove the orientation configuration. A configuration carrying an
 * error is refused here, so what is accepted is what both modes may read.
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

/** Where the orientation configuration names a given set of concepts, for a deletion plan. */
export function orientationConceptImpact(
  content: WorkspaceContent,
  conceptIds: readonly string[],
): readonly OrientationConceptReference[] {
  const config = content.orientation.status === 'absent' ? null : content.orientation.config;
  if (!config) return [];
  const removed = new Set(conceptIds);
  return orientationConceptReferences(config).filter((reference) => removed.has(reference.conceptId));
}

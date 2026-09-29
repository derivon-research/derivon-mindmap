import type { WorkspaceCommit } from '../ports/WorkspaceSource';
import { imageMimeType } from './imageReference';
import {
  WORKSPACE_ID_RULE, WORKSPACE_SCHEMA, isValidWeight, isValidWorkspaceId, newObjectIdentity,
  objectSourcePath, parseWorkspaceManifest, serializeWorkspaceManifest,
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
import {
  WORKSPACE_ROUTES_DIRECTORY, decodeRoute, isRouteFileName, readRoute, routeFileName, serializeRoute,
  workspaceRoutePath, type Route, type RouteFileIssue, type RouteReading,
} from './route';

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

/**
 * One file of `.derivon/routes/` as effective content sees it. `id` is the file name without
 * `.json`, so every route file can be named and deleted even when it cannot be read. `ready`
 * means the route validates on the current graph (warnings are in `reading.diagnostics`);
 * `invalid` keeps whatever could be read — the decoded route and its reading when the file
 * decoded, the file issues when it did not — and `message` says why in one line. Nothing is
 * dropped, re-solved or repaired on load (`docs/routes.md`).
 */
export type WorkspaceRoute =
  | {
    readonly status: 'ready'; readonly id: string; readonly path: string;
    readonly route: Route; readonly reading: RouteReading;
  }
  | {
    readonly status: 'invalid'; readonly id: string; readonly path: string; readonly message: string;
    /** Why the file could not be decoded; empty when it decoded and failed on the graph. */
    readonly issues: readonly RouteFileIssue[];
    readonly route: Route | null;
    readonly reading: RouteReading | null;
  };

/** A workspace route that names objects a deletion removes, and so becomes invalid with it. */
export type WorkspaceRouteReference = {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  /** The removed concepts and derivations the route names, in `known`, `targets` or `steps`. */
  readonly objectIds: readonly string[];
};

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
  /** Every route file in `.derivon/routes/`, by path; derived from `companionMetadata`. */
  readonly routes: readonly WorkspaceRoute[];
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

/** Whether a companion path is a workspace route file: a direct `.json` child of the routes directory. */
export function isWorkspaceRoutePath(path: string): boolean {
  const prefix = `${WORKSPACE_ROUTES_DIRECTORY}/`;
  const name = path.slice(prefix.length);
  return path.startsWith(prefix) && !name.includes('/') && isRouteFileName(name);
}

function readWorkspaceRoute(path: string, resource: TextResource, graph: ManifestGraph): WorkspaceRoute {
  const fileName = path.slice(WORKSPACE_ROUTES_DIRECTORY.length + 1);
  const id = fileName.slice(0, -'.json'.length);
  if (resource.status === 'error') {
    return { status: 'invalid', id, path, message: resource.message,
      issues: [{ code: 'unreadable', message: resource.message }], route: null, reading: null };
  }
  const decoded = decodeRoute(resource.text);
  if (!decoded.route) {
    return { status: 'invalid', id, path, message: `路线文件读不懂：${decoded.issues.map((issue) => issue.message).join('；')}`,
      issues: decoded.issues, route: null, reading: null };
  }
  const route = decoded.route;
  const reading = readRoute(graph, route, { location: 'workspace', fileName });
  if (!reading.errors) return { status: 'ready', id, path, route, reading };
  const first = reading.diagnostics.find((diagnostic) => diagnostic.severity === 'error')!;
  return { status: 'invalid', id, path, issues: [], route, reading,
    message: `路线「${route.label || id}」有 ${reading.errors} 处错误：${first.message}` };
}

function readWorkspaceRoutes(
  companionMetadata: Readonly<Record<string, TextResource | null>>,
  graph: ManifestGraph,
): WorkspaceRoute[] {
  return Object.entries(companionMetadata)
    .filter((entry): entry is [string, TextResource] => entry[1] !== null && isWorkspaceRoutePath(entry[0]))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, resource]) => readWorkspaceRoute(path, resource, graph));
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
  const routes = readWorkspaceRoutes(companionMetadata, parsed.manifest.graph);
  const diagnostics = [
    ...Object.entries({ ...documents, ...companionMetadata }).flatMap(([path, resource]) =>
      resource?.status === 'error' ? [{ path, message: resource.message }] : []),
    ...(orientation.status === 'invalid' && companionMetadata[ORIENTATION_PATH]?.status === 'ready'
      ? [{ path: ORIENTATION_PATH, message: orientation.message }] : []),
    // An unreadable route file is already reported above as the resource error it is.
    ...routes.flatMap((route) => route.status === 'invalid' && companionMetadata[route.path]?.status === 'ready'
      ? [{ path: route.path, message: route.message }] : []),
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
    routes,
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

export function createWorkspace(intent: { id: string; title: string }): ContentChange {
  const title = intent.title.trim();
  if (!title) throw new Error('工作区名称不能为空');
  /* Identity is refused here rather than at the first read: a manifest this operation cannot
   * name is not a workspace it may create. */
  if (!isValidWorkspaceId(intent.id)) {
    throw new Error(`工作区 id「${intent.id}」不可用：必须是${WORKSPACE_ID_RULE}`);
  }
  const graph = serializeWorkspaceManifest({
    schema: WORKSPACE_SCHEMA,
    id: intent.id,
    document: { title, description: '' },
    tags: [],
    graph: { points: [], hyperedges: [] },
  });
  return { content: parseWorkspaceContent({ graph, documents: {} }), changes: { graph, createOnly: true } };
}

export function createConcept(content: WorkspaceContent, intent: CreateConceptIntent): ContentChange & { objectId: string } {
  const label = intent.label.trim();
  if (!label) throw new Error('概念名称不能为空');
  const { id, directory } = newObjectIdentity('concept', content.graph, Object.keys(content.documents));
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
  const { id, directory } = newObjectIdentity('derivation', content.graph, Object.keys(content.documents));
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

/** Re-derive effective content from new companion documents, keeping everything else. */
function withCompanionMetadata(content: WorkspaceContent, companionMetadata: Record<string, TextResource | null>): WorkspaceContent {
  return parseWorkspaceContent({ graph: content.graphText, documents: content.documents, assets: content.assets, companionMetadata });
}

/**
 * Accept a new or edited workspace route: writes `.derivon/routes/<id>.json` and nothing
 * else. A route carrying any error — a shape error at the workspace location, or a graph
 * error on the current graph — is refused, so a workspace never holds a route that was
 * invalid when it was saved. Warnings do not refuse.
 */
export function acceptWorkspaceRoute(content: WorkspaceContent, route: Route): ContentChange {
  const text = serializeRoute(route, 'workspace');
  const reading = readRoute(content.graph, route, { location: 'workspace', fileName: routeFileName(route.id) });
  if (reading.errors) {
    throw new Error(`路线无法保存：\n${reading.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      .slice(0, 4).map((diagnostic) => diagnostic.message).join('\n')}`);
  }
  const path = workspaceRoutePath(route.id);
  return {
    content: withCompanionMetadata(content, { ...content.companionMetadata, [path]: { status: 'ready', text } }),
    changes: { companionMetadata: [{ path, content: text }] },
  };
}

/**
 * Delete a workspace route by the id its file is named with (`WorkspaceRoute.id`), so an
 * invalid or unreadable route file can be removed too. Removes that one file.
 */
export function deleteWorkspaceRoute(content: WorkspaceContent, id: string): ContentChange {
  const route = content.routes.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`未找到工作区路线: ${id}`);
  const companionMetadata = { ...content.companionMetadata };
  delete companionMetadata[route.path];
  return {
    content: withCompanionMetadata(content, companionMetadata),
    changes: { companionMetadata: [{ path: route.path, content: null }] },
  };
}

/**
 * The workspace routes that name any of `objectIds` — concepts in `known` or `targets`,
 * derivations in `steps` — for a deletion plan. A route file that did not decode names nothing.
 */
export function workspaceRouteImpact(
  content: WorkspaceContent,
  objectIds: readonly string[],
): readonly WorkspaceRouteReference[] {
  const removed = new Set(objectIds);
  return content.routes.flatMap((entry) => {
    if (!entry.route) return [];
    const named = [...new Set([...entry.route.known, ...entry.route.targets, ...entry.route.steps])]
      .filter((id) => removed.has(id));
    return named.length ? [{ id: entry.id, path: entry.path, label: entry.route.label, objectIds: named }] : [];
  });
}

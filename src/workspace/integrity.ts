/**
 * Object-document integrity: what a deletion would break, and the complete content changes
 * a user confirms to repair it.
 *
 * Two rules hold everything here together. A deletion is only safe when every reference
 * source could actually be read, so an impact that carries an unread, unreadable or
 * uncertain source is reported as incomplete rather than empty (see ADR-0005). And a
 * repair is always a decision someone made: nothing here turns a link into text, drops an
 * image, or fills a missing document in without being asked for exactly that.
 */
import {
  objectSourcePath, parseWorkspaceManifest, serializeWorkspaceManifest,
  type ConceptPoint, type DerivationHyperedge,
} from './manifest';
import {
  findObject, objectDocumentSource, orientationConceptImpact, parseWorkspaceContent, updateObjectDocument,
  updateOrientation, type ContentChange, type WorkspaceContent,
} from './content';
import {
  applyReferenceRepairs, documentReferences, objectDocumentHref,
  type DocumentReferenceItem, type ReferenceRepairAction, type ReferenceUncertainty, type SourceRange,
} from './references';
import { orientationWithoutConcepts, type OrientationConceptReference } from './orientation';
import type { WorkspaceAssetChange, WorkspaceTextChange } from '../ports/WorkspaceSource';

export type ObjectRef = { readonly kind: 'concept' | 'derivation'; readonly id: string };

export type DeletionPlan = {
  readonly conceptIds?: readonly string[];
  readonly derivationIds?: readonly string[];
};

/** Everything the plan removes, including the derivations that go with a concept. */
export type DeletionScope = {
  readonly concepts: readonly ConceptPoint[];
  readonly derivations: readonly DerivationHyperedge[];
  /** The owned directories; everything stored under them belongs to the removed objects. */
  readonly directories: readonly string[];
  readonly documentPaths: readonly string[];
};

export function deletionScope(content: WorkspaceContent, plan: DeletionPlan): DeletionScope {
  const conceptIds = new Set(plan.conceptIds ?? []);
  const concepts = content.graph.points.filter((point) => conceptIds.has(point.id));
  const derivationIds = new Set(plan.derivationIds ?? []);
  // ADR-0005: a derivation cannot outlive an endpoint, so it is part of the same removal.
  const derivations = content.graph.hyperedges.filter((edge) => derivationIds.has(edge.id)
    || conceptIds.has(edge.head) || edge.tails.some((tail) => conceptIds.has(tail)));
  const removed = [...concepts, ...derivations];
  return {
    concepts,
    derivations,
    directories: removed.map((object) => object.data.document),
    documentPaths: removed.map((object) => objectSourcePath(object.data)),
  };
}

export type IncomingReference = {
  readonly from: { readonly documentPath: string } & ObjectRef;
  readonly reference: DocumentReferenceItem;
};

export type ReferenceImpact = {
  readonly scope: DeletionScope;
  /** References from surviving documents into the removed directories, in document order. */
  readonly incoming: readonly IncomingReference[];
  /** Surviving documents whose body is not in effective content: their references are unknown. */
  readonly unread: readonly string[];
  readonly unreadable: readonly { readonly path: string; readonly message: string }[];
  readonly uncertain: readonly { readonly documentPath: string; readonly uncertainty: ReferenceUncertainty }[];
  readonly orientation: readonly OrientationConceptReference[];
  /** False whenever a source could not be analysed. A deletion may not be called safe then. */
  readonly complete: boolean;
};

/**
 * What would break if the plan were carried out. Callers acquire the bodies they want
 * analysed through the shared session first; a body this content has never read is
 * reported as unread, never as a document without references.
 */
export function referenceImpact(content: WorkspaceContent, plan: DeletionPlan): ReferenceImpact {
  const scope = deletionScope(content, plan);
  const removed = new Set([...scope.concepts.map(({ id }) => id), ...scope.derivations.map(({ id }) => id)]);
  const inScope = (path: string) => scope.directories.some((directory) => path.startsWith(`${directory}/`));
  const incoming: IncomingReference[] = [];
  const unread: string[] = [];
  const unreadable: { path: string; message: string }[] = [];
  const uncertain: { documentPath: string; uncertainty: ReferenceUncertainty }[] = [];

  const survivors: (ObjectRef & { document: string })[] = [
    ...content.graph.points.map((point) => ({ kind: 'concept' as const, id: point.id, document: point.data.document })),
    ...content.graph.hyperedges.map((edge) => ({ kind: 'derivation' as const, id: edge.id, document: edge.data.document })),
  ].filter((object) => !removed.has(object.id));

  for (const object of survivors) {
    const documentPath = objectSourcePath(object);
    const resource = content.documents[documentPath];
    if (!resource) { unread.push(documentPath); continue; }
    if (resource.status === 'error') { unreadable.push({ path: documentPath, message: resource.message }); continue; }
    const report = documentReferences(content, documentPath, resource.text);
    for (const reference of report.references) {
      if (reference.path && inScope(reference.path)) {
        incoming.push({ from: { documentPath, kind: object.kind, id: object.id }, reference });
      }
    }
    for (const uncertainty of report.uncertainties) uncertain.push({ documentPath, uncertainty });
  }

  return {
    scope,
    incoming,
    unread,
    unreadable,
    uncertain,
    orientation: orientationConceptImpact(content, scope.concepts.map(({ id }) => id)),
    complete: unread.length === 0 && unreadable.length === 0 && uncertain.length === 0,
  };
}

/**
 * Whether a deletion may proceed on reference grounds alone. Every source has to have been
 * analysed, and nothing may still point at what is being removed; an author repairs those
 * references, or confirms repairing them as part of the deletion, first.
 */
export function isDeletionSafe(impact: ReferenceImpact): boolean {
  return impact.complete && impact.incoming.length === 0 && impact.orientation.length === 0;
}

// ------------------------------------------------------------------ repair

export type ReferenceRepairChoice = {
  /** The reference as the impact reported it, so a stale plan is refused rather than applied. */
  readonly at: SourceRange;
  readonly action: ReferenceRepairAction;
  /** Where `retarget` should point instead. */
  readonly target?: ObjectRef;
};

export type RepairReferencesIntent = {
  /** The object whose document carries the references being repaired. */
  readonly object: ObjectRef;
  readonly repairs: readonly ReferenceRepairChoice[];
};

/** Rewrite chosen references in one document and accept the result as a complete change. */
export function repairDocumentReferences(content: WorkspaceContent, intent: RepairReferencesIntent): ContentChange {
  const owner = findObject(content, intent.object);
  const documentPath = objectSourcePath(owner.data);
  const source = objectDocumentSource(content, owner.data);
  if (!source || source.status !== 'ready') {
    throw new Error(source?.status === 'error' ? source.message : `无法读取要修正的文档：${documentPath}`);
  }
  const { references } = documentReferences(content, documentPath, source.text);
  const repaired = applyReferenceRepairs(source.text, references, intent.repairs.map((choice) => ({
    at: choice.at,
    action: choice.action,
    ...(choice.action === 'retarget'
      ? { href: objectDocumentHref(documentPath, findObject(content, requireTarget(choice)).data.document) }
      : {}),
  })));
  return updateObjectDocument(content, { object: intent.object, source: repaired });
}

function requireTarget(choice: ReferenceRepairChoice): ObjectRef {
  if (!choice.target) throw new Error('改指需要选择一个新的对象。');
  return choice.target;
}

export type RestoreDocumentIntent = {
  readonly object: ObjectRef;
  /** The body to write. Empty by default: a repair restores a place to write, not content. */
  readonly source?: string;
  /** Overwrite a document that exists but cannot be read. Its current bytes are lost. */
  readonly overwriteDamaged?: boolean;
};

/**
 * Give a missing or damaged object document a readable body again. Only ever called
 * because a user asked for it: opening or saving never repairs a document on its own.
 */
export function restoreObjectDocument(content: WorkspaceContent, intent: RestoreDocumentIntent): ContentChange {
  const owner = findObject(content, intent.object);
  const path = objectSourcePath(owner.data);
  const existing = content.documents[path];
  if (!existing) throw new Error(`还没有读取 ${path}，无法判断它是否需要修复。`);
  if (existing.status === 'ready') throw new Error(`${path} 已经可以读取，不需要修复。`);
  const text = intent.source ?? '';
  return {
    content: {
      ...content,
      documents: { ...content.documents, [path]: { status: 'ready', text } },
      diagnostics: content.diagnostics.filter((diagnostic) => diagnostic.path !== path),
    },
    changes: { documents: [{ path, content: text, ...(intent.overwriteDamaged ? {} : { createOnly: true as const }) }] },
    objectId: owner.id,
  };
}

// ------------------------------------------------------------------ deletion

export type DeleteObjectsIntent = {
  readonly plan: DeletionPlan;
  /**
   * The host's inventory of each removed directory, as workspace-relative paths. It is the
   * inventory and not a scan of document text, because an asset no body mentions is exactly
   * what a scan cannot find and what ADR-0005 says must go with its object. Every directory
   * in scope needs an entry; an entry may legitimately be empty.
   */
  readonly ownedFiles: Readonly<Record<string, readonly string[]>>;
  /** Repairs to surviving documents, confirmed as part of this one plan. */
  readonly repairs?: readonly RepairReferencesIntent[];
  /** Take the removed concepts out of the orientation configuration in the same change. */
  readonly repairOrientation?: boolean;
};

/** Markdown is written as text; everything else a directory holds is bytes. */
const isTextFile = (path: string) => path.toLowerCase().endsWith('.md');

/**
 * Carry out a complete deletion: the graph entries, every file the removed objects own, and
 * the reference repairs the author confirmed, as one content change on one commit. There is
 * no graph-only variant and no orphan-file cleanup afterwards (ADR-0005).
 *
 * The safety rule is the same one `isDeletionSafe` states, checked against the content the
 * repairs produce rather than the content the author started from: every reference source
 * must have been read, and nothing may still point at what is going. A source that could not
 * be read is not evidence of no references, so it refuses the deletion instead of being
 * skipped, and the object keeps its management entry.
 */
export function deleteObjects(content: WorkspaceContent, intent: DeleteObjectsIntent): ContentChange {
  const scope = deletionScope(content, intent.plan);
  const known = new Set([...content.graph.points, ...content.graph.hyperedges].map(({ id }) => id));
  const unknown = [...intent.plan.conceptIds ?? [], ...intent.plan.derivationIds ?? []].filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`删除方案说到了图里没有的对象：${unknown.join('、')}`);
  if (!scope.concepts.length && !scope.derivations.length) throw new Error('删除方案里没有要删除的对象。');

  const owned = ownedFilesInScope(scope, intent.ownedFiles);
  const removedIds = new Set([...scope.concepts, ...scope.derivations].map(({ id }) => id));

  let current = content;
  const documents: WorkspaceTextChange[] = [];
  let companionMetadata: WorkspaceTextChange[] = [];
  for (const repair of mergedRepairs(intent.repairs ?? [])) {
    if (removedIds.has(repair.object.id)) {
      throw new Error(`「${repair.object.id}」自己就在这次删除里，不需要也不能修正它的引用。`);
    }
    const change = repairDocumentReferences(current, repair);
    current = change.content;
    documents.push(...change.changes.documents ?? []);
  }
  if (intent.repairOrientation) {
    const config = current.orientation.status === 'absent' ? null : current.orientation.config;
    if (!config) throw new Error('开局配置读不出来，无法把它的修正纳入删除方案。');
    const change = updateOrientation(current, orientationWithoutConcepts(config, scope.concepts.map(({ id }) => id)));
    current = change.content;
    companionMetadata = [...change.changes.companionMetadata ?? []];
  }

  refuseUnsafeDeletion(referenceImpact(current, intent.plan));

  const manifest = parseWorkspaceManifest(current.graphText).manifest;
  const graph = serializeWorkspaceManifest({ ...manifest, graph: {
    points: manifest.graph.points.filter((point) => !removedIds.has(point.id)),
    hyperedges: manifest.graph.hyperedges.filter((edge) => !removedIds.has(edge.id)),
  } });
  const gone = new Set(owned);
  return {
    content: parseWorkspaceContent({
      graph,
      documents: withoutPaths(current.documents, gone),
      assets: withoutPaths(current.assets ?? {}, gone),
      companionMetadata: current.companionMetadata,
    }),
    changes: {
      graph,
      documents: [...documents, ...owned.filter(isTextFile).map((path) => ({ path, content: null }))],
      assets: owned.filter((path) => !isTextFile(path)).map((path): WorkspaceAssetChange => ({ path, content: null })),
      ...(companionMetadata.length ? { companionMetadata } : {}),
    },
  };
}

/**
 * The files the plan may delete. Ownership is checked here rather than trusted: a path the
 * host reported outside the directory it was asked about, or a directory the caller forgot
 * to ask about, refuses the whole deletion instead of writing part of it.
 */
function ownedFilesInScope(scope: DeletionScope, inventory: Readonly<Record<string, readonly string[]>>): string[] {
  const files: string[] = [];
  for (const directory of scope.directories) {
    const listed = inventory[directory];
    if (!listed) throw new Error(`还没有取得「${directory}」的所属文件清单，不能只删一半。`);
    for (const path of listed) {
      if (!path.startsWith(`${directory}/`)) {
        throw new Error(`文件「${path}」不在要删除的目录「${directory}」里，删除方案拒绝执行。`);
      }
      files.push(path);
    }
  }
  return [...new Set(files)];
}

/** One document is rewritten once, so the commit never carries the same path twice. */
function mergedRepairs(repairs: readonly RepairReferencesIntent[]): RepairReferencesIntent[] {
  const byObject = new Map<string, RepairReferencesIntent>();
  for (const intent of repairs) {
    const key = `${intent.object.kind}:${intent.object.id}`;
    const existing = byObject.get(key);
    byObject.set(key, existing
      ? { object: intent.object, repairs: [...existing.repairs, ...intent.repairs] }
      : intent);
  }
  return [...byObject.values()];
}

function refuseUnsafeDeletion(impact: ReferenceImpact): void {
  if (impact.unread.length) {
    throw new Error(`删除前的引用分析不完整：还有 ${impact.unread.length} 份文档没有读取，无法确认它们没有引用要删的内容。`);
  }
  if (impact.unreadable.length) {
    throw new Error(`删除前的引用分析不完整：${impact.unreadable.map(({ path }) => path).join('、')} 读不出来。`
      + '读不出来不等于没有引用，先修好这些来源再决定删除。');
  }
  if (impact.uncertain.length) {
    throw new Error(`删除前的引用分析不完整：有 ${impact.uncertain.length} 处引用来源无法分析。`);
  }
  if (impact.incoming.length) {
    throw new Error(`还有 ${impact.incoming.length} 处引用指向要删除的内容，每一处都要先选定怎么改。`);
  }
  if (impact.orientation.length) {
    throw new Error(`开局配置还有 ${impact.orientation.length} 处引用这些概念，需要一并纳入删除方案。`);
  }
}

function withoutPaths<T>(entries: Readonly<Record<string, T>>, removed: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(entries).filter(([path]) => !removed.has(path)));
}

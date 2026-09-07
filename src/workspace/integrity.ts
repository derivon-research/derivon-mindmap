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
import { objectSourcePath, type ConceptPoint, type DerivationHyperedge } from './manifest';
import {
  findObject, objectDocumentSource, orientationConceptImpact, updateObjectDocument,
  type ContentChange, type WorkspaceContent,
} from './content';
import {
  applyReferenceRepairs, documentReferences, objectDocumentHref,
  type DocumentReferenceItem, type ReferenceRepairAction, type ReferenceUncertainty, type SourceRange,
} from './references';
import type { OrientationConceptReference } from './orientation';

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

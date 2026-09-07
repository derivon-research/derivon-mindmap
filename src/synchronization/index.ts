import type { WorkspaceSource, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import {
  ORIENTATION_PATH, createConcept, createDerivation, objectSourcePath, parseWorkspaceContent,
  updateConceptTags, updateObjectDocument, updateObjectMetadata, updateOrientation, updateTagDeclarations,
  type ContentChange, type CreateConceptIntent, type CreateDerivationIntent, type OrientationConfig, type TagDeclaration,
  type TextResource, type UpdateConceptTagsIntent, type UpdateDocumentIntent, type UpdateMetadataIntent,
  type WorkspaceContent,
} from '../workspace/index';

type AcquiredContent = { readonly content: WorkspaceContent; readonly revision: string | null };

export type WorkspaceSnapshot = {
  readonly content: WorkspaceContent;
  readonly persistedContent: WorkspaceContent;
  /** The valid external version kept aside while local drafts or saves are protected. */
  readonly externalChange: AcquiredContent | null;
  /** Remount authoring drafts only after an explicit discard, not on ordinary content updates. */
  readonly authoringEpoch: number;
  readonly saveState: 'saved' | 'pending' | 'saving' | 'error';
  readonly error: string | null;
  readonly hasDrafts: boolean;
  readonly hasProtectedChanges: boolean;
};

export type WorkspaceReader = {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: () => void): () => void;
  readAsset(path: string): Promise<Uint8Array>;
  /** Explicit demand (object viewing or a body search), checked against the accepted basis. */
  readDocuments(paths: readonly string[]): Promise<Readonly<Record<string, TextResource>>>;
};

export type AuthoringCommands = {
  createConcept(intent: CreateConceptIntent): string;
  createDerivation(intent: CreateDerivationIntent): string;
  updateDocument(intent: UpdateDocumentIntent): void;
  updateObjectMetadata(intent: UpdateMetadataIntent): void;
  updateConceptTags(intent: UpdateConceptTagsIntent): void;
  updateTagDeclarations(tags: readonly TagDeclaration[]): void;
  /** `null` removes the companion document; the workspace stays valid without one. */
  updateOrientation(config: OrientationConfig | null): void;
  protectDraft(key: string, dirty: boolean): void;
};

export type WorkspaceSession = {
  readonly reader: WorkspaceReader;
  readonly authoring?: AuthoringCommands;
  /** Explicit retry/close integration point; mode changes never call this. */
  flush(): Promise<void>;
  reload(): Promise<'loaded' | 'protected'>;
  /** Caller must confirm discarding local drafts and queued changes. Never interrupts a write. */
  acceptExternalChange(): boolean;
  dispose(): void;
};

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

async function readContent(source: WorkspaceSource): Promise<WorkspaceContent> {
  const graph = await source.readGraph();
  let orientation: TextResource | null;
  try {
    const text = await source.readCompanionMetadata(ORIENTATION_PATH);
    orientation = text === null ? null : { status: 'ready', text };
  } catch (error) { orientation = { status: 'error', message: message(error) }; }
  return parseWorkspaceContent({ graph, documents: {}, companionMetadata: { [ORIENTATION_PATH]: orientation } });
}

async function readStableContent(source: WorkspaceSource): Promise<AcquiredContent> {
  if (!source.revision) return { content: await readContent(source), revision: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await source.revision();
    const content = await readContent(source);
    const after = await source.revision();
    if (before === after) return { content, revision: after };
  }
  throw new Error('工作区在读取期间持续变化，无法取得一致内容');
}

/** One instance per open workspace, composed above both mutually exclusive modes. */
export async function openWorkspaceSession(source: WorkspaceSource, options: {
  authoring?: WritableWorkspaceSource;
  autosaveDelayMs?: number;
  externalPollIntervalMs?: number;
} = {}): Promise<WorkspaceSession> {
  const initial = await readStableContent(source);
  let acceptedRevision = initial.revision;
  let snapshot: WorkspaceSnapshot = {
    content: initial.content, persistedContent: initial.content, externalChange: null, authoringEpoch: 0,
    saveState: 'saved', error: null, hasDrafts: false, hasProtectedChanges: false,
  };
  const listeners = new Set<() => void>();
  const drafts = new Set<string>();
  const loadedAssets = new Map<string, Uint8Array>();
  const loadedDocuments = new Map<string, TextResource>();
  let readingDocuments: Promise<unknown> = Promise.resolve();
  const queue: ContentChange[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | undefined;
  let disposed = false;
  let generation = 0;
  let writeGeneration = 0;
  let checkingExternalChange: Promise<void> | undefined;
  let externalPollTimer: ReturnType<typeof setInterval> | undefined;

  function publish(update: Partial<WorkspaceSnapshot>) {
    snapshot = { ...snapshot, ...update, hasDrafts: drafts.size > 0, hasProtectedChanges: drafts.size > 0 || queue.length > 0 };
    for (const listener of listeners) listener();
  }

  function installContent(next: AcquiredContent) {
    acceptedRevision = next.revision;
    generation++;
    loadedAssets.clear();
    loadedDocuments.clear();
    publish({ content: next.content, persistedContent: next.content, externalChange: null, saveState: 'saved', error: null });
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, options.autosaveDelayMs ?? 900);
  }

  function accept(change: ContentChange) {
    queue.push(change);
    generation++;
    publish({ content: change.content, saveState: saving ? 'saving' : 'pending', error: null });
    scheduleSave();
  }

  async function checkExternalChange(): Promise<void> {
    if (disposed || saving || !source.revision) return;
    if (checkingExternalChange) return checkingExternalChange;
    const beforeWrite = writeGeneration;
    const before = generation;
    checkingExternalChange = (async () => {
      try {
        const observedRevision = await source.revision!();
        if (observedRevision === acceptedRevision) {
          if (snapshot.externalChange) {
            publish({ externalChange: null });
            if (queue.length > 0) scheduleSave();
          }
          return;
        }
        if (observedRevision === snapshot.externalChange?.revision) return;
        const next = await readStableContent(source);
        // A local write may have started and finished while acquisition was in flight.
        if (disposed || saving || beforeWrite !== writeGeneration || next.revision === acceptedRevision) return;
        if (snapshot.hasProtectedChanges || snapshot.externalChange) {
          publish({ externalChange: next });
          return;
        }
        if (before !== generation) return;
        installContent(next);
      } catch (error) {
        if (!disposed && beforeWrite === writeGeneration) publish({ error: message(error) });
      }
    })();
    try { await checkingExternalChange; }
    finally { checkingExternalChange = undefined; }
  }

  if (source.revision) {
    externalPollTimer = setInterval(() => { void checkExternalChange(); }, options.externalPollIntervalMs ?? 1_000);
  }

  async function readAsset(path: string): Promise<Uint8Array> {
    if (disposed) throw new Error('工作区已关闭');
    const content = snapshot.content;
    const accepted = content.assets?.[path];
    if (accepted) return new Uint8Array(accepted);
    const cached = loadedAssets.get(path);
    if (cached) return new Uint8Array(cached);
    const bytes = await readChecked('资产', () => source.readAsset(path));
    loadedAssets.set(path, new Uint8Array(bytes));
    return new Uint8Array(bytes);
  }

  async function readDocuments(paths: readonly string[]): Promise<Readonly<Record<string, TextResource>>> {
    const content = snapshot.content;
    const requested = [...new Set(paths)];
    const owned = new Set([...content.graph.points, ...content.graph.hyperedges].map(({ data }) => objectSourcePath(data)));
    if (requested.some((path) => !owned.has(path))) throw new Error('不是当前工作区的 Markdown 对象文档');
    const result = readingDocuments.catch(() => {}).then(async () => {
      if (disposed || snapshot.content !== content) throw new Error('工作区预览已更新');
      const documents: Record<string, TextResource> = {};
      const missing = requested.filter((path) => {
        const resource = content.documents[path] ?? loadedDocuments.get(path);
        if (resource) documents[path] = resource;
        return !resource;
      });
      if (missing.length) {
        const acquired = await readChecked('文档', async () => {
          const resources: Record<string, TextResource> = {};
          let cursor = 0;
          await Promise.all(Array.from({ length: Math.min(8, missing.length) }, async () => {
            while (cursor < missing.length) {
              const path = missing[cursor++];
              try { resources[path] = { status: 'ready', text: await source.readDocument(path) }; }
              catch (error) { resources[path] = { status: 'error', message: message(error) }; }
            }
          }));
          return resources;
        });
        Object.assign(documents, acquired);
        for (const [path, resource] of Object.entries(acquired)) loadedDocuments.set(path, resource);
      }
      return documents;
    });
    readingDocuments = result;
    return result;
  }

  async function readChecked<T>(kind: '文档' | '资产', read: () => Promise<T>): Promise<T> {
    const content = snapshot.content;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (saving) await saving;
      if (disposed || snapshot.content !== content) throw new Error('工作区预览已更新');
      const revision = acceptedRevision;
      const beforeWrite = writeGeneration;
      const beforeRevision = await source.revision?.();
      if (saving || beforeWrite !== writeGeneration) continue;
      if (beforeRevision !== undefined && beforeRevision !== revision) {
        await checkExternalChange();
        throw new Error(`外部工作区内容已更新，无法把新${kind}混入受保护的有效内容`);
      }
      const resource = await read();
      const afterRevision = await source.revision?.();
      // A successful local save changes the disk token, not the effective preview. Retry
      // only this known overlap; external failures never enter an unbounded reload loop.
      if (saving || beforeWrite !== writeGeneration) continue;
      if (disposed || snapshot.content !== content || acceptedRevision !== revision
        || (beforeRevision !== undefined && afterRevision !== beforeRevision)) {
        void checkExternalChange();
        throw new Error(`工作区内容已在${kind}读取期间更新`);
      }
      return resource;
    }
    throw new Error(`工作区在${kind}读取期间持续保存，无法取得一致${kind}`);
  }

  async function flush(): Promise<void> {
    clearTimeout(timer);
    if (saving) return saving;
    if (!options.authoring || queue.length === 0 || snapshot.externalChange) return;
    writeGeneration++;
    saving = (async () => {
      while (queue.length > 0) {
        const change = queue[0];
        publish({ saveState: 'saving', error: null });
        try {
          const revision = await options.authoring!.commit({ ...change.changes,
            ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }) });
          if (source.revision && revision === undefined) throw new Error('版本化工作区提交未返回写入版本');
          acceptedRevision = revision ?? acceptedRevision;
        } catch (error) {
          publish({ saveState: 'error', error: message(error) });
          return;
        }
        queue.shift();
        publish({ persistedContent: change.content, saveState: queue.length > 0 ? 'pending' : 'saved' });
      }
    })();
    try { await saving; }
    finally { saving = undefined; }
    await checkExternalChange();
  }

  function authoringCommands(): AuthoringCommands | undefined {
    if (!options.authoring) return undefined;
    const epoch = snapshot.authoringEpoch;
    function assertCurrent() {
      if (disposed || snapshot.authoringEpoch !== epoch) throw new Error('编辑会话已关闭或重新载入');
    }
    return {
      createConcept(intent) {
        assertCurrent();
        const change = createConcept(snapshot.content, intent);
        accept(change);
        return change.objectId;
      },
      createDerivation(intent) {
        assertCurrent();
        const change = createDerivation(snapshot.content, intent);
        accept(change);
        return change.objectId;
      },
      updateDocument(intent) {
        assertCurrent();
        const content = snapshot.content;
        const objects = intent.object.kind === 'concept' ? content.graph.points : content.graph.hyperedges;
        const owner = objects.find(({ id }) => id === intent.object.id);
        const path = owner && objectSourcePath(owner.data);
        const cached = path && loadedDocuments.get(path);
        const basis = path && cached && !content.documents[path]
          ? { ...content, documents: { ...content.documents, [path]: cached } } : content;
        accept(updateObjectDocument(basis, intent));
      },
      updateObjectMetadata(intent) { assertCurrent(); accept(updateObjectMetadata(snapshot.content, intent)); },
      updateConceptTags(intent) { assertCurrent(); accept(updateConceptTags(snapshot.content, intent)); },
      updateTagDeclarations(tags) { assertCurrent(); accept(updateTagDeclarations(snapshot.content, tags)); },
      updateOrientation(config) { assertCurrent(); accept(updateOrientation(snapshot.content, config)); },
      protectDraft(key, dirty) {
        if (disposed || snapshot.authoringEpoch !== epoch) return;
        if (dirty) drafts.add(key); else drafts.delete(key);
        generation++;
        publish({});
      },
    };
  }
  let commands = authoringCommands();

  return {
    reader: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      readAsset,
      readDocuments,
    },
    get authoring() { return commands; },
    flush,
    acceptExternalChange() {
      if (disposed || saving || !snapshot.externalChange) return false;
      const next = snapshot.externalChange;
      clearTimeout(timer);
      queue.length = 0;
      drafts.clear();
      snapshot = { ...snapshot, authoringEpoch: snapshot.authoringEpoch + 1 };
      commands = authoringCommands();
      installContent(next);
      return true;
    },
    async reload() {
      if (disposed || snapshot.hasProtectedChanges) return 'protected';
      const before = generation;
      const next = await readStableContent(source);
      if (disposed || snapshot.hasProtectedChanges || before !== generation) return 'protected';
      installContent(next);
      return 'loaded';
    },
    dispose() {
      disposed = true;
      listeners.clear();
      loadedAssets.clear();
      loadedDocuments.clear();
      clearTimeout(timer);
      clearInterval(externalPollTimer);
      // The application warns before closing; already-authorized work is not cancelled.
      void flush();
    },
  };
}

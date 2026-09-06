import type { WorkspaceSource, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import {
  createConcept, objectDocumentPaths, parseWorkspaceContent, parseWorkspaceGraph, updateObjectDocument,
  type ContentChange, type CreateConceptIntent, type TextResource, type UpdateDocumentIntent, type WorkspaceContent,
} from '../workspace/index';

export type WorkspaceSnapshot = {
  readonly content: WorkspaceContent;
  readonly persistedContent: WorkspaceContent;
  /** The valid external version kept aside while local drafts or saves are protected. */
  readonly externalChange: { readonly content: WorkspaceContent; readonly revision: string | null } | null;
  readonly saveState: 'saved' | 'pending' | 'saving' | 'error';
  readonly error: string | null;
  readonly hasDrafts: boolean;
  readonly hasProtectedChanges: boolean;
};

export type WorkspaceReader = {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: () => void): () => void;
  readAsset(path: string): Promise<Uint8Array>;
};

export type AuthoringCommands = {
  createConcept(intent: CreateConceptIntent): string;
  updateDocument(intent: UpdateDocumentIntent): void;
  protectDraft(key: string, dirty: boolean): void;
};

export type WorkspaceSession = {
  readonly reader: WorkspaceReader;
  readonly authoring?: AuthoringCommands;
  /** Explicit retry/close integration point; mode changes never call this. */
  flush(): Promise<void>;
  reload(): Promise<'loaded' | 'protected'>;
  /** Keep accepted local work and make the buffered external version the next save baseline. */
  keepLocalAfterExternalChange(): void;
  dispose(): void;
};

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

async function readContent(source: WorkspaceSource): Promise<WorkspaceContent> {
  const graph = await source.readGraph();
  const structure = parseWorkspaceGraph(graph);
  const paths = [...new Set([...structure.points, ...structure.hyperedges].flatMap((object) => objectDocumentPaths(object.data)))];
  const documents: Record<string, TextResource> = {};
  // Bound native IPC fan-out when opening workspaces with thousands of documents.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, paths.length) }, async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      try { documents[path] = { status: 'ready', text: await source.readDocument(path) }; }
      catch (error) { documents[path] = { status: 'error', message: message(error) }; }
    }
  }));
  let orientation: TextResource | null;
  try {
    const text = await source.readCompanionMetadata('.derivon/orientation.json');
    orientation = text === null ? null : { status: 'ready', text };
  } catch (error) { orientation = { status: 'error', message: message(error) }; }
  return parseWorkspaceContent({ graph, documents, companionMetadata: { '.derivon/orientation.json': orientation } });
}

async function readStableContent(source: WorkspaceSource): Promise<{ content: WorkspaceContent; revision: string | null }> {
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
    content: initial.content, persistedContent: initial.content, externalChange: null, saveState: 'saved', error: null,
    hasDrafts: false, hasProtectedChanges: false,
  };
  const listeners = new Set<() => void>();
  const drafts = new Set<string>();
  const loadedAssets = new Map<string, Uint8Array>();
  const queue: ContentChange[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | undefined;
  let disposed = false;
  let generation = 0;
  let checkingExternalChange = false;
  let externalPollTimer: ReturnType<typeof setInterval> | undefined;

  function accept(change: ContentChange) {
    queue.push(change);
    generation++;
    publish({ content: change.content, saveState: saving ? 'saving' : 'pending', error: null });
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, options.autosaveDelayMs ?? 900);
  }

  function publish(update: Partial<WorkspaceSnapshot>) {
    snapshot = { ...snapshot, ...update, hasDrafts: drafts.size > 0, hasProtectedChanges: drafts.size > 0 || queue.length > 0 };
    for (const listener of listeners) listener();
  }

  async function checkExternalChange(): Promise<void> {
    if (disposed || checkingExternalChange || !source.revision) return;
    checkingExternalChange = true;
    try {
      const observedRevision = await source.revision();
      if (observedRevision === acceptedRevision) return;
      const next = await readStableContent(source);
      if (disposed || next.revision === acceptedRevision) return;
      if (snapshot.hasProtectedChanges) {
        publish({ externalChange: next });
        return;
      }
      acceptedRevision = next.revision;
      generation++;
      loadedAssets.clear();
      publish({ content: next.content, persistedContent: next.content, externalChange: null, saveState: 'saved', error: null });
    } catch (error) {
      if (!disposed) publish({ error: message(error) });
    } finally {
      checkingExternalChange = false;
    }
  }

  if (source.revision) {
    externalPollTimer = setInterval(() => { void checkExternalChange(); }, options.externalPollIntervalMs ?? 1_000);
  }

  async function readAsset(path: string): Promise<Uint8Array> {
    const accepted = snapshot.content.assets?.[path];
    if (accepted) return new Uint8Array(accepted);
    const cached = loadedAssets.get(path);
    if (cached) return new Uint8Array(cached);
    const beforeRevision = await source.revision?.();
    if (beforeRevision !== undefined && beforeRevision !== acceptedRevision) {
      await checkExternalChange();
      if (snapshot.hasProtectedChanges || snapshot.externalChange) {
        throw new Error('外部工作区内容已更新，无法把新资产混入受保护的有效内容');
      }
      return readAsset(path);
    }
    const before = generation;
    const bytes = new Uint8Array(await source.readAsset(path));
    const afterRevision = await source.revision?.();
    if (beforeRevision !== undefined && afterRevision !== beforeRevision) {
      await checkExternalChange();
      if (snapshot.hasProtectedChanges || snapshot.externalChange) {
        throw new Error('外部工作区内容已在资产读取期间更新');
      }
      return readAsset(path);
    }
    if (!disposed && generation === before) loadedAssets.set(path, bytes);
    return new Uint8Array(snapshot.content.assets?.[path] ?? bytes);
  }

  async function flush(): Promise<void> {
    clearTimeout(timer);
    if (saving) return saving;
    if (!options.authoring || queue.length === 0) return;
    saving = (async () => {
      while (queue.length > 0) {
        const change = queue[0];
        publish({ saveState: 'saving', error: null });
        try {
          const revision = await options.authoring!.commit({ ...change.changes,
            ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }) });
          acceptedRevision = revision ?? await source.revision?.() ?? acceptedRevision;
        }
        catch (error) {
          publish({ saveState: 'error', error: message(error) });
          void checkExternalChange();
          return;
        }
        queue.shift();
        publish({ persistedContent: change.content, saveState: queue.length > 0 ? 'pending' : 'saved' });
      }
    })();
    await saving;
    saving = undefined;
  }

  return {
    reader: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      readAsset,
    },
    ...(options.authoring ? { authoring: {
      createConcept(intent: CreateConceptIntent) {
        if (disposed) throw new Error('工作区已关闭');
        const change = createConcept(snapshot.content, intent);
        accept(change);
        return change.objectId;
      },
      updateDocument(intent: UpdateDocumentIntent) {
        if (disposed) throw new Error('工作区已关闭');
        accept(updateObjectDocument(snapshot.content, intent));
      },
      protectDraft(key: string, dirty: boolean) {
        if (disposed) return;
        if (dirty) drafts.add(key); else drafts.delete(key);
        generation++;
        publish({});
      },
    } } : {}),
    flush,
    keepLocalAfterExternalChange() {
      if (disposed || !snapshot.externalChange) return;
      acceptedRevision = snapshot.externalChange.revision;
      publish({ externalChange: null });
    },
    async reload() {
      if (disposed || snapshot.hasProtectedChanges) return 'protected';
      const before = generation;
      const next = await readStableContent(source);
      if (disposed || snapshot.hasProtectedChanges || before !== generation) return 'protected';
      acceptedRevision = next.revision;
      generation++;
      loadedAssets.clear();
      publish({ content: next.content, persistedContent: next.content, externalChange: null, saveState: 'saved', error: null });
      return 'loaded';
    },
    dispose() {
      disposed = true;
      listeners.clear();
      loadedAssets.clear();
      clearTimeout(timer);
      clearInterval(externalPollTimer);
      // The application warns before closing; already-authorized work is not cancelled.
      void flush();
    },
  };
}

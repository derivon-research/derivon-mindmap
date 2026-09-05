import type { WorkspaceSource, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import {
  createConcept, objectDocumentPaths, parseWorkspaceContent, parseWorkspaceGraph, updateObjectDocument,
  type ContentChange, type CreateConceptIntent, type TextResource, type UpdateDocumentIntent, type WorkspaceContent,
} from '../workspace/index';

export type WorkspaceSnapshot = {
  readonly content: WorkspaceContent;
  readonly persistedContent: WorkspaceContent;
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

/** One instance per open workspace, composed above both mutually exclusive modes. */
export async function openWorkspaceSession(source: WorkspaceSource, options: {
  authoring?: WritableWorkspaceSource;
  autosaveDelayMs?: number;
} = {}): Promise<WorkspaceSession> {
  const content = await readContent(source);
  let snapshot: WorkspaceSnapshot = {
    content, persistedContent: content, saveState: 'saved', error: null,
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

  async function flush(): Promise<void> {
    clearTimeout(timer);
    if (saving) return saving;
    if (!options.authoring || queue.length === 0) return;
    saving = (async () => {
      while (queue.length > 0) {
        const change = queue[0];
        publish({ saveState: 'saving', error: null });
        try { await options.authoring!.commit(change.changes); }
        catch (error) { publish({ saveState: 'error', error: message(error) }); return; }
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
      async readAsset(path) {
        const accepted = snapshot.content.assets?.[path];
        if (accepted) return new Uint8Array(accepted);
        const cached = loadedAssets.get(path);
        if (cached) return new Uint8Array(cached);
        const before = generation;
        const bytes = new Uint8Array(await source.readAsset(path));
        if (!disposed && generation === before) loadedAssets.set(path, bytes);
        return new Uint8Array(snapshot.content.assets?.[path] ?? bytes);
      },
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
    async reload() {
      if (disposed || snapshot.hasProtectedChanges) return 'protected';
      const before = generation;
      const next = await readContent(source);
      if (disposed || snapshot.hasProtectedChanges || before !== generation) return 'protected';
      generation++;
      loadedAssets.clear();
      publish({ content: next, persistedContent: next, saveState: 'saved', error: null });
      return 'loaded';
    },
    dispose() {
      disposed = true;
      listeners.clear();
      loadedAssets.clear();
      clearTimeout(timer);
      // The application warns before closing; already-authorized work is not cancelled.
      void flush();
    },
  };
}

import type { WorkspaceContent } from '../../../workspace/index';
import type { SearchDocument, SearchFilter, SearchPage } from './engine';
import type { SearchRequest } from './search.worker';
export type { SearchObject, SearchHit, SearchFilter, SearchPage } from './engine';

export function createWorkspaceSearch(content: WorkspaceContent, onReady: () => void, onError: (message: string) => void) {
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  let disposed = false;
  let failed = false;
  let nextId = 0;
  const pending = new Map<number, (page: SearchPage) => void>();
  const empty = { hits: [], total: 0 };
  const fail = (message: string) => {
    if (disposed || failed) return;
    failed = true;
    worker.terminate();
    for (const resolve of pending.values()) resolve(empty);
    pending.clear();
    onError(message);
  };
  worker.onerror = (event) => { event.preventDefault(); fail(event.message || '搜索服务启动失败'); };
  worker.onmessage = ({ data }: MessageEvent<SearchPage & { type: string; id: number; message: string }>) => {
    if (disposed || failed) return;
    if (data.type === 'ready') onReady();
    if (data.type === 'error') fail(data.message);
    if (data.type === 'results') { pending.get(data.id)?.({ hits: data.hits, total: data.total }); pending.delete(data.id); }
  };
  const post = (request: SearchRequest) => worker.postMessage(request);
  const objects = [
    ...content.graph.points.map((object) => ({ object, kind: 'concept' as const })),
    ...content.graph.hyperedges.map((object) => ({ object, kind: 'derivation' as const })),
  ];
  // Copy only source text, not generated HTML duplicates, in bounded batches between frames.
  void (async () => {
    try {
      for (let offset = 0; offset < objects.length; offset += 24) {
        if (disposed || failed) return;
        const documents = objects.slice(offset, offset + 24).map(({ object, kind }): SearchDocument => {
          const data = object.data as typeof object.data & { label?: unknown; description?: unknown };
          const source = content.documents[`${data.document}/${data.format === 'markdown' ? 'document.md' : 'index.html'}`];
          return { kind, id: object.id, label: typeof data.label === 'string' && data.label ? data.label : object.id,
            description: typeof data.description === 'string' ? data.description : '',
            format: data.format, body: source?.status === 'ready' ? source.text : '' };
        });
        post({ type: 'add', documents });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!disposed && !failed) post({ type: 'ready' });
    } catch (error) { fail(String(error)); }
  })();
  return {
    search(query: string, filter: SearchFilter): Promise<SearchPage> {
      if (disposed || failed) return Promise.resolve(empty);
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        try { post({ type: 'search', id, query, filter }); } catch (error) { fail(String(error)); }
      });
    },
    dispose() {
      disposed = true;
      worker.terminate();
      for (const resolve of pending.values()) resolve(empty);
      pending.clear();
    },
  };
}

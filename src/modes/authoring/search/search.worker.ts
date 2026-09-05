import { createSearchIndex, type SearchDocument, type SearchFilter } from './engine';

export type SearchRequest =
  | { type: 'add'; documents: SearchDocument[] }
  | { type: 'ready' }
  | { type: 'search'; id: number; query: string; filter: SearchFilter };
const index = createSearchIndex();
self.onmessage = ({ data }: MessageEvent<SearchRequest>) => {
  try {
    if (data.type === 'add') index.add(data.documents);
    if (data.type === 'ready') self.postMessage({ type: 'ready' });
    if (data.type === 'search') self.postMessage({ type: 'results', id: data.id, ...index.search(data.query, data.filter) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

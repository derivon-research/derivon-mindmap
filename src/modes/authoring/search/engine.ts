import MiniSearch from 'minisearch';

export type SearchObject = { readonly kind: 'concept' | 'derivation'; readonly id: string };
export type SearchFilter = 'all' | SearchObject['kind'];
export type SearchDocument = SearchObject & { label: string; description: string; body: string };
export type SearchHit = SearchObject & { label: string; snippet: string };
export type SearchPage = { hits: SearchHit[]; total: number };
type IndexedDocument = SearchDocument & { key: string };

// Intl segmentation gives Chinese word boundaries without a second language dictionary.
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
function tokenize(text: string): string[] {
  return Array.from(segmenter.segment(text.normalize('NFKC')), (part) => part.isWordLike ? part.segment : '').filter(Boolean);
}

/** Runs only in the search worker. No workspace reads and no document mutation. */
export function createSearchIndex() {
  const documents = new Map<string, IndexedDocument>();
  const index = new MiniSearch<IndexedDocument>({
    idField: 'key', fields: ['id', 'label', 'description', 'body'], tokenize,
    searchOptions: { combineWith: 'AND', prefix: true, boost: { id: 6, label: 5, description: 2 },
      fuzzy: (term) => /^[a-z]{5,}$/i.test(term) ? 0.15 : false },
  });
  return {
    add(batch: readonly SearchDocument[]) {
      for (const source of batch) {
        const document = { ...source, key: `${source.kind}:${source.id}`,
          body: source.body.replace(/\s+/g, ' ').trim() };
        documents.set(document.key, document);
        if (index.has(document.key)) index.replace(document);
        else index.add(document);
      }
    },
    search(query: string, filter: SearchFilter): SearchPage {
      if (!query.trim()) return { hits: [], total: 0 };
      const matches = index.search(query, { filter: (hit) => filter === 'all' || documents.get(String(hit.id))?.kind === filter });
      return { total: matches.length, hits: matches.slice(0, 12).map((match) => {
        const document = documents.get(String(match.id))!;
        const lower = document.body.toLocaleLowerCase();
        const positions = match.terms.map((term) => lower.indexOf(term.toLocaleLowerCase())).filter((position) => position >= 0);
        const position = positions.length ? Math.min(...positions) : 0;
        const start = Math.max(0, position - 32);
        return { id: document.id, kind: document.kind, label: document.label,
          snippet: `${start ? '…' : ''}${document.body.slice(start, start + 140) || document.description}` };
      }) };
    },
  };
}

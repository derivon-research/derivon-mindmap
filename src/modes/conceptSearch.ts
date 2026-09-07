/**
 * Concept lookup for the one input box the learning side offers: the learner types either
 * a question or a concept name into it, so the search has to be good enough that the top
 * suggestion is the one they meant.
 *
 * Substring matching over label and id, ranked exact → prefix → contained. No index is
 * built: the first screen must not carry a search library, and a workspace this size is
 * scanned faster than an index would be loaded.
 */
import type { ConceptPoint, WorkspaceGraph } from '../workspace/index';

/** How many suggestions the composer shows under the box. */
export const SEARCH_SUGGESTION_LIMIT = 6;

function rank(point: ConceptPoint, term: string): number {
  const label = point.data.label.toLowerCase();
  const id = point.id.toLowerCase();
  if (label === term || id === term) return 0;
  if (label.startsWith(term) || id.startsWith(term)) return 1;
  if (label.includes(term) || id.includes(term)) return 2;
  return Number.POSITIVE_INFINITY;
}

/** The concepts a query names, best first. A blank query names nothing. */
export function searchConcepts(
  graph: WorkspaceGraph,
  query: string,
  limit: number = SEARCH_SUGGESTION_LIMIT,
): readonly ConceptPoint[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return graph.points
    .map((point, order) => ({ point, order, rank: rank(point, term) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, limit)
    .map((entry) => entry.point);
}

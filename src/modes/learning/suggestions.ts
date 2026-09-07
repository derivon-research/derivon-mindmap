/**
 * What to put in front of a learner: which concepts to offer as targets, and what to ask
 * them to do with a concept they have just read. Both answers come from the graph's own
 * shape, so a workspace gets them without writing a single line of orientation copy.
 */
import { conceptTags, type WorkspaceGraph } from '../../workspace/index';
import type { RouteStep } from '../routePreview';

/** How many suggestions one block offers. */
export const SUGGESTION_LIMIT = 4;

/**
 * The concepts the graph builds towards: heads of derivations that are themselves premises
 * of nothing. These are the natural targets — everything else exists to reach them.
 *
 * Ranked by how many derivations produce the concept, because a meeting point of several
 * derivations is the more substantial destination.
 */
export function terminalConcepts(graph: WorkspaceGraph, limit: number = SUGGESTION_LIMIT): readonly string[] {
  const premises = new Set(graph.hyperedges.flatMap((edge) => edge.tails));
  const produced = new Map<string, number>();
  for (const edge of graph.hyperedges) {
    if (premises.has(edge.head)) continue;
    produced.set(edge.head, (produced.get(edge.head) ?? 0) + 1);
  }
  return [...produced.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left || (leftId < rightId ? -1 : 1))
    .slice(0, Math.max(limit, 0))
    .map(([conceptId]) => conceptId);
}

/**
 * Concepts sharing a tag with what the learner already chose — the "while you are here"
 * offer. Tags are the author's own grouping, so this stays inside the vocabulary the
 * workspace already uses rather than inventing a similarity of our own.
 */
export function sameTagNeighbours(
  graph: WorkspaceGraph,
  conceptIds: readonly string[],
  limit: number = SUGGESTION_LIMIT,
): readonly string[] {
  const chosen = new Set(conceptIds);
  const wanted = new Set(graph.points
    .filter((point) => chosen.has(point.id))
    .flatMap((point) => conceptTags(point)));
  if (!wanted.size) return [];
  return graph.points
    .filter((point) => !chosen.has(point.id) && conceptTags(point).some((tag) => wanted.has(tag)))
    .slice(0, Math.max(limit, 0))
    .map((point) => point.id);
}

/**
 * The comprehension check that follows a definition. It is generated, not written: the
 * route already says what this concept is for — the next step that leans on it — and
 * asking the learner to explain that is a better check than any fixed prompt.
 *
 * When nothing downstream needs it, the concept is a destination rather than a tool, and
 * the only honest question left is for an example of the learner's own.
 */
export function comprehensionTask(steps: readonly RouteStep[], step: RouteStep): string {
  const next = steps.find((candidate) => candidate.index > step.index && candidate.requires.includes(step.conceptId));
  if (next) return `用刚学的「${step.label}」说一下：接下来的「${next.label}」为什么非得先有它不可？`;
  return `举一个你自己碰到过的例子：「${step.label}」在哪儿用得上，或者没有它会卡在哪里？`;
}

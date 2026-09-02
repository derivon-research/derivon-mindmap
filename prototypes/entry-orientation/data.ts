// PROTOTYPE — throwaway. Shared data + a rough solver for custom known-sets.
import graphFixture from './fixtures/graph.json';
import routeFixture from './fixtures/routes.json';
import documentFixture from './fixtures/documents.json';

export type Point = { id: string; label: string; tag: string };
export type Edge = { id: string; tails: string[]; head: string; weight: number };
export type Preset = { id: string; label: string; blurb: string; points: string[] };
export type Route = {
  reachable: boolean;
  cost: number | null;
  order: string[];
  pointIds: string[];
  exact: boolean;
};

export const points: Point[] = graphFixture.points;
export const edges: Edge[] = graphFixture.hyperedges;
export const presets: Preset[] = graphFixture.presets;
export const documents: Record<string, string> = documentFixture as Record<string, string>;

export const pointById = new Map(points.map((point) => [point.id, point]));
export const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
export const labelOf = (id: string) => pointById.get(id)?.label ?? id;
export const tagOf = (id: string) => pointById.get(id)?.tag ?? '其他';

export const tags: string[] = [...new Set(points.map((point) => point.tag))];
export const pointsByTag = new Map(tags.map((tag) => [tag, points.filter((point) => point.tag === tag)]));

const edgesByHead = new Map<string, Edge[]>();
for (const edge of edges) {
  const list = edgesByHead.get(edge.head) ?? [];
  list.push(edge);
  edgesByHead.set(edge.head, list);
}

/** Aggregate hyperedges into tag-to-tag dependencies, for the atlas overview. */
export const tagLinks: Array<{ from: string; to: string; count: number }> = (() => {
  const counter = new Map<string, number>();
  for (const edge of edges) {
    for (const tail of edge.tails) {
      const from = tagOf(tail);
      const to = tagOf(edge.head);
      if (from === to) continue;
      const key = `${from}\u0000${to}`;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([key, count]) => ({ from: key.split('\u0000')[0], to: key.split('\u0000')[1], count }))
    .filter((link) => link.count >= 3)
    .sort((a, b) => b.count - a.count);
})();

const exactRoutes = routeFixture as Record<string, Record<string, {
  reachable: boolean; cost: number | null; order: string[]; pointIds: string[];
}>>;

function samePointSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/**
 * Rough greedy solver, used only when the known-set is not one of the four presets.
 * The presets hit precomputed answers from the real derivon CLI; this one is a
 * cheap upper bound so the prototype stays clickable. Marked in the UI as 近似.
 */
function approximateRoute(known: Set<string>, target: string): Route {
  const memo = new Map<string, { cost: number; edges: Set<string> } | null>();
  const inProgress = new Set<string>();

  function best(pointId: string): { cost: number; edges: Set<string> } | null {
    if (known.has(pointId)) return { cost: 0, edges: new Set() };
    if (memo.has(pointId)) return memo.get(pointId)!;
    if (inProgress.has(pointId)) return null;
    inProgress.add(pointId);
    let winner: { cost: number; edges: Set<string> } | null = null;
    for (const edge of edgesByHead.get(pointId) ?? []) {
      const parts = edge.tails.map((tail) => best(tail));
      if (parts.some((part) => part === null)) continue;
      const selected = new Set<string>([edge.id]);
      for (const part of parts) part!.edges.forEach((id) => selected.add(id));
      let cost = 0;
      for (const id of selected) cost += edgeById.get(id)?.weight ?? 0;
      if (!winner || cost < winner.cost) winner = { cost, edges: selected };
    }
    inProgress.delete(pointId);
    memo.set(pointId, winner);
    return winner;
  }

  const solution = best(target);
  if (!solution) return { reachable: false, cost: null, order: [], pointIds: [], exact: false };

  const derived = new Set(known);
  const order: string[] = [];
  const remaining = new Set(solution.edges);
  let progress = true;
  while (remaining.size && progress) {
    progress = false;
    for (const id of [...remaining]) {
      const edge = edgeById.get(id)!;
      if (edge.tails.every((tail) => derived.has(tail))) {
        order.push(id);
        derived.add(edge.head);
        remaining.delete(id);
        progress = true;
      }
    }
  }
  return {
    reachable: true,
    cost: solution.cost,
    order,
    pointIds: [...derived],
    exact: false,
  };
}

/** The one entry point every variant uses. */
export function solveRoute(known: Iterable<string>, target: string): Route {
  const knownSet = new Set(known);
  const preset = presets.find((item) => samePointSet(item.points, knownSet));
  if (preset) {
    const stored = exactRoutes[preset.id][target];
    if (stored) return { ...stored, exact: true };
  }
  return approximateRoute(knownSet, target);
}

export type Step = {
  index: number;
  edgeId: string;
  pointId: string;
  label: string;
  tag: string;
  weight: number;
  requires: string[];
};

/** Turn a solved route into the ordered list of things the learner actually has to learn. */
export function routeSteps(route: Route, known: Iterable<string>): Step[] {
  const derived = new Set(known);
  const steps: Step[] = [];
  for (const edgeId of route.order) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;
    const requires = edge.tails.slice();
    const isNew = !derived.has(edge.head);
    derived.add(edge.head);
    if (!isNew) continue;
    steps.push({
      index: steps.length + 1,
      edgeId,
      pointId: edge.head,
      label: labelOf(edge.head),
      tag: tagOf(edge.head),
      weight: edge.weight,
      requires,
    });
  }
  return steps;
}

export function searchPoints(query: string, limit = 12): Point[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  return points
    .filter((point) => point.label.toLowerCase().includes(text) || point.id.includes(text))
    .slice(0, limit);
}

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
export type Weights = Record<string, number>;
export const weightOf = (edgeId: string, overrides?: Weights) =>
  overrides?.[edgeId] ?? edgeById.get(edgeId)?.weight ?? 0;

function approximateRoute(baseKnown: Set<string>, targets: string[], overrides?: Weights): Route {
  let known = new Set(baseKnown);
  /**
   * Bellman-Ford style relaxation over the hypergraph: cost(p) = 0 when known,
   * else min over incoming hyperedges of weight + sum of tail costs. Cycles simply
   * never improve, which is why this replaced the recursive version: that one
   * memoised a null computed under an in-progress ancestor and lost whole targets.
   */
  function solveFrom(startKnown: Set<string>) {
    const cost = new Map<string, number>();
    const via = new Map<string, string>();
    for (const id of startKnown) cost.set(id, 0);
    for (let round = 0; round < points.length; round += 1) {
      let changed = false;
      for (const edge of edges) {
        let tailCost = 0;
        let reachable = true;
        for (const tail of edge.tails) {
          const value = cost.get(tail);
          if (value === undefined) { reachable = false; break; }
          tailCost += value;
        }
        if (!reachable) continue;
        const candidate = tailCost + weightOf(edge.id, overrides);
        const currentCost = cost.get(edge.head);
        if (currentCost === undefined || candidate < currentCost - 1e-9) {
          cost.set(edge.head, candidate);
          via.set(edge.head, edge.id);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return { cost, via };
  }

  function best(pointId: string): { cost: number; edges: Set<string> } | null {
    if (known.has(pointId)) return { cost: 0, edges: new Set() };
    const { cost, via } = solveFrom(known);
    if (!cost.has(pointId)) return null;
    const selected = new Set<string>();
    const stack = [pointId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (known.has(id) || seen.has(id)) continue;
      seen.add(id);
      const edgeId = via.get(id);
      if (!edgeId) continue;
      selected.add(edgeId);
      edgeById.get(edgeId)!.tails.forEach((tail) => stack.push(tail));
    }
    let total = 0;
    for (const id of selected) total += weightOf(id, overrides);
    return { cost: total, edges: selected };
  }

  // Multi-target: take the targets in turn, letting later ones reuse what earlier
  // ones already bought. A real set-cover solver would do better; this is a bound.
  const selected = new Set<string>();
  for (const target of targets) {
    const solution = best(target);
    if (!solution) return { reachable: false, cost: null, order: [], pointIds: [], exact: false };
    solution.edges.forEach((id) => selected.add(id));
    known = new Set([...known, ...pointsOf(solution.edges)]);
  }
  let total = 0;
  for (const id of selected) total += weightOf(id, overrides);

  const derived = new Set(baseKnown);
  const order: string[] = [];
  const remaining = new Set(selected);
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
    cost: total,
    order,
    pointIds: [...derived],
    exact: false,
  };

  function pointsOf(edgeIds: Iterable<string>): string[] {
    const heads: string[] = [];
    for (const id of edgeIds) {
      const edge = edgeById.get(id);
      if (edge) heads.push(edge.head);
    }
    return heads;
  }
}

/** The one entry point every variant uses. Accepts one target or several. */
export function solveRoute(known: Iterable<string>, target: string | string[], overrides?: Weights): Route {
  const knownSet = new Set(known);
  const targets = Array.isArray(target) ? target : [target];
  if (!targets.length) return { reachable: true, cost: 0, order: [], pointIds: [...knownSet], exact: true };
  if (targets.length === 1 && !overrides) {
    const preset = presets.find((item) => samePointSet(item.points, knownSet));
    if (preset) {
      const stored = exactRoutes[preset.id][targets[0]];
      if (stored) return { ...stored, exact: true };
    }
  }
  return approximateRoute(knownSet, targets, overrides);
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

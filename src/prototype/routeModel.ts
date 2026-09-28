/**
 * PROTOTYPE ONLY — throwaway branch (#153). The part worth lifting.
 *
 * A route as a *derivation subgraph with an optional written order*, the edits an author or a
 * learner makes to one, the checks that run after every edit, and the three candidate ways to
 * put it on disk. Pure: no DOM, no React, no host. The page calls in; nothing calls out.
 */
import type { WorkspaceGraph } from '../workspace/index';

export type RouteOwner = 'workspace' | 'personal';

export type Route = {
  readonly id: string;
  readonly owner: RouteOwner;
  readonly label: string;
  readonly description: string;
  readonly known: readonly string[];
  readonly targets: readonly string[];
  /** The subgraph. As a set when `order` is null; the display order is then computed. */
  readonly derivationIds: readonly string[];
  /** Written order, or null for "use the executable order the route view computes". */
  readonly order: readonly string[] | null;
  /** Personal routes only: the workspace route this one was copied from. A copy, not a link. */
  readonly basedOn?: string;
};

// ---------------------------------------------------------------------------------------
// Reading a route against the graph

export type RouteIssue =
  | { readonly kind: 'dangling-concept'; readonly severity: 'error'; readonly conceptId: string; readonly field: 'known' | 'targets' }
  | { readonly kind: 'dangling-derivation'; readonly severity: 'error'; readonly derivationId: string }
  /** A target the closure never reaches. `missing` is the frontier: concepts nothing in the route produces. */
  | { readonly kind: 'target-unreached'; readonly severity: 'error'; readonly targetId: string; readonly missing: readonly Missing[] }
  /** Written order only: this step leans on a concept not in hand yet. */
  | { readonly kind: 'order-not-executable'; readonly severity: 'error'; readonly derivationId: string; readonly position: number; readonly needs: readonly NeedLater[] }
  /** The derivation's premises never all become available, in any order. */
  | { readonly kind: 'never-fires'; readonly severity: 'warning'; readonly derivationId: string; readonly missing: readonly string[] }
  /** It fires but no target leans on it. Legal (a detour an author wants), flagged. */
  | { readonly kind: 'idle'; readonly severity: 'warning'; readonly derivationId: string }
  /** Two steps conclude the same concept; the later one teaches something already in hand. */
  | { readonly kind: 'duplicate-head'; readonly severity: 'warning'; readonly derivationId: string; readonly conceptId: string; readonly first: string };

export type Missing = {
  readonly conceptId: string;
  /** Who wanted it: a step of the route, or the target itself. */
  readonly wantedBy: string;
  /** Derivations in the graph that conclude it: what "补上" would add. */
  readonly candidates: readonly string[];
};

export type NeedLater = {
  readonly conceptId: string;
  /** 1-based position of the step that produces it later, or null when nothing in the route does. */
  readonly producedAt: number | null;
};

export type RouteReading = {
  /** The order the route is shown in: the written one, or the computed executable one. */
  readonly order: readonly string[];
  readonly orderSource: 'written' | 'computed';
  readonly conceptIds: readonly string[];
  readonly cost: number;
  readonly issues: readonly RouteIssue[];
  /** Steps that cannot fire only because another step of the route cannot. */
  readonly blocked: number;
  readonly errors: number;
  readonly warnings: number;
};

const byId = (graph: WorkspaceGraph) => new Map(graph.hyperedges.map((edge) => [edge.id, edge]));

/** The executable order, computed the way the route view does: fire whatever can fire, in list order. */
export function executableOrder(graph: WorkspaceGraph, known: readonly string[], derivationIds: readonly string[]) {
  const edges = byId(graph);
  const have = new Set(known);
  const pending = derivationIds.filter((id) => edges.has(id));
  const order: string[] = [];
  for (let progress = true; progress;) {
    progress = false;
    for (const id of [...pending]) {
      const edge = edges.get(id)!;
      if (!edge.tails.every((tail) => have.has(tail))) continue;
      order.push(id);
      have.add(edge.head);
      pending.splice(pending.indexOf(id), 1);
      progress = true;
    }
  }
  return { order, unfired: pending, closure: have };
}

export function readRoute(graph: WorkspaceGraph, route: Route): RouteReading {
  const edges = byId(graph);
  const concepts = new Set(graph.points.map((point) => point.id));
  const issues: RouteIssue[] = [];

  for (const field of ['known', 'targets'] as const) {
    for (const conceptId of route[field]) {
      if (!concepts.has(conceptId)) issues.push({ kind: 'dangling-concept', severity: 'error', conceptId, field });
    }
  }
  for (const derivationId of route.derivationIds) {
    if (!edges.has(derivationId)) issues.push({ kind: 'dangling-derivation', severity: 'error', derivationId });
  }

  const { order: computed, unfired, closure } = executableOrder(graph, route.known, route.derivationIds);

  // Frontier of an unreached target: walk down through route derivations that would produce
  // what is missing, stop at concepts nothing in the route produces.
  const producers = new Map<string, string>();
  for (const id of route.derivationIds) {
    const edge = edges.get(id);
    if (edge && !producers.has(edge.head)) producers.set(edge.head, id);
  }
  for (const targetId of route.targets) {
    if (closure.has(targetId) || !concepts.has(targetId)) continue;
    const missing: Missing[] = [];
    const seen = new Set<string>();
    const visit = (conceptId: string, wantedBy: string) => {
      if (closure.has(conceptId) || seen.has(conceptId)) return;
      seen.add(conceptId);
      const producer = producers.get(conceptId);
      if (producer) {
        for (const tail of edges.get(producer)!.tails) visit(tail, producer);
        return;
      }
      missing.push({
        conceptId, wantedBy,
        candidates: graph.hyperedges.filter((edge) => edge.head === conceptId).map((edge) => edge.id),
      });
    };
    visit(targetId, targetId);
    issues.push({ kind: 'target-unreached', severity: 'error', targetId, missing });
  }

  // Only root causes: a step that cannot fire because an *earlier* step cannot fire is a
  // consequence, counted in `blocked` rather than reported one by one.
  const routeHeads = new Set(route.derivationIds.map((id) => edges.get(id)?.head).filter(Boolean));
  let blocked = 0;
  for (const derivationId of unfired) {
    const edge = edges.get(derivationId)!;
    const missing = edge.tails.filter((tail) => !closure.has(tail));
    if (missing.every((tail) => routeHeads.has(tail))) { blocked += 1; continue; }
    issues.push({ kind: 'never-fires', severity: 'warning', derivationId, missing });
  }

  const written = route.order !== null;
  const order = written ? route.order!.filter((id) => edges.has(id)) : computed;
  if (written) {
    const have = new Set(route.known);
    const headAt = new Map<string, number>();
    order.forEach((id, index) => { const head = edges.get(id)!.head; if (!headAt.has(head)) headAt.set(head, index + 1); });
    order.forEach((id, index) => {
      const edge = edges.get(id)!;
      const needs = edge.tails.filter((tail) => !have.has(tail));
      if (needs.length && !unfired.includes(id)) {
        issues.push({
          kind: 'order-not-executable', severity: 'error', derivationId: id, position: index + 1,
          needs: needs.map((conceptId) => ({ conceptId, producedAt: headAt.get(conceptId) ?? null })),
        });
      }
      have.add(edge.head);
    });
  }

  // Idle: fires, but walking back from the targets never reaches it.
  const wanted = new Set(route.targets);
  const used = new Set<string>();
  for (const id of [...order].reverse()) {
    const edge = edges.get(id);
    if (!edge || !wanted.has(edge.head) || used.has(id)) continue;
    used.add(id);
    wanted.delete(edge.head);
    for (const tail of edge.tails) if (!route.known.includes(tail)) wanted.add(tail);
  }
  const firstHead = new Map<string, string>();
  for (const id of order) {
    const edge = edges.get(id)!;
    const first = firstHead.get(edge.head);
    if (first) issues.push({ kind: 'duplicate-head', severity: 'warning', derivationId: id, conceptId: edge.head, first });
    else firstHead.set(edge.head, id);
    const unreached = issues.some((issue) => issue.kind === 'target-unreached');
    if (!first && !unreached && !used.has(id) && !unfired.includes(id)) issues.push({ kind: 'idle', severity: 'warning', derivationId: id });
  }

  const conceptIds = [...new Set([...route.known, ...order.flatMap((id) => [...edges.get(id)!.tails, edges.get(id)!.head])])];
  const cost = order.reduce((total, id) => total + edges.get(id)!.weight, 0);
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return { order, orderSource: written ? 'written' : 'computed', conceptIds, cost, issues, blocked, errors, warnings: issues.length - errors };
}

// ---------------------------------------------------------------------------------------
// Edits. Each returns a new route; none of them refuses — refusing is what saving does.

/** Derivations in the graph that conclude the same concept as this one. */
export function parallelsOf(graph: WorkspaceGraph, derivationId: string): readonly string[] {
  const head = graph.hyperedges.find((edge) => edge.id === derivationId)?.head;
  return graph.hyperedges.filter((edge) => edge.head === head && edge.id !== derivationId).map((edge) => edge.id);
}

const replaceIn = (ids: readonly string[], from: string, to: string) => ids.map((id) => id === from ? to : id);

export function swapDerivation(route: Route, from: string, to: string): Route {
  return {
    ...route,
    derivationIds: replaceIn(route.derivationIds, from, to),
    order: route.order && replaceIn(route.order, from, to),
  };
}

export function removeDerivation(route: Route, derivationId: string): Route {
  return {
    ...route,
    derivationIds: route.derivationIds.filter((id) => id !== derivationId),
    order: route.order && route.order.filter((id) => id !== derivationId),
  };
}

/**
 * Adding into a written order lands at the earliest position where its premises are in hand,
 * so "补上缺的那条" does not itself create an order error.
 */
export function addDerivation(graph: WorkspaceGraph, route: Route, derivationId: string): Route {
  if (route.derivationIds.includes(derivationId)) return route;
  const derivationIds = [...route.derivationIds, derivationId];
  if (!route.order) return { ...route, derivationIds };
  const edges = byId(graph);
  const tails = edges.get(derivationId)?.tails ?? [];
  const have = new Set(route.known);
  let at = 0;
  while (at < route.order.length && !tails.every((tail) => have.has(tail))) {
    const head = edges.get(route.order[at])?.head;
    if (head) have.add(head);
    at += 1;
  }
  const order = [...route.order];
  order.splice(at, 0, derivationId);
  return { ...route, derivationIds, order };
}

/** Moving a step writes the order down. From then on the route carries `order`. */
export function moveStep(graph: WorkspaceGraph, route: Route, from: number, to: number): Route {
  const current = [...readRoute(graph, route).order];
  const [moved] = current.splice(from, 1);
  current.splice(Math.max(0, Math.min(to, current.length)), 0, moved);
  return { ...route, order: current };
}

/** Back to "use the computed executable order": `order` leaves the file. */
export function forgetOrder(route: Route): Route {
  return { ...route, order: null };
}

export function withTargets(route: Route, targets: readonly string[]): Route {
  return { ...route, targets };
}

export function withKnown(route: Route, known: readonly string[]): Route {
  return { ...route, known };
}

export function rename(route: Route, label: string, description: string): Route {
  return { ...route, label, description };
}

/** A learner's own copy of an author's route. It never follows later edits of the original. */
export function copyAsPersonal(route: Route, id: string): Route {
  return { ...route, id, owner: 'personal', label: `${route.label}（我的）`, basedOn: route.id };
}

// ---------------------------------------------------------------------------------------
// Three candidate disk layouts. Each returns every file this set of routes would be written to.

export type StoreKey = '1' | '2' | '3';

export type DiskFile = {
  readonly root: 'workspace' | 'appdata';
  readonly path: string;
  readonly json: unknown;
  /** Why this file looks the way it does, in one line — shown beside it. */
  readonly note?: string;
};

export const STORE_NAMES: Record<StoreKey, string> = {
  '1': '两处两协议 · 工作区每条一文件，个人沿用 routes.json',
  '2': '一协议两处 · 每条一文件，工作区与个人同形',
  '3': '两处各一文件 · 路线集，与 routes.json 对称',
};

/** A stand-in for `basis`: stable over the manifest entries the route names, nothing else. */
export function fakeBasis(graph: WorkspaceGraph, route: Route): string {
  const names = new Set([...route.known, ...route.targets, ...route.derivationIds]);
  const text = JSON.stringify([
    ...graph.points.filter((point) => names.has(point.id)),
    ...graph.hyperedges.filter((edge) => names.has(edge.id)),
  ]);
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b + text.charCodeAt(i), 2654435761); }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).repeat(4);
}

const APPDATA = 'learner-records/math-reforged';

export function layout(graph: WorkspaceGraph, routes: readonly Route[], store: StoreKey): readonly DiskFile[] {
  const workspace = routes.filter((route) => route.owner === 'workspace');
  const personal = routes.filter((route) => route.owner === 'personal');
  const files: DiskFile[] = [];

  if (store === '1') {
    for (const route of workspace) {
      files.push({
        root: 'workspace', path: `.derivon/routes/${route.id}.json`,
        json: {
          schema: 'derivon.workspace-routes/v1', id: route.id, label: route.label, description: route.description,
          known: route.known, targets: route.targets, derivationIds: route.derivationIds,
          ...(route.order ? { order: route.order } : {}),
        },
        note: route.order ? '写了 order：derivationIds 与 order 是同一批 id 的两份' : '没写 order：显示时现算执行顺序',
      });
    }
    files.push({
      root: 'appdata', path: `${APPDATA}/routes.json`,
      json: {
        schema: 'derivon.routes/v1',
        routes: personal.map((route) => {
          const reading = readRoute(graph, route);
          return {
            id: route.id, description: route.label, targets: route.targets, known: route.known,
            basis: fakeBasis(graph, route), conceptIds: reading.conceptIds, derivationIds: route.derivationIds,
            order: reading.order, cost: reading.cost,
          };
        }),
      },
      note: 'routes/v1 必须有 order、cost、basis：个人路线只能落成「写死的顺序」；label 与 description 挤成一个字段；basedOn 无处可放',
    });
  }

  if (store === '2') {
    const doc = (route: Route) => ({
      schema: 'derivon.route/v1', id: route.id, label: route.label,
      ...(route.description ? { description: route.description } : {}),
      known: route.known, targets: route.targets,
      steps: route.order ?? route.derivationIds,
      ordered: route.order !== null,
      ...(route.basedOn ? { basedOn: route.basedOn } : {}),
      ...(route.owner === 'personal' ? { basis: fakeBasis(graph, route) } : {}),
    });
    for (const route of workspace) {
      files.push({ root: 'workspace', path: `.derivon/routes/${route.id}.json`, json: doc(route),
        note: route.order ? 'ordered: true —— steps 就是顺序' : 'ordered: false —— steps 是集合，显示时现算顺序' });
    }
    for (const route of personal) {
      files.push({ root: 'appdata', path: `${APPDATA}/routes/${route.id}.json`, json: doc(route),
        note: '与工作区路线同一协议；多一个 basis（学习者记录的失效规则）。「另存为我的」= 复制文件' });
    }
  }

  if (store === '3') {
    const record = (route: Route) => ({
      id: route.id, label: route.label, description: route.description,
      known: route.known, targets: route.targets, derivationIds: route.derivationIds,
      ...(route.order ? { order: route.order } : {}),
      ...(route.basedOn ? { basedOn: route.basedOn } : {}),
    });
    files.push({ root: 'workspace', path: '.derivon/routes.json',
      json: { schema: 'derivon.workspace-routes/v1', routes: workspace.map(record) },
      note: '一个文件装全部：与 orientation.json 同级；两位作者同时改两条路线会在同一文件冲突' });
    files.push({ root: 'appdata', path: `${APPDATA}/routes.json`,
      json: { schema: 'derivon.routes/v1', routes: personal.map((route) => ({ ...record(route), basis: fakeBasis(graph, route) })) },
      note: 'routes/v1 放宽成与工作区同形（order 可选、去掉 cost 与 conceptIds）——等于改一个已落地的协议' });
  }
  return files;
}

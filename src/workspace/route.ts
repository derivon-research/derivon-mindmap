/**
 * `derivon.route/v1`: one route per file, specified in [routes](../../docs/routes.md). A route
 * is a derivation subgraph of the manifest plus an optional written order; it names objects
 * by id, copies no `data`, and carries no completion marker. The same protocol lives in two
 * locations — a workspace route under `.derivon/routes/`, a personal route in the learner
 * records — and the location alone decides whether `basis` and `basedOn` may appear.
 *
 * This module owns both layers of reading a route: decoding a file (unreadable or a route),
 * and validating a route against a graph (display order, concepts, cost, diagnostics, gaps).
 * It also owns the canonical text and every edit made to a route. It is pure: nothing here
 * reads a host, and no edit ever refuses — refusing is what saving does.
 */
import { isValidWeight, type DerivationHyperedge, type ManifestGraph } from './manifest';

export const ROUTE_SCHEMA = 'derivon.route/v1' as const;

/** The companion directory workspace routes live in, one file per route. */
export const WORKSPACE_ROUTES_DIRECTORY = '.derivon/routes';

/** Where a route file lives. It decides whether `basis` and `basedOn` are allowed. */
export type RouteLocation = 'workspace' | 'personal';

/**
 * A route as it is decoded, edited and written. `steps` are derivation ids; when `ordered` is
 * false they are a set and the display order is computed, when true their order is the
 * route's. `basis` and `basedOn` are carried wherever they were decoded; whether they are
 * allowed is validation.
 */
export type Route = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly known: readonly string[];
  readonly targets: readonly string[];
  readonly steps: readonly string[];
  readonly ordered: boolean;
  /** Personal routes only: the workspace route this one was copied from. Provenance, not a link. */
  readonly basedOn?: string;
  /** Personal routes only, and required there: the content basis at save time. */
  readonly basis?: string;
};

// ------------------------------------------------------------------ ids and paths

/** `r-` plus six characters of the object-id alphabet (`0 1 i l o u` removed). */
const ROUTE_ID_PATTERN = /^r-[23456789abcdefghjkmnpqrstvwxyz]{6}$/;

/** `basis` is a SHA-256 stream rendered as lowercase hexadecimal; see `docs/learner-records.md`. */
const BASIS_PATTERN = /^[0-9a-f]{64}$/;

export function isRouteId(value: unknown): value is string {
  return typeof value === 'string' && ROUTE_ID_PATTERN.test(value);
}

/** `<id>.json`, the file name of a route in either location. */
export function routeFileName(id: string): string {
  return `${id}.json`;
}

/**
 * Whether a direct child of a routes directory is a route file: its name ends in `.json`.
 * Any other name, such as a temporary file a crashed replacement left behind, is inert.
 */
export function isRouteFileName(name: string): boolean {
  return name.endsWith('.json');
}

/** The workspace-relative path of a workspace route. */
export function workspaceRoutePath(id: string): string {
  return `${WORKSPACE_ROUTES_DIRECTORY}/${routeFileName(id)}`;
}

// ------------------------------------------------------------------ layer one: the file

export type RouteFileIssueCode = 'unreadable' | 'wrong-schema' | 'unknown-key' | 'missing-field' | 'invalid-field';

/** Why a file is unreadable. `key` is the top-level key it is about, when there is one. */
export type RouteFileIssue = {
  readonly code: RouteFileIssueCode;
  readonly key?: string;
  readonly message: string;
};

/** A decoded file: a route, or the reasons it is unreadable. Never both. */
export type RouteDecoding =
  | { readonly route: Route; readonly issues: readonly [] }
  | { readonly route: null; readonly issues: readonly RouteFileIssue[] };

const KEYS = ['schema', 'id', 'label', 'description', 'known', 'targets', 'steps', 'ordered', 'basedOn', 'basis'] as const;
const REQUIRED = ['id', 'label', 'known', 'targets', 'steps', 'ordered'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** What each present key must be, as a check and the words for its failure. */
const FORMS: Record<Exclude<(typeof KEYS)[number], 'schema'>, readonly [(value: unknown) => boolean, string]> = {
  id: [isRouteId, '必须是 r- 加六位对象 id 字母表字符'],
  label: [(value) => typeof value === 'string', '必须是字符串'],
  description: [(value) => typeof value === 'string', '必须是字符串'],
  known: [isStringList, '必须是字符串数组'],
  targets: [isStringList, '必须是字符串数组'],
  steps: [isStringList, '必须是字符串数组'],
  ordered: [(value) => typeof value === 'boolean', '必须是 true 或 false'],
  basedOn: [isRouteId, '必须是一条路线的 id'],
  basis: [(value) => typeof value === 'string' && BASIS_PATTERN.test(value), '必须是 64 位小写十六进制的内容版本哈希'],
};

function fileIssues(value: unknown): RouteFileIssue[] {
  if (!isRecord(value)) return [{ code: 'unreadable', message: '路线文件必须是 JSON 对象' }];
  const issues: RouteFileIssue[] = [];
  if (value.schema !== ROUTE_SCHEMA) issues.push({ code: 'wrong-schema', key: 'schema', message: `schema 必须为 ${ROUTE_SCHEMA}` });
  for (const key of Object.keys(value)) {
    if (!(KEYS as readonly string[]).includes(key)) issues.push({ code: 'unknown-key', key, message: `${key} 不是这个协议定义的键` });
  }
  for (const key of REQUIRED) {
    if (value[key] === undefined) issues.push({ code: 'missing-field', key, message: `缺少 ${key}` });
  }
  for (const [key, [valid, message]] of Object.entries(FORMS)) {
    if (value[key] !== undefined && !valid(value[key])) issues.push({ code: 'invalid-field', key, message: `${key} ${message}` });
  }
  return issues;
}

/**
 * Layer one: decode route file text. Every condition that makes it unreadable is reported,
 * not only the first. A caller that cannot even get the text reports `unreadable` itself.
 */
export function decodeRoute(text: string): RouteDecoding {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { route: null, issues: [{ code: 'unreadable', message: '路线文件不是合法 JSON' }] };
  }
  const issues = fileIssues(value);
  if (issues.length) return { route: null, issues };
  const file = value as Record<string, unknown>;
  return {
    route: {
      id: file.id as string,
      label: file.label as string,
      ...(typeof file.description === 'string' ? { description: file.description } : {}),
      known: [...file.known as string[]],
      targets: [...file.targets as string[]],
      steps: [...file.steps as string[]],
      ordered: file.ordered as boolean,
      ...(typeof file.basedOn === 'string' ? { basedOn: file.basedOn } : {}),
      ...(typeof file.basis === 'string' ? { basis: file.basis } : {}),
    },
    issues: [],
  };
}

/**
 * Canonical text of `route` stored at `location`: two-space JSON, keys in protocol order, an
 * empty `description` left out. This is the write guard: it throws for a route that would
 * decode as unreadable or that carries a shape error at `location`. Graph errors need the
 * graph and are the caller's to refuse, from `readRoute(...).errors`.
 */
export function serializeRoute(route: Route, location: RouteLocation): string {
  const encoded = {
    schema: ROUTE_SCHEMA,
    id: route.id,
    label: route.label,
    ...(route.description ? { description: route.description } : {}),
    known: [...route.known],
    targets: [...route.targets],
    steps: [...route.steps],
    ordered: route.ordered,
    ...(route.basedOn === undefined ? {} : { basedOn: route.basedOn }),
    ...(route.basis === undefined ? {} : { basis: route.basis }),
  };
  const refusals = [
    ...fileIssues(encoded).map((issue) => issue.message),
    ...shapeDiagnostics(route, { location }).map((diagnostic) => diagnostic.message),
  ];
  if (refusals.length) throw new Error(refusals.slice(0, 4).join('\n'));
  return `${JSON.stringify(encoded, null, 2)}\n`;
}

// ------------------------------------------------------------------ layer two: the route on a graph

/** Where a route being validated lies. Omit it for a draft being edited. */
export type RoutePlace = {
  readonly location: RouteLocation;
  /** The file name it was read from, for a route read from a file. */
  readonly fileName?: string;
};

/** A concept nothing in the route concludes, on the way down from an unreached target. */
export type RouteGap = {
  readonly conceptId: string;
  /** The step that needs it, or the target's own id when nothing in the route concludes the target. */
  readonly wantedBy: string;
  /** Every derivation in the graph that concludes it, in manifest order: what "补上" offers. */
  readonly candidates: readonly string[];
};

export type RouteLateNeed = {
  readonly conceptId: string;
  /** 1-based display position of the first step that concludes it, or null when no step does. */
  readonly producedAt: number | null;
};

type Diagnostic<Severity, Code, Subject = unknown> = {
  readonly severity: Severity;
  readonly code: Code;
  /** A sentence for the reader, naming steps by position and concepts by label. Not protocol. */
  readonly message: string;
} & Subject;

/** A step subject: the derivation and its 1-based position in the display order. */
type Step = { readonly derivationId: string; readonly position: number };

export type RouteDiagnostic =
  | Diagnostic<'error', 'id-mismatch', { readonly key: 'id' }>
  | Diagnostic<'error', 'empty-label', { readonly key: 'label' }>
  | Diagnostic<'error', 'empty-targets', { readonly key: 'targets' }>
  | Diagnostic<'error', 'duplicate-step', { readonly derivationId: string }>
  | Diagnostic<'error', 'forbidden-field', { readonly key: 'basis' | 'basedOn' }>
  | Diagnostic<'error', 'missing-basis', { readonly key: 'basis' }>
  | Diagnostic<'error', 'dangling-concept', { readonly conceptId: string; readonly field: 'known' | 'targets' }>
  | Diagnostic<'error', 'dangling-derivation', { readonly derivationId: string }>
  | Diagnostic<'error', 'target-unreached', { readonly targetId: string; readonly gaps: readonly RouteGap[] }>
  | Diagnostic<'error', 'order-not-executable', Step & { readonly needs: readonly RouteLateNeed[] }>
  | Diagnostic<'warning', 'never-fires', Step & { readonly missing: readonly string[] }>
  | Diagnostic<'warning', 'idle', Step>
  | Diagnostic<'warning', 'duplicate-head', Step & {
    readonly conceptId: string; readonly earlierDerivationId: string; readonly earlierPosition: number;
  }>;

export type RouteDiagnosticCode = RouteDiagnostic['code'];

/** Layer two: what a route is when shown on a graph. */
export type RouteReading = {
  /** Written order, or the execution order followed by the unfired steps. Dangling and repeated entries are left out. */
  readonly order: readonly string[];
  readonly orderSource: 'written' | 'computed';
  /** `known` with every premise and conclusion of every step, restricted to the graph. */
  readonly conceptIds: readonly string[];
  /** Sum of every step's weight, fired or not, at one decimal place. */
  readonly cost: number;
  /** Errors first, then warnings; within each, subjects without a position first, then by position. */
  readonly diagnostics: readonly RouteDiagnostic[];
  /** Every gap of every unreached target, once per concept, in target order: the gap panel. */
  readonly gaps: readonly RouteGap[];
  /** Steps that never fire only because other steps of the route never fire: counted, not listed. */
  readonly blocked: number;
  readonly errors: number;
  readonly warnings: number;
};

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
}

const edgesById = (graph: ManifestGraph) => new Map(graph.hyperedges.map((edge) => [edge.id, edge]));

/** The errors a route has without looking at a graph. */
function shapeDiagnostics(route: Route, place?: RoutePlace): RouteDiagnostic[] {
  const found: RouteDiagnostic[] = [];
  if (place?.fileName !== undefined && place.fileName !== routeFileName(route.id)) {
    found.push({ severity: 'error', code: 'id-mismatch', key: 'id', message: `文件名 ${place.fileName} 与路线 id ${route.id} 不符。` });
  }
  if (!route.label.trim()) found.push({ severity: 'error', code: 'empty-label', key: 'label', message: '路线需要一个名字。' });
  if (!route.targets.length) found.push({ severity: 'error', code: 'empty-targets', key: 'targets', message: '路线至少要有一个目标。' });
  for (const derivationId of duplicates(route.steps)) {
    found.push({ severity: 'error', code: 'duplicate-step', derivationId, message: `推导「${derivationId}」在步骤里出现了不止一次。` });
  }
  if (place?.location === 'workspace') {
    for (const key of ['basis', 'basedOn'] as const) {
      if (route[key] !== undefined) found.push({ severity: 'error', code: 'forbidden-field', key, message: `工作区路线不带 ${key}。` });
    }
  }
  if (place?.location === 'personal' && route.basis === undefined) {
    found.push({ severity: 'error', code: 'missing-basis', key: 'basis', message: '个人路线必须带 basis。' });
  }
  return found;
}

/**
 * The execution order the route view uses: go through `steps` in list order, repeatedly
 * firing every step whose premises are all in hand, until a pass fires nothing. `unfired` are
 * the steps that never fire, in list order; `closure` is everything the route reaches.
 * Dangling and repeated entries of `steps` take no part.
 */
export function executableOrder(graph: ManifestGraph, known: readonly string[], steps: readonly string[]): {
  readonly order: readonly string[];
  readonly unfired: readonly string[];
  readonly closure: ReadonlySet<string>;
} {
  const edges = edgesById(graph);
  const closure = new Set(known);
  let pending = [...new Set(steps)].filter((id) => edges.has(id));
  const order: string[] = [];
  for (let fired = true; fired;) {
    fired = false;
    const waiting: string[] = [];
    for (const id of pending) {
      const edge = edges.get(id)!;
      if (edge.tails.every((tail) => closure.has(tail))) {
        order.push(id);
        closure.add(edge.head);
        fired = true;
      } else {
        waiting.push(id);
      }
    }
    pending = waiting;
  }
  return { order, unfired: pending, closure };
}

/**
 * Layer two: validate `route` against `graph`. Errors keep a route out of the valid state and
 * from being saved; warnings never do. Pass `place` for a route that lies somewhere — it adds
 * the location's field rules and, with a file name, `id-mismatch`. Omit it for a draft being
 * edited: a personal route gets its `basis` from the writer just before it is written.
 */
export function readRoute(graph: ManifestGraph, route: Route, place?: RoutePlace): RouteReading {
  const edges = edgesById(graph);
  const labels = new Map(graph.points.map((point) => [point.id, point.data.label]));
  const name = (conceptId: string) => `「${labels.get(conceptId) ?? conceptId}」`;
  const diagnostics = shapeDiagnostics(route, place);

  for (const field of ['known', 'targets'] as const) {
    for (const conceptId of new Set(route[field])) {
      if (labels.has(conceptId)) continue;
      diagnostics.push({
        severity: 'error', code: 'dangling-concept', conceptId, field,
        message: `${field === 'known' ? '已知' : '目标'}引用了图里没有的概念「${conceptId}」。`,
      });
    }
  }
  const unique = [...new Set(route.steps)];
  for (const derivationId of unique) {
    if (!edges.has(derivationId)) {
      diagnostics.push({ severity: 'error', code: 'dangling-derivation', derivationId, message: `步骤引用了图里没有的推导「${derivationId}」。` });
    }
  }
  const steps = unique.filter((id) => edges.has(id));
  const edge = (id: string) => edges.get(id)!;

  const { order: fired, unfired, closure } = executableOrder(graph, route.known, steps);
  const unfiredSet = new Set(unfired);
  const order = route.ordered ? steps : [...fired, ...unfired];
  const positionOf = new Map(order.map((id, index) => [id, index + 1]));
  const stepName = (id: string) => `第 ${positionOf.get(id)} 步${name(edge(id).head)}`;
  const firstConcluding = (ids: readonly string[]) => {
    const first = new Map<string, string>();
    for (const id of ids) if (!first.has(edge(id).head)) first.set(edge(id).head, id);
    return first;
  };

  // Gaps: walk down from an unreached target through each concept's producer (the first step
  // in list order concluding it) and stop at a concept no step concludes.
  const producer = firstConcluding(steps);
  const gaps = new Map<string, RouteGap>();
  for (const targetId of new Set(route.targets)) {
    if (closure.has(targetId) || !labels.has(targetId)) continue;
    const found: RouteGap[] = [];
    const visited = new Set<string>();
    const visit = (conceptId: string, wantedBy: string) => {
      if (closure.has(conceptId) || visited.has(conceptId)) return;
      visited.add(conceptId);
      const through = producer.get(conceptId);
      if (through) {
        for (const tail of edge(through).tails) visit(tail, through);
        return;
      }
      found.push({
        conceptId, wantedBy,
        candidates: graph.hyperedges.filter((item) => item.head === conceptId).map((item) => item.id),
      });
    };
    visit(targetId, targetId);
    for (const gap of found) if (!gaps.has(gap.conceptId)) gaps.set(gap.conceptId, gap);
    diagnostics.push({
      severity: 'error', code: 'target-unreached', targetId, gaps: found,
      message: `目标${name(targetId)}到不了${found.length ? `：缺${found.map((gap) => name(gap.conceptId)).join('')}` : ''}。`,
    });
  }

  // Display-order producers: where a concept first arrives, for positions and for idle.
  const first = firstConcluding(order);

  if (route.ordered) {
    const have = new Set(route.known);
    for (const id of order) {
      const missing = edge(id).tails.filter((tail) => !have.has(tail));
      have.add(edge(id).head);
      if (!missing.length || unfiredSet.has(id)) continue;
      const needs = missing.map((conceptId) => ({
        conceptId, producedAt: first.has(conceptId) ? positionOf.get(first.get(conceptId)!)! : null,
      }));
      diagnostics.push({
        severity: 'error', code: 'order-not-executable', derivationId: id, position: positionOf.get(id)!, needs,
        message: `${stepName(id)}要用${needs.map((need) => `${name(need.conceptId)}，${
          need.producedAt === null ? '路线里没有哪一步得到它' : `它在第 ${need.producedAt} 步才得到`}`).join('；')}。`,
      });
    }
  }

  // Root causes only: a step whose every missing premise some step concludes is blocked.
  const heads = new Set(steps.map((id) => edge(id).head));
  let blocked = 0;
  for (const id of unfired) {
    const missing = edge(id).tails.filter((tail) => !closure.has(tail));
    if (missing.every((tail) => heads.has(tail))) {
      blocked += 1;
      continue;
    }
    diagnostics.push({
      severity: 'warning', code: 'never-fires', derivationId: id, position: positionOf.get(id)!, missing,
      message: `${stepName(id)}的前提${missing.filter((tail) => !heads.has(tail)).map(name).join('')}永远拿不到。`,
    });
  }

  const duplicateHeads = new Set<string>();
  for (const id of order) {
    const earlier = first.get(edge(id).head)!;
    if (earlier === id) continue;
    duplicateHeads.add(id);
    diagnostics.push({
      severity: 'warning', code: 'duplicate-head', derivationId: id, position: positionOf.get(id)!,
      conceptId: edge(id).head, earlierDerivationId: earlier, earlierPosition: positionOf.get(earlier)!,
      message: `${stepName(id)}在第 ${positionOf.get(earlier)} 步已经得到过。`,
    });
  }

  // Needed steps, walked back from the targets through each concept's first step in display order.
  if (route.targets.every((targetId) => closure.has(targetId))) {
    const known = new Set(route.known);
    const needed = new Set<string>();
    const wanted = route.targets.filter((targetId) => !known.has(targetId));
    while (wanted.length) {
      const through = first.get(wanted.pop()!);
      if (!through || needed.has(through)) continue;
      needed.add(through);
      wanted.push(...edge(through).tails.filter((tail) => !known.has(tail)));
    }
    for (const id of order) {
      if (unfiredSet.has(id) || needed.has(id) || duplicateHeads.has(id)) continue;
      diagnostics.push({
        severity: 'warning', code: 'idle', derivationId: id, position: positionOf.get(id)!,
        message: `${stepName(id)}不通往任何目标。`,
      });
    }
  }

  const concepts = new Set(route.known.filter((id) => labels.has(id)));
  for (const id of order) for (const conceptId of [...edge(id).tails, edge(id).head]) if (labels.has(conceptId)) concepts.add(conceptId);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  return {
    order,
    orderSource: route.ordered ? 'written' : 'computed',
    conceptIds: [...concepts],
    cost: sumWeights(order.map(edge)),
    diagnostics: diagnostics.sort(bySeverityThenPosition),
    gaps: [...gaps.values()],
    blocked,
    errors,
    warnings: diagnostics.length - errors,
  };
}

/** Weights carry at most one decimal; summing floats must not invent more. */
function sumWeights(edges: readonly DerivationHyperedge[]): number {
  const total = edges.reduce((sum, edge) => sum + edge.weight, 0);
  const rounded = Math.round(total * 10) / 10;
  return isValidWeight(rounded) ? rounded : total;
}

function bySeverityThenPosition(left: RouteDiagnostic, right: RouteDiagnostic): number {
  const severity = (diagnostic: RouteDiagnostic) => (diagnostic.severity === 'error' ? 0 : 1);
  const position = (diagnostic: RouteDiagnostic) => ('position' in diagnostic ? diagnostic.position : 0);
  return severity(left) - severity(right) || position(left) - position(right);
}

/**
 * The objects whose manifest entries a personal route's `basis` covers: every concept in
 * `known` and `targets`, every derivation in `steps`, and every premise and conclusion of the
 * steps the graph has. Ids the graph lacks are included; they contribute nothing to a basis.
 */
export function routeObjectIds(graph: ManifestGraph, route: Route): readonly string[] {
  const edges = edgesById(graph);
  const ids = new Set([...route.known, ...route.targets, ...route.steps]);
  for (const id of route.steps) {
    const edge = edges.get(id);
    if (edge) for (const conceptId of [...edge.tails, edge.head]) ids.add(conceptId);
  }
  return [...ids];
}

// ------------------------------------------------------------------ edits

/** A new route with nothing in it yet: no solver draft, computed order. */
export function newRoute(id: string, fields: Pick<Route, 'label' | 'known' | 'targets'> & { readonly description?: string }): Route {
  return {
    id, label: fields.label,
    ...(fields.description ? { description: fields.description } : {}),
    known: [...fields.known], targets: [...fields.targets], steps: [], ordered: false,
  };
}

/**
 * "按目标与已知重新求初稿": the solver's derivations become the steps, in the order it gave,
 * and the order goes back to computed. Every earlier step edit is dropped.
 */
export function draftFromSolution(route: Route, solution: { readonly order: readonly string[]; readonly derivationIds: readonly string[] }): Route {
  const steps = [...new Set([...solution.order, ...solution.derivationIds])];
  return { ...route, steps, ordered: false };
}

/** Other derivations in the graph that conclude what `derivationId` concludes. */
export function parallelDerivations(graph: ManifestGraph, derivationId: string): readonly string[] {
  const head = graph.hyperedges.find((edge) => edge.id === derivationId)?.head;
  if (head === undefined) return [];
  return graph.hyperedges.filter((edge) => edge.head === head && edge.id !== derivationId).map((edge) => edge.id);
}

/** Put `to` where `from` was; the order is kept. If `to` is already a step, `from` just goes. */
export function swapStep(route: Route, from: string, to: string): Route {
  if (from === to || !route.steps.includes(from)) return route;
  const steps = route.steps.includes(to)
    ? route.steps.filter((id) => id !== from)
    : route.steps.map((id) => (id === from ? to : id));
  return { ...route, steps };
}

export function removeStep(route: Route, derivationId: string): Route {
  return { ...route, steps: route.steps.filter((id) => id !== derivationId) };
}

/**
 * Add a derivation. A computed order just gains a member; a written order gets it at the
 * earliest position where its premises are in hand, so "补上" never creates an order error
 * itself. A derivation already in the route leaves it unchanged.
 */
export function addStep(graph: ManifestGraph, route: Route, derivationId: string): Route {
  if (route.steps.includes(derivationId)) return route;
  if (!route.ordered) return { ...route, steps: [...route.steps, derivationId] };
  const edges = edgesById(graph);
  const tails = edges.get(derivationId)?.tails ?? [];
  const have = new Set(route.known);
  let at = 0;
  while (at < route.steps.length && !tails.every((tail) => have.has(tail))) {
    const head = edges.get(route.steps[at])?.head;
    if (head !== undefined) have.add(head);
    at += 1;
  }
  return { ...route, steps: [...route.steps.slice(0, at), derivationId, ...route.steps.slice(at)] };
}

/**
 * Move a step to `toIndex` (0-based) of the display order. Moving writes the order down:
 * `steps` becomes the current display order with the step moved, and `ordered` becomes true.
 */
export function moveStep(graph: ManifestGraph, route: Route, derivationId: string, toIndex: number): Route {
  const steps = [...readRoute(graph, route).order];
  const from = steps.indexOf(derivationId);
  if (from < 0) return route;
  steps.splice(from, 1);
  steps.splice(Math.max(0, Math.min(toIndex, steps.length)), 0, derivationId);
  return { ...route, steps, ordered: true };
}

/** "改回现算": the steps become a set again and the display order is computed. */
export function useComputedOrder(route: Route): Route {
  return { ...route, ordered: false };
}

/**
 * "另存为我的": a learner's copy of a route under a new id. It records where it came from
 * and never follows later edits of the original. `basis` is computed when it is saved.
 */
export function copyAsPersonal(route: Route, id: string): Route {
  const copy: { -readonly [Key in keyof Route]: Route[Key] } = { ...route, id, basedOn: route.id };
  delete copy.basis;
  return copy;
}

export type StepCandidate = {
  readonly derivationId: string;
  /** Its premises are all in the route's reach now, so adding it would fire. */
  readonly ready: boolean;
};

/**
 * Derivations to offer in the add-step search: those not in the route whose conclusion's
 * label or id matches `query`, ready ones first, then exact → prefix → contained, then graph
 * order. A blank query offers nothing.
 */
export function stepCandidates(graph: ManifestGraph, route: Route, query: string, limit = 20): readonly StepCandidate[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const labels = new Map(graph.points.map((point) => [point.id, point.data.label.toLowerCase()]));
  const rank = (conceptId: string) => {
    const texts = [labels.get(conceptId) ?? '', conceptId.toLowerCase()];
    if (texts.some((text) => text === term)) return 0;
    if (texts.some((text) => text.startsWith(term))) return 1;
    if (texts.some((text) => text.includes(term))) return 2;
    return Number.POSITIVE_INFINITY;
  };
  const { closure } = executableOrder(graph, route.known, route.steps);
  const inRoute = new Set(route.steps);
  return graph.hyperedges
    .map((edge, index) => ({ edge, index, rank: rank(edge.head), ready: edge.tails.every((tail) => closure.has(tail)) }))
    .filter((entry) => !inRoute.has(entry.edge.id) && Number.isFinite(entry.rank))
    .sort((left, right) => Number(right.ready) - Number(left.ready) || left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map((entry) => ({ derivationId: entry.edge.id, ready: entry.ready }));
}

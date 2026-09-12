/**
 * The two learner-record protocols, `derivon.learning/v1` (`state.json`) and
 * `derivon.routes/v1` (`routes.json`). They are not workspace content and do not live in
 * `src/workspace/`: they persist in the application data directory, keyed by the workspace
 * `id`. The normative text is [learner records](../../docs/learner-records.md); this module
 * owns the shape, the canonical text, and what counts as an unreadable record.
 *
 * Both are read the same way: a `schema` string that is not the file's own is an unreadable
 * file, and a key the protocol does not define — at the top level, inside a record, or inside
 * a route — is reported rather than ignored. A serializer refuses its own invalid input, so a
 * writer can never produce an artifact this module's validator rejects.
 */
import { isValidWeight } from '../workspace/index';

export const LEARNING_SCHEMA = 'derivon.learning/v1' as const;
export const ROUTES_SCHEMA = 'derivon.routes/v1' as const;

export type MasteryStatus = 'complete' | 'incomplete';

/**
 * One judgement about one object. `basis` is the content basis it was made against; `data`
 * is writer-namespaced free-form state. Absence of a record means *not assessed yet*, which
 * is deliberately not the same as an `incomplete` record — a reader never synthesizes one.
 */
export type MasteryRecord = {
  readonly status: MasteryStatus;
  readonly basis: string;
  readonly data?: Readonly<Record<string, unknown>>;
};

/** Concept mastery and derivation mastery are isomorphic: same fields, same rules. */
export type LearningState = {
  readonly concepts: Readonly<Record<string, MasteryRecord>>;
  readonly derivations: Readonly<Record<string, MasteryRecord>>;
};

/**
 * A confirmed solve: a reference-only subgraph of the manifest. It carries no completion
 * marker of any kind; `known` is the input snapshot of *that* solve, never the live known set.
 */
export type RouteRecord = {
  readonly id: string;
  readonly description: string;
  readonly targets: readonly string[];
  readonly known: readonly string[];
  readonly basis: string;
  readonly conceptIds: readonly string[];
  readonly derivationIds: readonly string[];
  readonly order: readonly string[];
  readonly cost: number;
};

export type RoutesState = {
  readonly routes: readonly RouteRecord[];
};

export type LearnerRecordIssue = {
  readonly path: string;
  readonly message: string;
};

/** `r-` plus six characters of the object-id alphabet (`0 1 i l o u` removed). */
const ROUTE_ID_PATTERN = /^r-[23456789abcdefghjkmnpqrstvwxyz]{6}$/;

/** `basis` is a SHA-256 stream rendered as lowercase hexadecimal; see `docs/learner-records.md`. */
const BASIS_PATTERN = /^[0-9a-f]{64}$/;

function isBasis(value: unknown): value is string {
  return typeof value === 'string' && BASIS_PATTERN.test(value);
}

export function isRouteId(value: unknown): value is string {
  return typeof value === 'string' && ROUTE_ID_PATTERN.test(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function reportUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, issues: LearnerRecordIssue[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: path ? `${path}.${key}` : key, message: '不是这个协议定义的键' });
  }
}

function readStringList(value: unknown, path: string, issues: LearnerRecordIssue[]): readonly string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: '必须是字符串数组' });
    return [];
  }
  return value.filter((item, index): item is string => {
    if (typeof item !== 'string' || !item.trim()) {
      issues.push({ path: `${path}[${index}]`, message: '必须是非空字符串' });
      return false;
    }
    return true;
  });
}

/** The one refusal every parser uses, so all four report the same way. */
function refuse(issues: readonly LearnerRecordIssue[]): never {
  throw new Error(issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}

// ------------------------------------------------------------------ learning state

function validateMasteryRecord(value: unknown, path: string, issues: LearnerRecordIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return;
  }
  reportUnknownKeys(value, new Set(['status', 'basis', 'data']), path, issues);
  if (value.status !== 'complete' && value.status !== 'incomplete') {
    issues.push({ path: `${path}.status`, message: '必须为 complete 或 incomplete' });
  }
  if (!isBasis(value.basis)) {
    issues.push({ path: `${path}.basis`, message: '必须是这条判定所依据的内容版本的 SHA-256 哈希（64 位小写十六进制）' });
  }
  const data = validateMasteryData(value.data, `${path}.data`, issues);
  // A judgement that the learner did not get there has to say something about how it was
  // reached. This is a shape constraint: any non-empty object passes.
  if (value.status === 'incomplete' && (data === null || Object.keys(data).length === 0)) {
    issues.push({ path: `${path}.data`, message: 'incomplete 的记录必须带非空 data' });
  }
}

/** `data` is free-form and namespaced by writer; only its shape is the protocol's business. */
function validateMasteryData(value: unknown, path: string, issues: LearnerRecordIssue[]): Record<string, unknown> | null {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return null;
  }
  return value;
}

function validateMasteryMap(value: unknown, key: string, path: string, issues: LearnerRecordIssue[]) {
  if (value === undefined) {
    issues.push({ path, message: `缺少 ${key}（没有记录时写成空对象）` });
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象，键为对象 id' });
    return;
  }
  for (const [id, record] of Object.entries(value)) {
    if (!id.trim()) issues.push({ path, message: '对象 id 不能为空' });
    validateMasteryRecord(record, `${path}.${id}`, issues);
  }
}

export function validateLearningState(value: unknown): readonly LearnerRecordIssue[] {
  const issues: LearnerRecordIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '必须是 JSON 对象' }];
  if (value.schema !== LEARNING_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${LEARNING_SCHEMA}` });
  reportUnknownKeys(value, new Set(['schema', 'concepts', 'derivations']), '', issues);
  validateMasteryMap(value.concepts, '概念掌握记录', 'concepts', issues);
  validateMasteryMap(value.derivations, '推导掌握记录', 'derivations', issues);
  return issues;
}

function decodeLearningState(value: Record<string, unknown>): LearningState {
  const map = (raw: unknown): Record<string, MasteryRecord> =>
    Object.fromEntries(Object.entries(isRecord(raw) ? raw : {}).map(([id, record]) => {
      const decoded = record as { status: MasteryStatus; basis: string; data?: Record<string, unknown> };
      return [id, {
        status: decoded.status,
        basis: decoded.basis,
        ...(decoded.data === undefined ? {} : { data: decoded.data }),
      }];
    }));
  return { concepts: map(value.concepts), derivations: map(value.derivations) };
}

export function parseLearningState(text: string): LearningState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('学习者记录不是合法 JSON');
  }
  const issues = validateLearningState(value);
  if (issues.length) refuse(issues);
  return decodeLearningState(value as Record<string, unknown>);
}

function encodeMasteryRecord(record: MasteryRecord): Record<string, unknown> {
  return { status: record.status, basis: record.basis, ...(record.data === undefined ? {} : { data: record.data }) };
}

function encodeMasteryMap(map: Readonly<Record<string, MasteryRecord>>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(map).map(([id, record]) => [id, encodeMasteryRecord(record)]));
}

/**
 * Canonical `state.json` text. Refuses a record the validator would reject, so the two write
 * paths cannot emit an artifact the reader refuses.
 */
export function serializeLearningState(state: LearningState): string {
  const encoded = {
    schema: LEARNING_SCHEMA,
    concepts: encodeMasteryMap(state.concepts),
    derivations: encodeMasteryMap(state.derivations),
  };
  const issues = validateLearningState(encoded);
  if (issues.length) refuse(issues);
  return `${JSON.stringify(encoded, null, 2)}\n`;
}

// ------------------------------------------------------------------ routes

function validateRoute(value: unknown, path: string, issues: LearnerRecordIssue[]) {
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return;
  }
  reportUnknownKeys(value, new Set([
    'id', 'description', 'targets', 'known', 'basis', 'conceptIds', 'derivationIds', 'order', 'cost',
  ]), path, issues);
  if (!isRouteId(value.id)) {
    issues.push({ path: `${path}.id`, message: '必须是 r- 加六位对象 id 字母表字符' });
  }
  if (typeof value.description !== 'string' || !value.description.trim()) {
    issues.push({ path: `${path}.description`, message: '需要非空字符串' });
  }
  readStringList(value.targets, `${path}.targets`, issues);
  readStringList(value.known, `${path}.known`, issues);
  if (!isBasis(value.basis)) {
    issues.push({ path: `${path}.basis`, message: '必须是这条路线所依据的内容版本的 SHA-256 哈希（64 位小写十六进制）' });
  }
  readStringList(value.conceptIds, `${path}.conceptIds`, issues);
  readStringList(value.derivationIds, `${path}.derivationIds`, issues);
  readStringList(value.order, `${path}.order`, issues);
  if (!isValidWeight(value.cost)) {
    issues.push({ path: `${path}.cost`, message: '必须是非负且最多保留一位小数的有限数值' });
  }
}

export function validateRoutesState(value: unknown): readonly LearnerRecordIssue[] {
  const issues: LearnerRecordIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '必须是 JSON 对象' }];
  if (value.schema !== ROUTES_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${ROUTES_SCHEMA}` });
  reportUnknownKeys(value, new Set(['schema', 'routes']), '', issues);
  if (value.routes === undefined) {
    issues.push({ path: 'routes', message: '缺少路线数组（没有确认过的路线时写成空数组）' });
    return issues;
  }
  if (!Array.isArray(value.routes)) {
    issues.push({ path: 'routes', message: '必须是数组' });
    return issues;
  }
  const ids = new Set<string>();
  value.routes.forEach((route, index) => {
    const path = `routes[${index}]`;
    validateRoute(route, path, issues);
    const id = isRecord(route) ? route.id : undefined;
    if (isRouteId(id)) {
      if (ids.has(id)) issues.push({ path: `${path}.id`, message: '路线 id 在同一文件里重复' });
      ids.add(id);
    }
  });
  return issues;
}

function decodeRoute(route: Record<string, unknown>): RouteRecord {
  const list = (value: unknown): string[] => (Array.isArray(value) ? [...value] as string[] : []);
  return {
    id: route.id as string,
    description: route.description as string,
    targets: list(route.targets),
    known: list(route.known),
    basis: route.basis as string,
    conceptIds: list(route.conceptIds),
    derivationIds: list(route.derivationIds),
    order: list(route.order),
    cost: route.cost as number,
  };
}

export function parseRoutesState(text: string): RoutesState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('路线记录不是合法 JSON');
  }
  const issues = validateRoutesState(value);
  if (issues.length) refuse(issues);
  const routes = isRecord(value) && Array.isArray(value.routes) ? value.routes : [];
  return { routes: routes.filter(isRecord).map(decodeRoute) };
}

function encodeRoute(route: RouteRecord): Record<string, unknown> {
  return {
    id: route.id,
    description: route.description,
    targets: [...route.targets],
    known: [...route.known],
    basis: route.basis,
    conceptIds: [...route.conceptIds],
    derivationIds: [...route.derivationIds],
    order: [...route.order],
    cost: route.cost,
  };
}

/** Canonical `routes.json` text. Refuses a route the validator would reject. */
export function serializeRoutesState(state: RoutesState): string {
  const encoded = { schema: ROUTES_SCHEMA, routes: state.routes.map(encodeRoute) };
  const issues = validateRoutesState(encoded);
  if (issues.length) refuse(issues);
  return `${JSON.stringify(encoded, null, 2)}\n`;
}

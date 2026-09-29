/**
 * The mastery protocol, `derivon.learning/v1` (`state.json`). It is not workspace content and
 * does not live in `src/workspace/`: it persists in the application data directory, keyed by
 * the workspace `id`. The normative text is [learner records](../../docs/learner-records.md);
 * this module owns the shape, the canonical text, and what counts as an unreadable record.
 * Personal routes, the other learner record, are `derivon.route/v1` files and are read by
 * `src/workspace/route.ts`, which owns that protocol for both of its locations.
 *
 * A `schema` string that is not the file's own is an unreadable file, and a key the protocol
 * does not define — at the top level or inside a record — is reported rather than ignored. The
 * serializer refuses its own invalid input, so a writer can never produce an artifact this
 * module's validator rejects.
 */
export const LEARNING_SCHEMA = 'derivon.learning/v1' as const;

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

export type LearnerRecordIssue = {
  readonly path: string;
  readonly message: string;
};

/** `basis` is a SHA-256 stream rendered as lowercase hexadecimal; see `docs/learner-records.md`. */
const BASIS_PATTERN = /^[0-9a-f]{64}$/;

function isBasis(value: unknown): value is string {
  return typeof value === 'string' && BASIS_PATTERN.test(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function reportUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, issues: LearnerRecordIssue[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: path ? `${path}.${key}` : key, message: '不是这个协议定义的键' });
  }
}

/** The one refusal the parser and the serializer share, so both report the same way. */
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

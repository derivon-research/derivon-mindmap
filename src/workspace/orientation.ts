/**
 * The `derivon.orientation/v1` companion document: the optional, declarative orientation
 * configuration a graph author ships with a workspace.
 *
 * It is workspace content, so it lives here: this module owns its shape, its canonical
 * text, and what counts as a broken configuration. It owns none of the flow — turning an
 * answer into this session's targets and known lives in `src/modes/learning/`.
 *
 * The action vocabulary is closed on purpose. Four operations, concepts named directly or
 * by tag, and nothing else: no expressions, no conditions, no code.
 */
import { conceptsWithTag, type ManifestGraph, type TagDeclaration } from './manifest';

export const ORIENTATION_SCHEMA = 'derivon.orientation/v1' as const;

/** The companion path; the manifest gains no field for it. */
export const ORIENTATION_PATH = '.derivon/orientation.json';

/** Reserved question id ending orientation. Never usable as a question's own id. */
export const ORIENTATION_FINISH = 'finish';

export type OrientationActionOp = 'set-targets' | 'add-targets' | 'set-known' | 'add-known';

export const ORIENTATION_ACTION_OPS: readonly OrientationActionOp[] =
  ['set-targets', 'add-targets', 'set-known', 'add-known'];

export type OrientationAction = {
  readonly op: OrientationActionOp;
  readonly points?: readonly string[];
  readonly tags?: readonly string[];
};

export type OrientationOption = {
  readonly id: string;
  readonly label: string;
  readonly actions: readonly OrientationAction[];
  /**
   * A question id, or `finish`. Absent falls through to the next question in document
   * order, so branching stays the exception rather than the shape every author writes in.
   */
  readonly next?: string;
};

export type OrientationQuestion = {
  readonly id: string;
  readonly prompt: string;
  /** `one` lets each option branch; `many` cannot, so the question carries the jump. */
  readonly select: 'one' | 'many';
  readonly options: readonly OrientationOption[];
  readonly next?: string;
};

/** The default route seed is a snapshot of concepts, never a live tag query. */
export type OrientationSeed = {
  readonly targets: readonly string[];
  readonly known: readonly string[];
};

export type OrientationConfig = {
  readonly schema: typeof ORIENTATION_SCHEMA;
  readonly seed: OrientationSeed;
  readonly questions: readonly OrientationQuestion[];
};

export type OrientationLocation = {
  readonly questionId?: string;
  readonly optionId?: string;
};

export type OrientationDiagnostic = {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  /** Where the author has to go to fix it. */
  readonly at: OrientationLocation;
  readonly message: string;
};

export function emptyOrientationConfig(): OrientationConfig {
  return { schema: ORIENTATION_SCHEMA, seed: { targets: [], known: [] }, questions: [] };
}

// ------------------------------------------------------------------ structure

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Issue = { path: string; message: string };

function readStringList(value: unknown, path: string, issues: Issue[]): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: '必须是字符串数组' });
    return [];
  }
  return value.filter((item, index): item is string => {
    if (typeof item === 'string' && item.trim()) return true;
    issues.push({ path: `${path}[${index}]`, message: '必须是非空字符串' });
    return false;
  });
}

function readAction(value: unknown, path: string, issues: Issue[]): OrientationAction | null {
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'op' && key !== 'points' && key !== 'tags') issues.push({ path: `${path}.${key}`, message: '不是受限动作的字段' });
  }
  if (typeof value.op !== 'string' || !ORIENTATION_ACTION_OPS.includes(value.op as OrientationActionOp)) {
    issues.push({ path: `${path}.op`, message: `必须为 ${ORIENTATION_ACTION_OPS.join(' / ')} 之一` });
    return null;
  }
  const points = value.points === undefined ? undefined : readStringList(value.points, `${path}.points`, issues);
  const tags = value.tags === undefined ? undefined : readStringList(value.tags, `${path}.tags`, issues);
  return { op: value.op as OrientationActionOp, ...(points ? { points } : {}), ...(tags ? { tags } : {}) };
}

function readOption(value: unknown, path: string, issues: Issue[]): OrientationOption | null {
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!['id', 'label', 'actions', 'next'].includes(key)) issues.push({ path: `${path}.${key}`, message: '不属于选项' });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    return null;
  }
  if (typeof value.label !== 'string') issues.push({ path: `${path}.label`, message: '必须是字符串' });
  if (value.next !== undefined && typeof value.next !== 'string') issues.push({ path: `${path}.next`, message: '必须是问题 id 或 finish' });
  const actions = Array.isArray(value.actions)
    ? value.actions.map((action, index) => readAction(action, `${path}.actions[${index}]`, issues))
      .filter((action): action is OrientationAction => action !== null)
    : (issues.push({ path: `${path}.actions`, message: '必须是数组' }), []);
  return {
    id: value.id,
    label: typeof value.label === 'string' ? value.label : '',
    actions,
    ...(typeof value.next === 'string' ? { next: value.next } : {}),
  };
}

function readQuestion(value: unknown, path: string, issues: Issue[]): OrientationQuestion | null {
  if (!isRecord(value)) {
    issues.push({ path, message: '必须是对象' });
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!['id', 'prompt', 'select', 'options', 'next'].includes(key)) issues.push({ path: `${path}.${key}`, message: '不属于问题' });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    return null;
  }
  if (typeof value.prompt !== 'string') issues.push({ path: `${path}.prompt`, message: '必须是字符串' });
  if (value.select !== 'one' && value.select !== 'many') issues.push({ path: `${path}.select`, message: '必须为 one 或 many' });
  if (value.next !== undefined && typeof value.next !== 'string') issues.push({ path: `${path}.next`, message: '必须是问题 id 或 finish' });
  const options = Array.isArray(value.options)
    ? value.options.map((option, index) => readOption(option, `${path}.options[${index}]`, issues))
      .filter((option): option is OrientationOption => option !== null)
    : (issues.push({ path: `${path}.options`, message: '必须是数组' }), []);
  return {
    id: value.id,
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    select: value.select === 'many' ? 'many' : 'one',
    options,
    ...(typeof value.next === 'string' ? { next: value.next } : {}),
  };
}

/**
 * Decode the companion text. Structural failure throws with every location listed, so an
 * unreadable configuration is diagnosable rather than a blank screen.
 */
export function parseOrientationConfig(text: string): OrientationConfig {
  const value: unknown = JSON.parse(text);
  const issues: Issue[] = [];
  if (!isRecord(value)) throw new Error('$: 开局配置必须是 JSON 对象');
  if (value.schema !== ORIENTATION_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${ORIENTATION_SCHEMA}` });
  for (const key of Object.keys(value)) {
    if (!['schema', 'seed', 'questions'].includes(key)) issues.push({ path: key, message: '不属于开局配置' });
  }
  const seedValue = isRecord(value.seed) ? value.seed : (issues.push({ path: 'seed', message: '缺少默认路线种子' }), {});
  const seed: OrientationSeed = {
    targets: readStringList(seedValue.targets ?? [], 'seed.targets', issues),
    known: readStringList(seedValue.known ?? [], 'seed.known', issues),
  };
  const questions = Array.isArray(value.questions)
    ? value.questions.map((question, index) => readQuestion(question, `questions[${index}]`, issues))
      .filter((question): question is OrientationQuestion => question !== null)
    : (issues.push({ path: 'questions', message: '必须是数组' }), []);
  if (issues.length) throw new Error(issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return { schema: ORIENTATION_SCHEMA, seed, questions };
}

export function serializeOrientationConfig(config: OrientationConfig): string {
  return `${JSON.stringify({
    schema: ORIENTATION_SCHEMA,
    seed: { targets: [...config.seed.targets], known: [...config.seed.known] },
    questions: config.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      select: question.select,
      next: question.next,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        actions: option.actions.map((action) => ({
          op: action.op,
          points: action.points?.length ? [...action.points] : undefined,
          tags: action.tags?.length ? [...action.tags] : undefined,
        })),
        next: option.next,
      })),
    })),
  }, null, 2)}\n`;
}

// ------------------------------------------------------------------ resolution

/** The concepts an action means, after expanding its tags against the graph. */
export function resolveOrientationAction(action: OrientationAction, graph: ManifestGraph): string[] {
  const resolved = new Set<string>();
  for (const id of action.points ?? []) resolved.add(id);
  for (const tag of action.tags ?? []) for (const point of conceptsWithTag(graph, tag)) resolved.add(point.id);
  return [...resolved].filter((id) => graph.points.some((point) => point.id === id));
}

export type OrientationConceptReference = {
  readonly conceptId: string;
  readonly at: OrientationLocation & { readonly field: 'seed.targets' | 'seed.known' | 'action' };
};

/**
 * Every concept id the configuration stores by name. A tag is not listed: deleting a
 * concept changes what a tag expands to, it does not leave a dangling reference behind.
 */
export function orientationConceptReferences(config: OrientationConfig): OrientationConceptReference[] {
  const references: OrientationConceptReference[] = [
    ...config.seed.targets.map((conceptId) => ({ conceptId, at: { field: 'seed.targets' as const } })),
    ...config.seed.known.map((conceptId) => ({ conceptId, at: { field: 'seed.known' as const } })),
  ];
  for (const question of config.questions) {
    for (const option of question.options) {
      for (const action of option.actions) {
        for (const conceptId of action.points ?? []) {
          references.push({ conceptId, at: { field: 'action', questionId: question.id, optionId: option.id } });
        }
      }
    }
  }
  return references;
}

// ------------------------------------------------------------------ validation

/**
 * Check a decoded configuration against the graph it ships with.
 *
 * The line between the two severities is the one #57 draws: anything that could put a
 * wrong or dangling concept into a route is an error, anything merely written badly is a
 * warning. Errors keep a configuration out of the effective orientation entirely.
 */
export function validateOrientationConfig(
  config: OrientationConfig,
  graph: ManifestGraph,
  declaredTags: readonly TagDeclaration[] = [],
): OrientationDiagnostic[] {
  const found: OrientationDiagnostic[] = [];
  const add = (severity: OrientationDiagnostic['severity'], code: string, at: OrientationLocation, message: string) =>
    found.push({ severity, code, at, message });
  const conceptIds = new Set(graph.points.map((point) => point.id));
  const declared = new Set(declaredTags.map((tag) => tag.id));
  const questionIds = new Set<string>();

  for (const question of config.questions) {
    if (questionIds.has(question.id)) add('error', 'duplicate-question', { questionId: question.id }, `问题 id「${question.id}」重复。`);
    questionIds.add(question.id);
    if (question.id === ORIENTATION_FINISH) {
      add('error', 'reserved-id', { questionId: question.id }, `「${ORIENTATION_FINISH}」是保留 id，不能用作问题 id。`);
    }
  }

  for (const [field, ids] of [['目标', config.seed.targets], ['已知', config.seed.known]] as const) {
    for (const id of ids) {
      if (!conceptIds.has(id)) add('error', 'dangling-concept', {}, `默认${field}引用了图里没有的概念「${id}」。`);
    }
  }

  const checkNext = (value: string | undefined, at: OrientationLocation) => {
    if (value === undefined || value === ORIENTATION_FINISH) return;
    if (!questionIds.has(value)) add('error', 'dangling-next', at, `跳转到了不存在的问题「${value}」。`);
  };

  for (const question of config.questions) {
    const questionAt = { questionId: question.id };
    if (!question.prompt.trim()) add('warning', 'empty-prompt', questionAt, '问题没有提示语，学习者会看到一排没有上下文的按钮。');
    if (!question.options.length) add('warning', 'no-options', questionAt, '问题没有选项，学习者无法回答，只能跳过。');
    checkNext(question.next, questionAt);
    if (question.select === 'one' && question.next !== undefined) {
      add('warning', 'unused-next', questionAt, '单选题的跳转由选项决定，问题自己的 next 不会生效。');
    }

    const optionIds = new Set<string>();
    for (const option of question.options) {
      const at = { questionId: question.id, optionId: option.id };
      if (optionIds.has(option.id)) add('error', 'duplicate-option', at, `选项 id「${option.id}」在同一题里重复。`);
      optionIds.add(option.id);
      if (!option.label.trim()) add('warning', 'empty-label', at, '选项没有文案。');
      if (question.select === 'many' && option.next !== undefined) {
        add('error', 'branch-on-multi', at,
          '多选题的选项不能各自跳转——学习者可以同时选中它们，跳转会互相冲突。把跳转放到问题上。');
      }
      checkNext(option.next, at);

      for (const action of option.actions) {
        for (const id of action.points ?? []) {
          if (!conceptIds.has(id)) add('error', 'dangling-concept', at, `动作引用了图里没有的概念「${id}」。`);
        }
        for (const tag of action.tags ?? []) {
          if (!declared.has(tag)) {
            add('warning', 'undeclared-tag', at, `标签「${tag}」没有在清单的 tags 里声明，界面只能显示它的 id。`);
          }
          if (!conceptsWithTag(graph, tag).length) {
            add('error', 'empty-tag', at, `标签「${tag}」没有匹配到任何概念，这个动作什么也不会做。`);
          }
        }
        if (!resolveOrientationAction(action, graph).length) add('error', 'empty-action', at, '动作没有解析出任何概念。');
      }
    }
  }

  for (const question of unreachableQuestions(config)) {
    add('warning', 'unreachable', { questionId: question.id }, '没有任何路径能走到这道题。');
  }
  return found;
}

/** Reachability over fall-through as well as explicit jumps. */
function unreachableQuestions(config: OrientationConfig): readonly OrientationQuestion[] {
  const reached = new Set<string>();
  const walk = (index: number) => {
    const question = config.questions[index];
    if (!question || reached.has(question.id)) return;
    reached.add(question.id);
    const jump = (value: string | undefined) => {
      if (value === ORIENTATION_FINISH) return;
      if (value === undefined) { walk(index + 1); return; }
      const target = config.questions.findIndex((item) => item.id === value);
      if (target >= 0) walk(target);
    };
    if (question.select === 'many' || !question.options.length) jump(question.next);
    else for (const option of question.options) jump(option.next);
  };
  walk(0);
  return config.questions.filter((question) => !reached.has(question.id));
}

export function orientationErrors(diagnostics: readonly OrientationDiagnostic[]): readonly OrientationDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

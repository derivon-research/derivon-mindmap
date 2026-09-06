/**
 * Draft edits to an orientation configuration: pure transformations of the document, so
 * what the author sees is the configuration itself and accepting it is one content
 * operation. Validation belongs to `src/workspace/`.
 *
 * An edit that would make the document contradict itself cleans up after itself in the
 * same call — deleting a question takes the jumps that named it.
 */
import {
  ORIENTATION_FINISH,
  type OrientationAction, type OrientationConfig, type OrientationOption, type OrientationQuestion,
  type OrientationSeed,
} from '../../../workspace/index';

function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  let index = 1;
  while (taken.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function mapQuestion(
  config: OrientationConfig,
  questionId: string,
  change: (question: OrientationQuestion) => OrientationQuestion,
): OrientationConfig {
  if (!config.questions.some((question) => question.id === questionId)) throw new Error(`未找到问题: ${questionId}`);
  return { ...config, questions: config.questions.map((question) => question.id === questionId ? change(question) : question) };
}

export function addQuestion(config: OrientationConfig): OrientationConfig {
  const id = nextId('q', [...config.questions.map((question) => question.id), ORIENTATION_FINISH]);
  return { ...config, questions: [...config.questions, { id, prompt: '', select: 'one', options: [] }] };
}

export function addOption(config: OrientationConfig, questionId: string): OrientationConfig {
  return mapQuestion(config, questionId, (question) => ({
    ...question,
    options: [...question.options, { id: nextId('o', question.options.map((option) => option.id)), label: '', actions: [] }],
  }));
}

export type QuestionEdit = Partial<Pick<OrientationQuestion, 'prompt' | 'select' | 'next'>>;

export function updateQuestion(config: OrientationConfig, questionId: string, edit: QuestionEdit): OrientationConfig {
  return mapQuestion(config, questionId, (question) => {
    const next = { ...question, ...edit };
    // A learner can select several options at once, so the jump moves onto the question.
    return next.select === 'many'
      ? { ...next, options: next.options.map(({ next: _branch, ...option }) => option) }
      : next;
  });
}

export type OptionEdit = Partial<Pick<OrientationOption, 'label' | 'next'>>;

export function updateOption(config: OrientationConfig, questionId: string, optionId: string, edit: OptionEdit): OrientationConfig {
  return mapQuestion(config, questionId, (question) => ({
    ...question,
    options: question.options.map((option) => option.id === optionId ? { ...option, ...edit } : option),
  }));
}

export function setOptionActions(
  config: OrientationConfig, questionId: string, optionId: string, actions: readonly OrientationAction[],
): OrientationConfig {
  return mapQuestion(config, questionId, (question) => ({
    ...question,
    options: question.options.map((option) => option.id === optionId ? { ...option, actions } : option),
  }));
}

export function removeOption(config: OrientationConfig, questionId: string, optionId: string): OrientationConfig {
  return mapQuestion(config, questionId, (question) => ({
    ...question, options: question.options.filter((option) => option.id !== optionId),
  }));
}

/** Deleting a question takes every jump that named it. */
export function removeQuestion(config: OrientationConfig, questionId: string): OrientationConfig {
  const clear = <T extends { next?: string }>(value: T): T =>
    (value.next === questionId ? { ...value, next: undefined } : value);
  return {
    ...config,
    questions: config.questions.filter((question) => question.id !== questionId).map((question) => ({
      ...clear(question),
      options: question.options.map(clear),
    })),
  };
}

/** Move by one place. Fall-through reads this order. */
export function moveQuestion(config: OrientationConfig, questionId: string, delta: -1 | 1): OrientationConfig {
  const index = config.questions.findIndex((question) => question.id === questionId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= config.questions.length) return config;
  const questions = [...config.questions];
  [questions[index], questions[target]] = [questions[target], questions[index]];
  return { ...config, questions };
}

export function setSeed(config: OrientationConfig, seed: OrientationSeed): OrientationConfig {
  return { ...config, seed: { targets: [...seed.targets], known: [...seed.known] } };
}

/**
 * Remove concepts that are going away, everywhere the configuration names them. This is
 * the executable half of a deletion plan; an action left with nothing to do goes with them.
 */
export function repairConceptReferences(config: OrientationConfig, conceptIds: readonly string[]): OrientationConfig {
  const removed = new Set(conceptIds);
  const keep = (ids: readonly string[]) => ids.filter((id) => !removed.has(id));
  return {
    ...config,
    seed: { targets: keep(config.seed.targets), known: keep(config.seed.known) },
    questions: config.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({
        ...option,
        actions: option.actions
          .map((action) => (action.points ? { ...action, points: keep(action.points) } : action))
          .filter((action) => (action.points?.length ?? 0) > 0 || (action.tags?.length ?? 0) > 0),
      })),
    })),
  };
}

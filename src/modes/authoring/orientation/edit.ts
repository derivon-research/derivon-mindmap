/**
 * Draft edits to an orientation configuration.
 *
 * Pure transformations of the document, so the editor keeps no shadow model of its own:
 * what the author sees is a configuration that would validate, and accepting a draft is
 * one content operation rather than a replay of interface events.
 *
 * These functions never validate — `src/workspace/` owns what a broken configuration is.
 * They do keep the document from contradicting itself: a jump to a question that has just
 * been deleted, or a per-option branch on a question that has just become multi-select,
 * is removed by the same edit that caused it.
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
    // A learner can select several options at once, so several jumps would conflict. The
    // question keeps the single jump and the option-level branches go.
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

/** Deleting a question also deletes every jump that named it; nothing dangles afterwards. */
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

/** Move by one place. Questions are ordered, and fall-through reads that order. */
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
 * Remove concepts that are going away, everywhere the configuration names them.
 *
 * This is the executable half of a deletion plan: an author can see what it would do
 * before confirming, and an action left meaning nothing is dropped rather than saved as an
 * action that would do nothing.
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

/**
 * What an author is looking at when a row in the outline shows a route.
 *
 * An entry option answers "how long is this route" by itself: it sets the targets, and
 * targets are all a solve needs. A follow-up option cannot — "you already know inner
 * products" means nothing until you know which learner is being asked. So a follow-up is
 * always shown under a stated assumption: which opening answer this learner gave.
 *
 * The assumption is deliberately shallow. Only the seed and the entry are assumed; answers
 * to the questions in between are not guessed. A number resting on a guess would be worse
 * than a number with its premise printed next to it.
 */
import {
  applyOrientationIntent, beginOrientation, currentQuestion,
  type OrientationPlan, type OrientationRun,
} from '../../learning/orientation';
import type { OrientationOption } from '../../../workspace/index';

/** The opening question's options: each one is a way into this graph. */
export function entryOptions(plan: OrientationPlan): readonly OrientationOption[] {
  return plan.config?.questions[0]?.options ?? [];
}

/** Walk forward without answering anything, to see where a branch lands. */
function skipTo(plan: OrientationPlan, from: OrientationRun, questionId: string): OrientationRun | null {
  let run = from;
  for (let guard = 0; guard < (plan.config?.questions.length ?? 0) + 1; guard++) {
    const question = currentQuestion(plan, run);
    if (!question) return null;
    if (question.id === questionId) return run;
    run = applyOrientationIntent(plan, run, { kind: 'skip' });
  }
  return null;
}

/**
 * The state a learner is in on arrival at a question, having answered only the opening
 * question with `entryOptionId`. `null` when that entry cannot reach the question at all.
 */
export function arrivalState(plan: OrientationPlan, questionId: string, entryOptionId: string | null): OrientationRun | null {
  const start = beginOrientation(plan);
  const opening = currentQuestion(plan, start);
  if (!opening) return null;
  if (opening.id === questionId) return start;
  if (entryOptionId === null) return skipTo(plan, start, questionId);
  const entered = applyOrientationIntent(plan, start, { kind: 'answer', optionIds: [entryOptionId] });
  return skipTo(plan, entered, questionId);
}

/** Which openings can reach this question. An outline row offers exactly these. */
export function entriesReaching(plan: OrientationPlan, questionId: string): readonly OrientationOption[] {
  return entryOptions(plan).filter((option) => arrivalState(plan, questionId, option.id) !== null);
}

export type OptionContext = {
  /** Before this option is chosen, having arrived through the stated entry. */
  readonly before: OrientationRun;
  /** After choosing it. The difference between the two is what the option is worth. */
  readonly after: OrientationRun;
};

/** Apply one option's actions on top of the arrival state, without moving the flow on. */
export function optionContext(
  plan: OrientationPlan, questionId: string, optionId: string, entryOptionId: string | null,
): OptionContext | null {
  const before = arrivalState(plan, questionId, entryOptionId);
  if (!before) return null;
  const question = plan.config?.questions.find((candidate) => candidate.id === questionId);
  const option = question?.options.find((candidate) => candidate.id === optionId);
  if (!question || !option) return null;
  const applied = applyOrientationIntent(plan, { ...before, at: before.at }, { kind: 'answer', optionIds: [option.id] });
  return { before, after: { ...applied, at: before.at, trail: before.trail } };
}

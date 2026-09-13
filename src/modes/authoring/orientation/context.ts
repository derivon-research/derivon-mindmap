/**
 * What an author is looking at when a row in the outline shows a route.
 *
 * An entry option answers "how long is this route" by itself: it sets the targets, and
 * targets are all a solve needs. A follow-up option depends on which learner is being
 * asked, so it is shown under a stated assumption: which opening answer they gave.
 *
 * The assumption stays shallow — the seed and the entry — and the interface prints it.
 */
import {
  applyOrientationIntent, beginOrientation, currentQuestion,
  type OrientationPlan, type OrientationState,
} from '../../learning/orientation';
import type { OrientationOption } from '../../../workspace/index';

/** The opening question's options: each one is a way into this graph. */
export function entryOptions(plan: OrientationPlan): readonly OrientationOption[] {
  return plan.config?.questions[0]?.options ?? [];
}

/** Walk forward without answering anything, to see where a branch lands. */
function skipTo(plan: OrientationPlan, from: OrientationState, questionId: string): OrientationState | null {
  let current = from;
  for (let guard = 0; guard < (plan.config?.questions.length ?? 0) + 1; guard++) {
    const question = currentQuestion(plan, current.run);
    if (!question) return null;
    if (question.id === questionId) return current;
    current = applyOrientationIntent(plan, current.run, current.known, { kind: 'skip' });
  }
  return null;
}

/**
 * The state a learner is in on arrival at a question, having answered only the opening
 * question with `entryOptionId`. `null` when that entry cannot reach the question.
 */
export function arrivalState(
  plan: OrientationPlan, questionId: string, entryOptionId: string | null, known: readonly string[],
): OrientationState | null {
  const start = { run: beginOrientation(plan), known };
  const opening = currentQuestion(plan, start.run);
  if (!opening) return null;
  if (opening.id === questionId) return start;
  if (entryOptionId === null) return skipTo(plan, start, questionId);
  const entered = applyOrientationIntent(plan, start.run, known, { kind: 'answer', optionIds: [entryOptionId] });
  return skipTo(plan, entered, questionId);
}

/** Which openings can reach this question; an outline row offers these. */
export function entriesReaching(plan: OrientationPlan, questionId: string, known: readonly string[]): readonly OrientationOption[] {
  return entryOptions(plan).filter((option) => arrivalState(plan, questionId, option.id, known) !== null);
}

export type OptionContext = {
  /** Before this option is chosen, having arrived through the stated entry. */
  readonly before: OrientationState;
  /** After choosing it. The difference between the two is what the option is worth. */
  readonly after: OrientationState;
};

/** Apply one option's actions on top of the arrival state, leaving the flow where it is. */
export function optionContext(
  plan: OrientationPlan, questionId: string, optionId: string, entryOptionId: string | null, known: readonly string[],
): OptionContext | null {
  const before = arrivalState(plan, questionId, entryOptionId, known);
  if (!before) return null;
  const question = plan.config?.questions.find((candidate) => candidate.id === questionId);
  const option = question?.options.find((candidate) => candidate.id === optionId);
  if (!question || !option) return null;
  const applied = applyOrientationIntent(plan, before.run, before.known, { kind: 'answer', optionIds: [option.id] });
  return { before, after: { run: { ...applied.run, at: before.run.at, trail: before.run.trail }, known: applied.known } };
}

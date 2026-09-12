import type { TaskCompletion } from './progress';

/**
 * What a walk through the route stage keeps between views. Which route is being walked is not
 * here: that is the active confirmed route, held by the application. This is only where along
 * it the learner is and what they have handed in.
 */
export type LearningWalkState = {
  readonly cursor: number;
  readonly revealed: readonly string[];
  readonly taskCompletions: readonly TaskCompletion[];
};

export function initialLearningWalkState(): LearningWalkState {
  return { cursor: 0, revealed: [], taskCompletions: [] };
}

/**
 * A different route is on screen. It starts from the top, but judgements already handed in
 * stay: they are keyed by the route they were made on, so another route's are untouched.
 */
export function startRoute(state: LearningWalkState): LearningWalkState {
  return state.cursor === 0 && state.revealed.length === 0
    ? state
    : { ...state, cursor: 0, revealed: [] };
}

export function revealDefinition(
  state: LearningWalkState,
  conceptId: string,
): LearningWalkState {
  return state.revealed.includes(conceptId) ? state
    : { ...state, revealed: [...state.revealed, conceptId] };
}

export function moveLearningCursor(state: LearningWalkState, index: number): LearningWalkState {
  return state.cursor === index ? state : { ...state, cursor: index };
}

export function recordTaskCompletion(
  state: LearningWalkState,
  completion: TaskCompletion,
): LearningWalkState {
  return {
    ...state,
    taskCompletions: [
      ...state.taskCompletions.filter((item) => !(
      item.routeKey === completion.routeKey
      && item.graphText === completion.graphText
      && item.conceptId === completion.conceptId
      && item.derivationId === completion.derivationId
      )),
      completion,
    ],
  };
}

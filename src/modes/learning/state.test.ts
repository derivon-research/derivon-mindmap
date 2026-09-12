import { describe, expect, it } from 'vitest';
import type { TaskCompletion } from './progress';
import {
  initialLearningWalkState, moveLearningCursor, recordTaskCompletion, revealDefinition, startRoute,
} from './state';

const completion = (conceptId: string): TaskCompletion => ({
  graphText: '{}', routeKey: 'd1', conceptId, derivationId: `d-${conceptId}`,
  task: `task ${conceptId}`, documentBasis: `basis ${conceptId}`,
});

describe('learning walk state', () => {
  it('starts a route from the top without throwing away judgements already handed in', () => {
    let state = initialLearningWalkState();
    state = recordTaskCompletion(state, completion('b'));
    state = moveLearningCursor(state, 3);
    state = revealDefinition(state, 'b');

    const restarted = startRoute(state);
    expect(restarted.cursor).toBe(0);
    expect(restarted.revealed).toEqual([]);
    expect(restarted.taskCompletions).toEqual([completion('b')]);
  });

  it('keeps unrelated task completions when another step is submitted again', () => {
    let state = initialLearningWalkState();
    state = recordTaskCompletion(state, completion('b'));
    state = recordTaskCompletion(state, completion('c'));
    const resubmitted = { ...completion('b'), documentBasis: 'new basis b' };
    state = recordTaskCompletion(state, resubmitted);

    expect(state.taskCompletions).toHaveLength(2);
    expect(state.taskCompletions).toContainEqual(resubmitted);
    expect(state.taskCompletions).toContainEqual(completion('c'));
  });
});

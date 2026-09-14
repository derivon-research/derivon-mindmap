/**
 * What one walk through the route stage keeps between views: which definitions the learner
 * asked for, and nothing else.
 *
 * **Progress is deliberately not here.** Where the learner is on the route is derived at
 * display time from the learner records — the first step whose conclusion concept has no
 * fresh `complete` record — so reopening a workspace lands there rather than wherever a
 * session happened to be ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
 * A revealed definition is a reading convenience with no meaning after the application is
 * closed, which is exactly what makes it session state.
 */
export type RouteWalkState = {
  readonly revealed: readonly string[];
};

export function initialRouteWalk(): RouteWalkState {
  return { revealed: [] };
}

export function revealDefinition(
  state: RouteWalkState,
  conceptId: string,
): RouteWalkState {
  return state.revealed.includes(conceptId) ? state
    : { ...state, revealed: [...state.revealed, conceptId] };
}

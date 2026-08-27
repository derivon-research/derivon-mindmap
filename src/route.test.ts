import { describe, expect, it } from 'vitest';
import {
  createRouteSelection,
  invalidateRoute,
  routeHighlightIds,
  toggleRouteStart,
  toggleRouteTarget,
  type RouteResponse,
} from './route';

const reachable: RouteResponse = {
  reachable: true,
  hyperedgeIds: ['h-entry', 'h-goal'],
  executableOrder: ['h-entry', 'h-goal'],
  pointIds: ['a', 'goal'],
  cost: 3.2,
  lower: 3,
  upper: 3.2,
  provenOptimal: false,
  nodes: 10,
  millis: 2,
  targetDiagnoses: [],
};

describe('route state', () => {
  it('tracks start and target sets without duplicates', () => {
    let selection = createRouteSelection();
    selection = toggleRouteStart(selection, 'b');
    selection = toggleRouteStart(selection, 'a');
    selection = toggleRouteTarget(selection, 'goal-b');
    selection = toggleRouteTarget(selection, 'goal-a');
    expect(selection.startPointIds).toEqual(['a', 'b']);
    expect(selection.targetPointIds).toEqual(['goal-a', 'goal-b']);
    expect(toggleRouteStart(selection, 'a').startPointIds).toEqual(['b']);
    expect(toggleRouteTarget(selection, 'goal-a').targetPointIds).toEqual(['goal-b']);
  });

  it('maps a route response to persistent graph ids for highlighting', () => {
    expect([...routeHighlightIds(reachable)].sort()).toEqual(['a', 'goal', 'h-entry', 'h-goal']);
  });

  it('invalidates a stale result when workspace state changes', () => {
    const selection = { ...createRouteSelection(), targetPointIds: ['goal'], result: reachable };
    expect(invalidateRoute(selection)).toEqual({
      startPointIds: [],
      targetPointIds: ['goal'],
      result: null,
    });
  });
});

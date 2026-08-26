import { describe, expect, it } from 'vitest';
import {
  createRouteSelection,
  invalidateRoute,
  routeHighlightIds,
  setRouteTarget,
  toggleRouteStart,
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
  blockingPointIds: [],
  cycles: [],
};

describe('route state', () => {
  it('tracks multiple starts and one target without duplicates', () => {
    let selection = createRouteSelection();
    selection = toggleRouteStart(selection, 'b');
    selection = toggleRouteStart(selection, 'a');
    selection = setRouteTarget(selection, 'goal');
    expect(selection.startPointIds).toEqual(['a', 'b']);
    expect(selection.targetPointId).toBe('goal');
    expect(toggleRouteStart(selection, 'a').startPointIds).toEqual(['b']);
  });

  it('maps a route response to persistent graph ids for highlighting', () => {
    expect([...routeHighlightIds(reachable)].sort()).toEqual(['a', 'goal', 'h-entry', 'h-goal']);
  });

  it('invalidates a stale result when workspace state changes', () => {
    const selection = { ...createRouteSelection(), targetPointId: 'goal', result: reachable };
    expect(invalidateRoute(selection)).toEqual({
      startPointIds: [],
      targetPointId: 'goal',
      result: null,
    });
  });
});

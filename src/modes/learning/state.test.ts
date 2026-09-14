import { describe, expect, it } from 'vitest';
import { initialRouteWalk, revealDefinition } from './state';

describe('the route walk’s own state', () => {
  it('starts with nothing revealed, and reveals a definition once', () => {
    const walk = initialRouteWalk();
    expect(walk.revealed).toEqual([]);
    const revealed = revealDefinition(walk, 'b');
    expect(revealed.revealed).toEqual(['b']);
    expect(revealDefinition(revealed, 'b')).toBe(revealed);
    expect(revealDefinition(revealed, 'c').revealed).toEqual(['b', 'c']);
  });

  it('keeps no cursor and no completion: where the learner is comes from the records', () => {
    expect(Object.keys(initialRouteWalk())).toEqual(['revealed']);
  });
});

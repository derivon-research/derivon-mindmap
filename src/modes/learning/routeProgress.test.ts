import { describe, expect, it } from 'vitest';
import type { MasteryRecord } from '../../learner-records';
import type { WorkspaceContent } from '../../workspace/index';
import type { RouteStep } from '../routePreview';
import { routeProgress, stepBasis, stepStanding, type StepStanding } from './routeProgress';

const complete: MasteryRecord = { status: 'complete', basis: 'a'.repeat(64) };
const incomplete: MasteryRecord = { status: 'incomplete', basis: 'a'.repeat(64), data: { notes: '没到' } };

const step = (index: number, conceptId: string): RouteStep => ({
  index, derivationId: `d-${index}`, conceptId, label: conceptId.toUpperCase(),
  requires: [], weight: 1, tags: [],
});

describe('what a record says about one step', () => {
  it('reads absence as never asked, which is not the same as asked and not reached', () => {
    expect(stepStanding(undefined, 'b'.repeat(64))).toBe('unassessed');
    expect(stepStanding(incomplete, 'b'.repeat(64))).toBe('incomplete');
  });

  it('counts only a complete record whose basis still matches the workspace', () => {
    expect(stepStanding(complete, complete.basis)).toBe('complete');
    expect(stepStanding(complete, 'b'.repeat(64))).toBe('stale');
  });

  it('does not read a record it cannot match as complete', () => {
    // The content version is still being recomputed.
    expect(stepStanding(complete, undefined)).toBe('checking');
    // The host cannot recompute it at all, so whether it still counts is unknown.
    expect(stepStanding(complete, null)).toBe('unverifiable');
  });
});

describe('where a route has got to', () => {
  const steps = [step(1, 'b'), step(2, 'c'), step(3, 'e')];

  const progressOf = (standings: Readonly<Record<string, StepStanding>>) =>
    routeProgress(steps, (candidate) => standings[candidate.conceptId]);

  it('is the first step whose concept is not a fresh complete record', () => {
    expect(progressOf({ b: 'complete', c: 'complete', e: 'unassessed' }).currentIndex).toBe(2);
    expect(progressOf({ b: 'unassessed', c: 'complete', e: 'complete' }).currentIndex).toBe(0);
    expect(progressOf({ b: 'complete', c: 'stale', e: 'complete' }).currentIndex).toBe(1);
    expect(progressOf({ b: 'complete', c: 'incomplete', e: 'complete' }).currentIndex).toBe(1);
  });

  it('is past the end once every step is complete, and never a cursor onto one', () => {
    expect(progressOf({ b: 'complete', c: 'complete', e: 'complete' }).currentIndex).toBe(3);
  });

  it('masters a concept appearing twice on the path once, wherever it was reached', () => {
    const repeated = [step(1, 'b'), step(2, 'c'), step(3, 'b')];
    const progress = routeProgress(repeated, (candidate) => candidate.conceptId === 'b' ? 'complete' : 'unassessed');
    expect([...progress.standings.values()]).toEqual(['complete', 'unassessed', 'complete']);
    expect(progress.currentIndex).toBe(1);
  });

  it('says a basis is still being recomputed rather than calling the step done', () => {
    const progress = progressOf({ b: 'checking', c: 'complete', e: 'complete' });
    expect(progress.currentIndex).toBe(0);
    expect(progress.standings.get('d-1')).toBe('checking');
  });
});

describe('the basis a step is judged against', () => {
  const content = { graph: { points: [], hyperedges: [] } } as unknown as WorkspaceContent;
  const none = new Map<string, string | null | undefined>();

  it('uses the basis recomputed from the workspace when there is one', () => {
    const recomputed = new Map([['b', 'b'.repeat(64)]]);
    expect(stepBasis('b', recomputed, { content, conceptId: 'b', basis: 'c'.repeat(64) }, content))
      .toBe('b'.repeat(64));
  });

  it('answers with the judgement just written, so handing a step in does not flash “still checking”', () => {
    expect(stepBasis('b', none, { content, conceptId: 'b', basis: 'c'.repeat(64) }, content)).toBe('c'.repeat(64));
  });

  it('does not carry a just-written basis across another step, content or an unreadable one', () => {
    const fresh = { content, conceptId: 'b', basis: 'c'.repeat(64) };
    expect(stepBasis('c', none, fresh, content)).toBeUndefined();
    expect(stepBasis('b', none, fresh, { ...content })).toBeUndefined();
    expect(stepBasis('b', new Map([['b', null]]), fresh, content)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, parseWorkspaceContent, updateOrientation,
  type OrientationConfig, type WorkspaceContent,
} from '../../workspace/index';
import {
  applyOrientationIntent, beginOrientation, currentQuestion, isOrientationComplete, planOrientation,
} from './orientation';

function workspace(): WorkspaceContent {
  // A hand-written manifest, so the ids in CONFIG below are the ids a real graph has.
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA,
    document: { title: 'T', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
      { id: 'd', data: { label: 'D', document: 'docs/d' } },
    ], hyperedges: [] },
  }), documents: {} });
}

const CONFIG: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['c'], known: ['a'] },
  questions: [
    { id: 'why', prompt: '为什么来', select: 'one', options: [
      { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['d'] }], next: 'known' },
      { id: 'browse', label: '随便逛逛', actions: [], next: 'finish' },
      { id: 'course', label: '上课', actions: [{ op: 'add-targets', points: ['c'] }] },
    ] },
    { id: 'known', prompt: '会哪些', select: 'many', next: 'finish', options: [
      { id: 'basics', label: '基础', actions: [{ op: 'add-known', tags: ['basics'] }] },
      { id: 'none', label: '都不确定', actions: [] },
    ] },
  ],
};

const configured = () => updateOrientation(workspace(), CONFIG).content;

describe('the orientation plan', () => {
  it('runs the author configuration when it is effective content', () => {
    const plan = planOrientation(configured());
    expect(plan.kind).toBe('guided');
    expect(plan.fallbackReason).toBeUndefined();
  });

  it('falls back to the generic entry when no configuration ships with the workspace', () => {
    const plan = planOrientation(workspace());
    expect(plan.kind).toBe('generic');
    expect(plan.fallbackReason).toBe('absent');
    expect(beginOrientation(plan)).toEqual({ targets: [], known: [], at: -1, trail: [], asked: [], round: 0 });
    expect(isOrientationComplete(plan, beginOrientation(plan))).toBe(true);
  });

  it('falls back with a diagnosis when the configuration is broken', () => {
    const content = workspace();
    const broken = parseWorkspaceContent({ graph: content.graphText, documents: content.documents,
      companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: '{ "schema": "nope" }' } } });
    const plan = planOrientation(broken);
    expect(plan.kind).toBe('generic');
    expect(plan.fallbackReason).toBe('invalid');
    expect(plan.message).toContain('schema');
  });
});

describe('orientation transitions', () => {
  const plan = () => planOrientation(configured());

  it('initializes a route from the default seed before any question is answered', () => {
    const run = beginOrientation(plan());
    expect(run.targets).toEqual(['c']);
    expect(run.known).toEqual(['a']);
    expect(currentQuestion(plan(), run)?.id).toBe('why');
    expect(isOrientationComplete(plan(), run)).toBe(false);
  });

  it('applies a single-select answer, follows its branch and records the trail', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    expect(run.targets).toEqual(['d']);
    expect(currentQuestion(p, run)?.id).toBe('known');
    expect(run.trail).toEqual([{ questionId: 'why', optionIds: ['paper'], optionLabels: ['论文'] }]);
  });

  it('expands tags on the way in and unions a multi-select answer', () => {
    const p = plan();
    const answered = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    const run = applyOrientationIntent(p, answered, { kind: 'answer', optionIds: ['basics', 'none'] });
    expect(run.known).toEqual(['a', 'b']);
    expect(isOrientationComplete(p, run)).toBe(true);
    expect(currentQuestion(p, run)).toBeNull();
  });

  it('falls through to the next question in document order when an option names no branch', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['course'] });
    expect(run.targets).toEqual(['c']);
    expect(currentQuestion(p, run)?.id).toBe('known');
  });

  it('skips a question without changing targets or known', () => {
    const p = plan();
    const begun = beginOrientation(p);
    const run = applyOrientationIntent(p, begun, { kind: 'skip' });
    expect({ targets: run.targets, known: run.known }).toEqual({ targets: begun.targets, known: begun.known });
    expect(currentQuestion(p, run)?.id).toBe('known');
  });

  it('rejects an answer from outside the question being asked', () => {
    const p = plan();
    expect(() => applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['basics'] }))
      .toThrow(/basics/);
    expect(() => applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper', 'browse'] }))
      .toThrow(/单选/);
  });

  it('takes direct target and known changes, keeping only concepts the graph has', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'set-targets', conceptIds: ['b', 'ghost'] });
    expect(run.targets).toEqual(['b']);
    expect(applyOrientationIntent(p, run, { kind: 'set-known', conceptIds: ['ghost'] }).known).toEqual([]);
  });

  it('restarts back to the seed, keeping the configuration', () => {
    const p = plan();
    const answered = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    expect(applyOrientationIntent(p, answered, { kind: 'restart' })).toEqual(beginOrientation(p));
  });

  it('drives the generic fallback through the same transitions', () => {
    const p = planOrientation(workspace());
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'set-targets', conceptIds: ['a'] });
    expect(run.targets).toEqual(['a']);
    expect(() => applyOrientationIntent(p, run, { kind: 'answer', optionIds: ['paper'] })).toThrow();
  });
});

describe('collecting targets and asking what the learner knows', () => {
  const plan = () => planOrientation(configured());

  it('adds targets without dropping the ones already collected', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'add-targets', conceptIds: ['b', 'd'] });
    expect(run.targets).toEqual(['c', 'b', 'd']);
    expect(applyOrientationIntent(p, run, { kind: 'add-targets', conceptIds: ['b'] }).targets).toEqual(['c', 'b', 'd']);
  });

  it('spends a round of concepts whether or not the learner claims them', () => {
    const p = plan();
    const asked = applyOrientationIntent(p, beginOrientation(p), { kind: 'ask-known', conceptIds: ['b', 'd'] });
    expect(asked.asked).toEqual(['b', 'd']);
    expect(asked.round).toBe(1);
    expect(asked.known).toEqual(['a']);
    const second = applyOrientationIntent(p, asked, { kind: 'ask-known', conceptIds: ['c'] });
    expect(second.asked).toEqual(['b', 'd', 'c']);
    expect(second.round).toBe(2);
  });

  it('takes the concepts the learner claims, keeping only those the graph has', () => {
    const p = plan();
    const asked = applyOrientationIntent(p, beginOrientation(p), { kind: 'ask-known', conceptIds: ['b', 'd'] });
    const run = applyOrientationIntent(p, asked, { kind: 'know', conceptIds: ['b', 'ghost'] });
    expect(run.known).toEqual(['a', 'b']);
  });

  it('clears the rounds on a restart, so a second orientation asks from the top', () => {
    const p = plan();
    const asked = applyOrientationIntent(p, beginOrientation(p), { kind: 'ask-known', conceptIds: ['b'] });
    expect(applyOrientationIntent(p, asked, { kind: 'restart' }).asked).toEqual([]);
  });
});

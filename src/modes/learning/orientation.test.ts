import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, createConcept, createWorkspace, parseWorkspaceContent, updateConceptTags,
  updateOrientation, updateTagDeclarations, type OrientationConfig, type WorkspaceContent,
} from '../../workspace/index';
import {
  applyOrientationIntent, beginOrientation, currentQuestion, isOrientationComplete, planOrientation,
} from './orientation';

function workspace(): WorkspaceContent {
  let content = createWorkspace({ title: 'T' }).content;
  for (const label of ['A', 'B', 'C', 'D']) content = createConcept(content, { label, format: 'markdown' }).content;
  content = updateTagDeclarations(content, [{ id: 'basics', label: '基础' }]).content;
  content = updateConceptTags(content, { conceptId: 'c-1', tags: ['basics'] }).content;
  return updateConceptTags(content, { conceptId: 'c-2', tags: ['basics'] }).content;
}

const CONFIG: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['c-3'], known: ['c-1'] },
  questions: [
    { id: 'why', prompt: '为什么来', select: 'one', options: [
      { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['c-4'] }], next: 'known' },
      { id: 'browse', label: '随便逛逛', actions: [], next: 'finish' },
      { id: 'course', label: '上课', actions: [{ op: 'add-targets', points: ['c-3'] }] },
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
    expect(beginOrientation(plan)).toEqual({ targets: [], known: [], at: -1, trail: [] });
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
    expect(run.targets).toEqual(['c-3']);
    expect(run.known).toEqual(['c-1']);
    expect(currentQuestion(plan(), run)?.id).toBe('why');
    expect(isOrientationComplete(plan(), run)).toBe(false);
  });

  it('applies a single-select answer, follows its branch and records the trail', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    expect(run.targets).toEqual(['c-4']);
    expect(currentQuestion(p, run)?.id).toBe('known');
    expect(run.trail).toEqual([{ questionId: 'why', optionIds: ['paper'], optionLabels: ['论文'] }]);
  });

  it('expands tags on the way in and unions a multi-select answer', () => {
    const p = plan();
    const answered = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    const run = applyOrientationIntent(p, answered, { kind: 'answer', optionIds: ['basics', 'none'] });
    expect(run.known).toEqual(['c-1', 'c-2']);
    expect(isOrientationComplete(p, run)).toBe(true);
    expect(currentQuestion(p, run)).toBeNull();
  });

  it('falls through to the next question in document order when an option names no branch', () => {
    const p = plan();
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['course'] });
    expect(run.targets).toEqual(['c-3']);
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
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'set-targets', conceptIds: ['c-2', 'ghost'] });
    expect(run.targets).toEqual(['c-2']);
    expect(applyOrientationIntent(p, run, { kind: 'set-known', conceptIds: ['ghost'] }).known).toEqual([]);
  });

  it('restarts back to the seed, keeping the configuration', () => {
    const p = plan();
    const answered = applyOrientationIntent(p, beginOrientation(p), { kind: 'answer', optionIds: ['paper'] });
    expect(applyOrientationIntent(p, answered, { kind: 'restart' })).toEqual(beginOrientation(p));
  });

  it('drives the generic fallback through the same transitions', () => {
    const p = planOrientation(workspace());
    const run = applyOrientationIntent(p, beginOrientation(p), { kind: 'set-targets', conceptIds: ['c-1'] });
    expect(run.targets).toEqual(['c-1']);
    expect(() => applyOrientationIntent(p, run, { kind: 'answer', optionIds: ['paper'] })).toThrow();
  });
});

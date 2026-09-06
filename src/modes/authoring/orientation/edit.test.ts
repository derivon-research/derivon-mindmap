import { describe, expect, it } from 'vitest';
import { ORIENTATION_SCHEMA, emptyOrientationConfig, type OrientationConfig } from '../../../workspace/index';
import {
  addOption, addQuestion, moveQuestion, removeOption, removeQuestion, repairConceptReferences,
  setOptionActions, setSeed, updateOption, updateQuestion,
} from './edit';

const base: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['a'], known: [] },
  questions: [
    { id: 'why', prompt: '为什么', select: 'one', options: [
      { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['svd'] }], next: 'finish' },
    ] },
    { id: 'known', prompt: '会哪些', select: 'many', next: 'finish', options: [] },
  ],
};

describe('editing an orientation draft', () => {
  it('appends a question with an id nobody else uses', () => {
    const added = addQuestion(addQuestion(base));
    expect(added.questions.map((question) => question.id)).toEqual(['why', 'known', 'q-1', 'q-2']);
    expect(added.questions[2]).toEqual({ id: 'q-1', prompt: '', select: 'one', options: [] });
    expect(addQuestion(emptyOrientationConfig()).questions[0].id).toBe('q-1');
  });

  it('appends an option that is unique inside its own question only', () => {
    const added = addOption(addOption(base, 'known'), 'why');
    expect(added.questions[1].options.map((option) => option.id)).toEqual(['o-1']);
    expect(added.questions[0].options.map((option) => option.id)).toEqual(['paper', 'o-1']);
    expect(() => addOption(base, 'missing')).toThrow(/missing/);
  });

  it('edits prompts, selection mode and labels in place', () => {
    const edited = updateOption(updateQuestion(base, 'why', { prompt: '你为什么来' }), 'why', 'paper', { label: '读论文' });
    expect(edited.questions[0].prompt).toBe('你为什么来');
    expect(edited.questions[0].options[0].label).toBe('读论文');
  });

  it('drops per-option branches when a question becomes multi-select, because they would conflict', () => {
    const multi = updateQuestion(base, 'why', { select: 'many' });
    expect(multi.questions[0].options[0].next).toBeUndefined();
    // The question's own jump is left for the author to state, not guessed from the options.
    expect(multi.questions[0].next).toBeUndefined();
    expect(updateQuestion(multi, 'why', { next: 'known' }).questions[0].next).toBe('known');
  });

  it('removes a question and every jump that pointed at it', () => {
    const linked = updateOption(base, 'why', 'paper', { next: 'known' });
    const removed = removeQuestion(linked, 'known');
    expect(removed.questions.map((question) => question.id)).toEqual(['why']);
    expect(removed.questions[0].options[0].next).toBeUndefined();
  });

  it('removes an option without touching its siblings', () => {
    const two = addOption(base, 'why');
    expect(removeOption(two, 'why', 'paper').questions[0].options.map((option) => option.id)).toEqual(['o-1']);
  });

  it('reorders questions and refuses to move past either end', () => {
    expect(moveQuestion(base, 'known', -1).questions.map((question) => question.id)).toEqual(['known', 'why']);
    expect(moveQuestion(base, 'why', -1)).toBe(base);
    expect(moveQuestion(base, 'known', 1)).toBe(base);
  });

  it('replaces the restricted actions of one option', () => {
    const changed = setOptionActions(base, 'why', 'paper', [{ op: 'add-known', tags: ['basics'] }]);
    expect(changed.questions[0].options[0].actions).toEqual([{ op: 'add-known', tags: ['basics'] }]);
  });

  it('stores the seed as a snapshot of concepts', () => {
    expect(setSeed(base, { targets: ['a', 'b'], known: ['c'] }).seed).toEqual({ targets: ['a', 'b'], known: ['c'] });
  });

  it('repairs references to deleted concepts everywhere they are stored', () => {
    const repaired = repairConceptReferences({
      ...base,
      seed: { targets: ['a', 'gone'], known: ['gone'] },
      questions: [{ ...base.questions[0], options: [
        { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['svd', 'gone'] }], next: 'finish' },
        { id: 'only', label: '只有它', actions: [{ op: 'add-known', points: ['gone'] }], next: 'finish' },
      ] }, base.questions[1]],
    }, ['gone']);
    expect(repaired.seed).toEqual({ targets: ['a'], known: [] });
    expect(repaired.questions[0].options[0].actions).toEqual([{ op: 'set-targets', points: ['svd'] }]);
    // An action left with nothing to do is removed rather than kept as an empty action.
    expect(repaired.questions[0].options[1].actions).toEqual([]);
  });
});

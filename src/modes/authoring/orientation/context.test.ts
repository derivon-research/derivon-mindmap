import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, createConcept, createWorkspace, updateOrientation, type OrientationConfig,
} from '../../../workspace/index';
import { planOrientation } from '../../learning/orientation';
import { arrivalState, entriesReaching, entryOptions, optionContext } from './context';

const CONFIG: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['c-1'], known: [] },
  questions: [
    { id: 'why', prompt: '为什么', select: 'one', options: [
      { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['c-4'] }], next: 'svd-background' },
      { id: 'class', label: '上课', actions: [{ op: 'set-targets', points: ['c-3'] }], next: 'general' },
      { id: 'browse', label: '逛逛', actions: [], next: 'finish' },
    ] },
    { id: 'svd-background', prompt: '会哪些', select: 'many', next: 'finish', options: [
      { id: 'has-basics', label: '基础', actions: [{ op: 'add-known', points: ['c-1', 'c-2'] }] },
      { id: 'none', label: '不确定', actions: [] },
    ] },
    { id: 'general', prompt: '走到哪儿', select: 'one', options: [
      { id: 'start', label: '刚开始', actions: [{ op: 'set-known', points: ['c-1'] }], next: 'finish' },
    ] },
  ],
};

function plan() {
  let content = createWorkspace({ title: 'T' }).content;
  for (const label of ['A', 'B', 'C', 'D']) content = createConcept(content, { label, format: 'markdown' }).content;
  return planOrientation(updateOrientation(content, CONFIG).content);
}

describe('the assumption behind a follow-up route', () => {
  it('treats the opening options as the ways into the graph', () => {
    expect(entryOptions(plan()).map((option) => option.id)).toEqual(['paper', 'class', 'browse']);
  });

  it('reaches the opening question with no assumption at all', () => {
    expect(arrivalState(plan(), 'why', null)).toEqual({ targets: ['c-1'], known: [], at: 0, trail: [] });
  });

  it('offers only the entries that can actually reach a follow-up', () => {
    const p = plan();
    expect(entriesReaching(p, 'svd-background').map((option) => option.id)).toEqual(['paper']);
    expect(entriesReaching(p, 'general').map((option) => option.id)).toEqual(['class']);
    expect(arrivalState(p, 'general', 'paper')).toBeNull();
  });

  it('carries the entry answer into the arrival state and stops guessing there', () => {
    const arrived = arrivalState(plan(), 'svd-background', 'paper');
    expect(arrived).toEqual(expect.objectContaining({ targets: ['c-4'], known: [] }));
  });

  it('shows what one follow-up option adds on top of that arrival', () => {
    const context = optionContext(plan(), 'svd-background', 'has-basics', 'paper');
    expect(context!.before.known).toEqual([]);
    expect(context!.after.known).toEqual(['c-1', 'c-2']);
    expect(context!.after.targets).toEqual(['c-4']);
    // The author is inspecting a row, so the flow stays where it is.
    expect(context!.after.at).toBe(context!.before.at);
  });

  it('reports an option that changes nothing, which is the point of showing this at all', () => {
    const context = optionContext(plan(), 'svd-background', 'none', 'paper');
    expect(context!.after).toEqual(context!.before);
  });
});

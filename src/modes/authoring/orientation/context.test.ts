import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, parseWorkspaceContent, updateOrientation, type OrientationConfig,
} from '../../../workspace/index';
import { planOrientation } from '../../learning/orientation';
import { arrivalState, entriesReaching, entryOptions, optionContext } from './context';

const CONFIG: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['a'], known: [] },
  questions: [
    { id: 'why', prompt: '为什么', select: 'one', options: [
      { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['d'] }], next: 'svd-background' },
      { id: 'class', label: '上课', actions: [{ op: 'set-targets', points: ['c'] }], next: 'general' },
      { id: 'browse', label: '逛逛', actions: [], next: 'finish' },
    ] },
    { id: 'svd-background', prompt: '会哪些', select: 'many', next: 'finish', options: [
      { id: 'has-basics', label: '基础', actions: [{ op: 'add-known', points: ['a', 'b'] }] },
      { id: 'none', label: '不确定', actions: [] },
    ] },
    { id: 'general', prompt: '走到哪儿', select: 'one', options: [
      { id: 'start', label: '刚开始', actions: [{ op: 'set-known', points: ['a'] }], next: 'finish' },
    ] },
  ],
};

function plan() {
  const content = parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA, id: 'test-workspace',
    document: { title: 'T', description: '' },
    graph: { points: ['a', 'b', 'c', 'd'].map((id) => ({ id, data: { label: id.toUpperCase(), document: `docs/${id}` } })),
      hyperedges: [] },
  }), documents: {} });
  return planOrientation(updateOrientation(content, CONFIG).content);
}

describe('the assumption behind a follow-up route', () => {
  it('treats the opening options as the ways into the graph', () => {
    expect(entryOptions(plan()).map((option) => option.id)).toEqual(['paper', 'class', 'browse']);
  });

  it('reaches the opening question with no assumption at all', () => {
    // Only the seed is settled: no answer, no trail, and no probe round spent.
    expect(arrivalState(plan(), 'why', null))
      .toEqual({ targets: ['a'], known: [], at: 0, trail: [], asked: [], round: 0 });
  });

  it('offers only the entries that can actually reach a follow-up', () => {
    const p = plan();
    expect(entriesReaching(p, 'svd-background').map((option) => option.id)).toEqual(['paper']);
    expect(entriesReaching(p, 'general').map((option) => option.id)).toEqual(['class']);
    expect(arrivalState(p, 'general', 'paper')).toBeNull();
  });

  it('carries the entry answer into the arrival state and stops guessing there', () => {
    const arrived = arrivalState(plan(), 'svd-background', 'paper');
    expect(arrived).toEqual(expect.objectContaining({ targets: ['d'], known: [] }));
  });

  it('shows what one follow-up option adds on top of that arrival', () => {
    const context = optionContext(plan(), 'svd-background', 'has-basics', 'paper');
    expect(context!.before.known).toEqual([]);
    expect(context!.after.known).toEqual(['a', 'b']);
    expect(context!.after.targets).toEqual(['d']);
    // The author is inspecting a row, so the flow stays where it is.
    expect(context!.after.at).toBe(context!.before.at);
  });

  it('reports an option that changes nothing, which is the point of showing this at all', () => {
    const context = optionContext(plan(), 'svd-background', 'none', 'paper');
    expect(context!.after).toEqual(context!.before);
  });
});

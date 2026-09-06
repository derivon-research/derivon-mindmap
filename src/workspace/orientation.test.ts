import { describe, expect, it } from 'vitest';
import type { ManifestGraph } from './manifest';
import {
  ORIENTATION_SCHEMA,
  emptyOrientationConfig,
  orientationConceptReferences,
  parseOrientationConfig,
  resolveOrientationAction,
  serializeOrientationConfig,
  validateOrientationConfig,
  type OrientationConfig,
} from './orientation';

const point = (id: string, tags: string[] = []) => ({
  id, data: { label: id.toUpperCase(), document: `docs/${id}`, format: 'markdown' as const, tags },
});

const graph: ManifestGraph = {
  points: [point('a', ['basics']), point('b', ['basics']), point('svd', ['svd']), point('lonely')],
  hyperedges: [],
};
const declaredTags = [{ id: 'basics', label: '基础' }, { id: 'svd', label: 'SVD' }, { id: 'ghost', label: '空标签' }];

const config = (questions: OrientationConfig['questions'], seed = { targets: ['svd'], known: ['a'] }): OrientationConfig => ({
  schema: ORIENTATION_SCHEMA, seed, questions,
});

const codes = (value: OrientationConfig) =>
  validateOrientationConfig(value, graph, declaredTags).map((diagnostic) => diagnostic.code);

describe('derivon.orientation/v1 parsing', () => {
  it('parses a configuration with a seed, ordered questions and restricted actions', () => {
    const parsed = parseOrientationConfig(`${JSON.stringify({
      schema: ORIENTATION_SCHEMA,
      seed: { targets: ['svd'], known: ['a'] },
      questions: [{
        id: 'why', prompt: '为什么来', select: 'one',
        options: [{ id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['svd'] }], next: 'finish' }],
      }],
    })}\n`);
    expect(parsed.seed).toEqual({ targets: ['svd'], known: ['a'] });
    expect(parsed.questions[0].options[0].actions).toEqual([{ op: 'set-targets', points: ['svd'] }]);
  });

  it('refuses shapes that are not this schema, including unknown operations', () => {
    expect(() => parseOrientationConfig('{')).toThrow();
    expect(() => parseOrientationConfig(JSON.stringify({ schema: 'derivon.orientation/v2', seed: { targets: [], known: [] }, questions: [] })))
      .toThrow(/schema/);
    expect(() => parseOrientationConfig(JSON.stringify({ schema: ORIENTATION_SCHEMA, seed: { targets: [], known: [] } })))
      .toThrow(/questions/);
    expect(() => parseOrientationConfig(JSON.stringify({
      schema: ORIENTATION_SCHEMA, seed: { targets: [], known: [] },
      questions: [{ id: 'q', prompt: 'p', select: 'one', options: [{ id: 'o', label: 'l', actions: [{ op: 'run-code' }] }] }],
    }))).toThrow(/op/);
  });

  it('round trips through the canonical serialization without empty collections', () => {
    const value = emptyOrientationConfig();
    const text = serializeOrientationConfig(value);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseOrientationConfig(text)).toEqual(value);
  });
});

describe('derivon.orientation/v1 validation against the graph', () => {
  it('accepts a well-formed configuration', () => {
    expect(codes(config([
      { id: 'why', prompt: '为什么', select: 'one', options: [
        { id: 'paper', label: '论文', actions: [{ op: 'set-targets', points: ['svd'] }], next: 'known' },
        { id: 'browse', label: '随便逛逛', actions: [], next: 'finish' },
      ] },
      { id: 'known', prompt: '会哪些', select: 'many', next: 'finish', options: [
        { id: 'basics', label: '基础', actions: [{ op: 'add-known', tags: ['basics'] }] },
      ] },
    ]))).toEqual([]);
  });

  it('makes every dangling concept reference an error, in the seed and in actions', () => {
    expect(codes(config([
      { id: 'q', prompt: 'p', select: 'one', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-targets', points: ['ghost'] }], next: 'finish' },
      ] },
    ], { targets: ['nowhere'], known: ['a'] })))
      .toEqual(['dangling-concept', 'dangling-concept', 'empty-action']);
  });

  it('reports jumps to questions that do not exist and to the reserved finish id used as a question', () => {
    expect(codes(config([
      { id: 'finish', prompt: 'p', select: 'one', options: [{ id: 'o', label: 'l', actions: [], next: 'elsewhere' }] },
    ]))).toEqual(['reserved-id', 'dangling-next']);
  });

  it('refuses per-option branching on a multi-select question', () => {
    expect(codes(config([
      { id: 'q', prompt: 'p', select: 'many', next: 'finish', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', points: ['a'] }], next: 'finish' },
      ] },
    ]))).toEqual(['branch-on-multi']);
  });

  it('reports duplicate question and option ids', () => {
    expect(codes(config([
      { id: 'q', prompt: 'p', select: 'one', options: [
        { id: 'o', label: 'l', actions: [], next: 'finish' },
        { id: 'o', label: 'l2', actions: [], next: 'finish' },
      ] },
      { id: 'q', prompt: 'p2', select: 'one', options: [{ id: 'x', label: 'l', actions: [], next: 'finish' }] },
    ]))).toEqual(['duplicate-question', 'duplicate-option']);
  });

  it('treats a tag matching no concept and an action resolving to nothing as errors', () => {
    expect(codes(config([
      { id: 'q', prompt: 'p', select: 'many', next: 'finish', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', tags: ['ghost'] }] },
      ] },
    ]))).toEqual(['empty-tag', 'empty-action']);
  });

  it('downgrades an undeclared tag to a warning, because hand-written manifests stay usable', () => {
    expect(codes(config([
      { id: 'q', prompt: 'p', select: 'many', next: 'finish', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', tags: ['svd'] }] },
      ] },
    ]))).toEqual([]);
    const undeclared = validateOrientationConfig(config([
      { id: 'q', prompt: 'p', select: 'many', next: 'finish', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', tags: ['basics'] }] },
      ] },
    ]), graph, []);
    expect(undeclared).toEqual([expect.objectContaining({ severity: 'warning', code: 'undeclared-tag' })]);
  });

  it('warns about authoring slips that cannot break a route', () => {
    expect(codes(config([
      { id: 'q', prompt: '  ', select: 'one', next: 'finish', options: [] },
      { id: 'orphan', prompt: 'p', select: 'one', options: [{ id: 'o', label: '', actions: [], next: 'finish' }] },
    ]))).toEqual(['empty-prompt', 'no-options', 'unused-next', 'empty-label', 'unreachable']);
  });

  it('locates every diagnostic at the question and option the author must open', () => {
    const [diagnostic] = validateOrientationConfig(config([
      { id: 'q', prompt: 'p', select: 'one', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', points: ['nope'] }], next: 'finish' },
      ] },
    ]), graph, declaredTags);
    expect(diagnostic).toEqual({
      severity: 'error', code: 'dangling-concept',
      at: { questionId: 'q', optionId: 'o' }, message: expect.stringContaining('nope'),
    });
  });
});

describe('action resolution and reference inventory', () => {
  it('expands tags against the graph and keeps named concepts', () => {
    expect(resolveOrientationAction({ op: 'add-known', points: ['svd'], tags: ['basics'] }, graph))
      .toEqual(['svd', 'a', 'b']);
    expect(resolveOrientationAction({ op: 'add-known', tags: ['ghost'] }, graph)).toEqual([]);
  });

  it('inventories every stored concept reference, so a deletion plan can find them', () => {
    expect(orientationConceptReferences(config([
      { id: 'q', prompt: 'p', select: 'one', options: [
        { id: 'o', label: 'l', actions: [{ op: 'add-known', points: ['a', 'b'], tags: ['basics'] }], next: 'finish' },
      ] },
    ]))).toEqual([
      { conceptId: 'svd', at: { field: 'seed.targets' } },
      { conceptId: 'a', at: { field: 'seed.known' } },
      { conceptId: 'a', at: { field: 'action', questionId: 'q', optionId: 'o' } },
      { conceptId: 'b', at: { field: 'action', questionId: 'q', optionId: 'o' } },
    ]);
  });
});

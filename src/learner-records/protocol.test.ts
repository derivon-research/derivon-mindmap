import { describe, expect, it } from 'vitest';
import { LEARNING_SCHEMA, parseLearningState, serializeLearningState, validateLearningState } from './protocol';

const complete = { status: 'complete', basis: 'a'.repeat(64) };

const learning = {
  schema: LEARNING_SCHEMA,
  concepts: { 'c-k7f3q2': { ...complete, data: { selfReported: true } } },
  derivations: { 'h-2m9dxb': { status: 'incomplete', basis: 'b'.repeat(64), data: { notes: '方向搞反了' } } },
};

describe('derivon.learning/v1', () => {
  it('round-trips a record through its canonical text', () => {
    const parsed = parseLearningState(serializeLearningState(parseLearningState(JSON.stringify(learning))));
    expect(parsed.concepts['c-k7f3q2']).toEqual({ ...complete, data: { selfReported: true } });
    expect(parsed.derivations['h-2m9dxb'].status).toBe('incomplete');
  });

  it('requires both collections, so an empty record says so explicitly', () => {
    expect(validateLearningState({ schema: LEARNING_SCHEMA })).toEqual([
      expect.objectContaining({ path: 'concepts' }),
      expect.objectContaining({ path: 'derivations' }),
    ]);
    expect(parseLearningState(JSON.stringify({ schema: LEARNING_SCHEMA, concepts: {}, derivations: {} })))
      .toEqual({ concepts: {}, derivations: {} });
  });

  it('refuses a schema string that is not its own', () => {
    expect(validateLearningState({ ...learning, schema: 'derivon.learning/v2' }))
      .toContainEqual(expect.objectContaining({ path: 'schema' }));
    expect(() => parseLearningState(JSON.stringify({ ...learning, schema: 'derivon.learning/v2' }))).toThrow(/schema/);
  });

  it('reports an unknown key at the top level and inside a record', () => {
    expect(validateLearningState({ ...learning, progress: 3 }))
      .toContainEqual(expect.objectContaining({ path: 'progress' }));
    expect(validateLearningState({
      ...learning,
      concepts: { 'c-1': { ...complete, cursor: 2 } },
    })).toContainEqual(expect.objectContaining({ path: expect.stringContaining('cursor') }));
  });

  it('accepts only complete and incomplete', () => {
    expect(validateLearningState({ ...learning, concepts: { 'c-1': { status: 'done', basis: 'x' } } }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('status') }));
  });

  it('requires a basis', () => {
    expect(validateLearningState({ ...learning, concepts: { 'c-1': { status: 'complete' } } }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('basis') }));
  });

  it('holds basis to the SHA-256 hex the specification defines', () => {
    expect(validateLearningState({ ...learning, concepts: { 'c-1': { status: 'complete', basis: 'not-a-hash' } } }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('basis') }));
    expect(validateLearningState({ ...learning, concepts: { 'c-1': { status: 'complete', basis: 'A'.repeat(64) } } }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('basis') }));
  });

  it('makes incomplete carry a non-empty data object and lets complete omit it', () => {
    const incompleteWithout = validateLearningState({
      schema: LEARNING_SCHEMA, concepts: { 'c-1': { status: 'incomplete', basis: 'x' } },
    });
    expect(incompleteWithout).toContainEqual(expect.objectContaining({ path: expect.stringContaining('data') }));
    const incompleteEmpty = validateLearningState({
      schema: LEARNING_SCHEMA, concepts: { 'c-1': { status: 'incomplete', basis: 'x', data: {} } },
    });
    expect(incompleteEmpty).toContainEqual(expect.objectContaining({ path: expect.stringContaining('data') }));
    expect(validateLearningState({ schema: LEARNING_SCHEMA, concepts: { 'c-1': complete }, derivations: {} })).toEqual([]);
  });

  it('refuses to serialize a record its own validator would reject', () => {
    expect(() => serializeLearningState({ concepts: { 'c-1': { status: 'complete', basis: '' } }, derivations: {} }))
      .toThrow(/basis/);
  });

  it('fails on text that is not JSON', () => {
    expect(() => parseLearningState('{oops')).toThrow(/JSON/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  LEARNING_SCHEMA, ROUTES_SCHEMA,
  isRouteId, parseLearningState, parseRoutesState, serializeLearningState, serializeRoutesState,
  validateLearningState, validateRoutesState,
} from './protocol';

const complete = { status: 'complete', basis: 'a'.repeat(64) };

const learning = {
  schema: LEARNING_SCHEMA,
  concepts: { 'c-k7f3q2': { ...complete, data: { selfReported: true } } },
  derivations: { 'h-2m9dxb': { status: 'incomplete', basis: 'b'.repeat(64), data: { notes: '方向搞反了' } } },
};

const routes = {
  schema: ROUTES_SCHEMA,
  routes: [{
    id: 'r-k7f3q2',
    description: '从向量的线性无关走到 SVD',
    targets: ['c-svd'],
    known: ['c-span'],
    basis: 'c'.repeat(64),
    conceptIds: ['c-span', 'c-rank', 'c-svd'],
    derivationIds: ['h-rank', 'h-svd'],
    order: ['h-rank', 'h-svd'],
    cost: 2,
  }],
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

describe('derivon.routes/v1', () => {
  it('round-trips the spec example through its canonical text', () => {
    const parsed = parseRoutesState(serializeRoutesState(parseRoutesState(JSON.stringify(routes))));
    expect(parsed.routes).toHaveLength(1);
    expect(parsed.routes[0]).toEqual(routes.routes[0]);
  });

  it('requires the routes array', () => {
    expect(validateRoutesState({ schema: ROUTES_SCHEMA }))
      .toContainEqual(expect.objectContaining({ path: 'routes' }));
    expect(parseRoutesState(JSON.stringify({ schema: ROUTES_SCHEMA, routes: [] }))).toEqual({ routes: [] });
  });

  it('refuses a foreign schema and reports unknown keys at both levels', () => {
    expect(validateRoutesState({ ...routes, schema: ROUTES_SCHEMA + 'x' }))
      .toContainEqual(expect.objectContaining({ path: 'schema' }));
    expect(validateRoutesState({ ...routes, cursor: 1 }))
      .toContainEqual(expect.objectContaining({ path: 'cursor' }));
    expect(validateRoutesState({ ...routes, routes: [{ ...routes.routes[0], step: 1 }] }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('step') }));
  });

  it('holds a route id to the generated alphabet, prefix length and uniqueness', () => {
    for (const bad of ['k7f3q2', 'r-k7f3q', 'r-k7f3q20', 'r-K7F3Q2', 'r-k7f3qo']) {
      expect(isRouteId(bad), bad).toBe(false);
    }
    expect(isRouteId('r-k7f3q2')).toBe(true);
    const withBadId = { ...routes, routes: [{ ...routes.routes[0], id: 'route-1' }] };
    expect(validateRoutesState(withBadId)).toContainEqual(expect.objectContaining({ path: expect.stringContaining('id') }));
    const duplicated = { ...routes, routes: [routes.routes[0], { ...routes.routes[0] }] };
    expect(validateRoutesState(duplicated)).toContainEqual(expect.objectContaining({ path: expect.stringContaining('[1].id') }));
  });

  it('holds a route basis to the same SHA-256 hex as a mastery record', () => {
    expect(validateRoutesState({ ...routes, routes: [{ ...routes.routes[0], basis: 'abc' }] }))
      .toContainEqual(expect.objectContaining({ path: expect.stringContaining('basis') }));
  });

  it('requires the fields a confirmed route is written with', () => {
    const issues = validateRoutesState({
      schema: ROUTES_SCHEMA,
      routes: [{ id: 'r-k7f3q2' }],
    }).map((issue) => issue.path);
    for (const field of ['description', 'targets', 'known', 'basis', 'conceptIds', 'derivationIds', 'order', 'cost']) {
      expect(issues.some((path) => path.includes(field)), field).toBe(true);
    }
  });

  it('keeps cost in the manifest weight unit', () => {
    expect(validateRoutesState({ ...routes, routes: [{ ...routes.routes[0], cost: 2.25 }] })).not.toEqual([]);
    expect(validateRoutesState({ ...routes, routes: [{ ...routes.routes[0], cost: Number.POSITIVE_INFINITY }] })).not.toEqual([]);
    expect(validateRoutesState({ ...routes, routes: [{ ...routes.routes[0], cost: 2.5 }] })).toEqual([]);
  });

  it('refuses to serialize a route its own validator would reject', () => {
    expect(() => serializeRoutesState({ routes: [{ ...routes.routes[0], basis: '' }] })).toThrow(/basis/);
  });
});

import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA, parseDocument, uniqueId, validateDocument } from './domain';
import { sampleDocument } from './sample';

describe('authoring document', () => {
  it('round-trips the A B C D → X sample without projected objects', () => {
    const parsed = parseDocument(JSON.stringify(sampleDocument));
    expect(parsed.schema).toBe(DOCUMENT_SCHEMA);
    expect(parsed.graph.concepts.map((concept) => concept.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(parsed.graph.derivations).toHaveLength(7);
    expect(parsed.view.replacements).toEqual([{
      points: ['A', 'B'],
      replaceWith: 'X',
      show: 'points',
    }]);
    expect(JSON.stringify(parsed)).not.toContain('sourceHandle');
  });

  it('migrates v2 module views into view replacements', () => {
    const legacy = structuredClone(sampleDocument) as unknown as Record<string, any>;
    legacy.schema = 'derivon.authoring/v2';
    legacy.modules = [{ parent: 'X', concepts: ['A', 'B'], derivations: ['h-a'] }];
    legacy.view = { positions: legacy.view.positions, expanded: ['X'] };

    const parsed = parseDocument(JSON.stringify(legacy));
    expect(parsed.schema).toBe(DOCUMENT_SCHEMA);
    expect(parsed.view.replacements).toEqual([{
      points: ['A', 'B'],
      replaceWith: 'X',
      show: 'points',
    }]);
    expect(parsed).not.toHaveProperty('modules');
    expect(parsed.view).not.toHaveProperty('expanded');
  });

  it('rejects dangling references and duplicate premises', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.derivations[0].premises = ['missing', 'missing'];
    const issues = validateDocument(invalid);
    expect(issues.some((issue) => issue.message.includes('前提不能重复'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('未知概念'))).toBe(true);
  });

  it('rejects node id collisions and invalid view coordinates', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.derivations[0].id = 'A';
    invalid.view.positions.A = { x: Number.NaN, y: 0 };
    const issues = validateDocument(invalid);
    expect(issues.some((issue) => issue.message.includes('不能与概念 ID 相同'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('有限数值'))).toBe(true);
  });

  it('accepts nested replacement relations without defining parent concepts', () => {
    const nested = structuredClone(sampleDocument);
    nested.view.replacements = [
      { points: ['A', 'B'], replaceWith: 'C', show: 'points' },
      { points: ['C', 'D'], replaceWith: 'X', show: 'points' },
    ];
    expect(validateDocument(nested)).toEqual([]);
  });

  it('rejects ambiguous ownership and replacement cycles', () => {
    const overlapping = structuredClone(sampleDocument);
    overlapping.view.replacements = [
      { points: ['A', 'B'], replaceWith: 'C', show: 'points' },
      { points: ['A', 'D'], replaceWith: 'X', show: 'points' },
    ];
    expect(validateDocument(overlapping).some((issue) => issue.message.includes('替换点集'))).toBe(true);

    const cyclic = structuredClone(sampleDocument);
    cyclic.view.replacements = [
      { points: ['A'], replaceWith: 'B', show: 'points' },
      { points: ['B'], replaceWith: 'A', show: 'points' },
    ];
    expect(validateDocument(cyclic).some((issue) => issue.message.includes('形成循环'))).toBe(true);
  });

  it('generates readable ids without collision', () => {
    expect(uniqueId('c', ['c-1', 'c-2', 'c-4'])).toBe('c-3');
    expect(uniqueId('h', ['h-1'])).toBe('h-2');
  });
});

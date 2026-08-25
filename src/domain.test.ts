import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA, parseDocument, uniqueId, validateDocument } from './domain';
import { sampleDocument } from './sample';

describe('authoring document', () => {
  it('round-trips the A B C D → X sample without projected objects', () => {
    const parsed = parseDocument(JSON.stringify(sampleDocument));
    expect(parsed.schema).toBe(DOCUMENT_SCHEMA);
    expect(parsed.graph.points.map((point) => point.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(Object.keys(parsed.graph.points[0])).toEqual(['id', 'data']);
    expect(Object.keys(parsed.graph.hyperedges[0])).toEqual(['id', 'weight', 'tails', 'head', 'data']);
    expect(parsed.graph.hyperedges).toHaveLength(8);
    expect(parsed.view.replacements).toEqual([{
      points: ['A', 'B'],
      replaceWith: 'X',
      show: 'points',
    }]);
    expect(JSON.stringify(parsed)).not.toContain('sourceHandle');
  });

  it('rejects dangling references and duplicate tails', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.hyperedges[0].tails = ['missing', 'missing'];
    const issues = validateDocument(invalid);
    expect(issues.some((issue) => issue.message.includes('尾部不能重复'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('未知点'))).toBe(true);
  });

  it('rejects business fields outside data', () => {
    const invalid = structuredClone(sampleDocument) as unknown as Record<string, any>;
    invalid.graph.points[0].label = 'A';
    invalid.graph.hyperedges[0].introduction = '业务内容';
    const issues = validateDocument(invalid);
    expect(issues).toContainEqual({
      path: 'graph.points[0].label',
      message: '不允许出现在数学模型外层，请移入 data',
    });
    expect(issues).toContainEqual({
      path: 'graph.hyperedges[0].introduction',
      message: '不允许出现在数学模型外层，请移入 data',
    });
  });

  it('rejects node id collisions and invalid view coordinates', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.hyperedges[0].id = 'A';
    invalid.view.positions.A = { x: Number.NaN, y: 0 };
    const issues = validateDocument(invalid);
    expect(issues.some((issue) => issue.message.includes('不能与点 ID 相同'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('有限数值'))).toBe(true);
  });

  it('accepts nested replacement relations without defining parent objects', () => {
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

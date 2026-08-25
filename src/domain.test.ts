import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SCHEMA,
  formatWeight,
  normalizeWeight,
  parseDocument,
  uniqueId,
  validateDocument,
} from './domain';
import { sampleDocument } from './sample';

describe('authoring document', () => {
  it('round-trips the A B C D → X sample without projected objects', () => {
    const parsed = parseDocument(JSON.stringify(sampleDocument));
    expect(parsed.schema).toBe(DOCUMENT_SCHEMA);
    expect(parsed.graph.points.map((point) => point.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(Object.keys(parsed.graph.points[0])).toEqual(['id', 'data']);
    expect(parsed.graph.points[0].data).toEqual({ label: 'A', document: 'docs/concept-a', format: 'markdown' });
    expect(Object.keys(parsed.graph.hyperedges[0])).toEqual(['id', 'weight', 'tails', 'head', 'data']);
    expect(parsed.graph.hyperedges[0].data).toEqual({ document: 'docs/derivation-h-c', format: 'markdown' });
    expect(parsed.graph.hyperedges).toHaveLength(8);
    expect(parsed.view.replacements).toEqual([{
      points: ['A', 'B'],
      replaceWith: 'X',
      show: 'points',
    }]);
    expect(JSON.stringify(parsed)).not.toContain('sourceHandle');
  });

  it('accepts non-negative weights with at most one decimal place', () => {
    const valid = structuredClone(sampleDocument);
    valid.graph.hyperedges[0].weight = 2.3;
    expect(validateDocument(valid)).toEqual([]);
    expect(normalizeWeight(2.35)).toBe(2.4);
    expect(normalizeWeight(1.05)).toBe(1.1);
    expect(formatWeight(2.5)).toBe('2.5');

    const invalid = structuredClone(sampleDocument);
    invalid.graph.hyperedges[0].weight = 2.35;
    expect(validateDocument(invalid)).toContainEqual({
      path: 'graph.hyperedges[0].weight',
      message: '必须是非负且最多保留一位小数的有限数值',
    });
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

  it('rejects protected document directories and invalid formats', () => {
    const invalid = structuredClone(sampleDocument) as unknown as Record<string, any>;
    invalid.graph.points[0].data.document = '.derivon/concept-a';
    invalid.graph.points[1].data.format = 'text';
    const issues = validateDocument(invalid);
    expect(issues).toContainEqual({
      path: 'graph.points[0].data.document',
      message: '必须是工作区内的文档目录相对路径',
    });
    expect(issues).toContainEqual({
      path: 'graph.points[1].data.format',
      message: '必须为 markdown 或 html',
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

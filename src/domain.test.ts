import { describe, expect, it } from 'vitest';
import { parseDocument, uniqueId, validateDocument } from './domain';
import { sampleDocument } from './sample';

describe('authoring document', () => {
  it('round-trips the sample without projected React Flow edges', () => {
    const parsed = parseDocument(JSON.stringify(sampleDocument));
    expect(parsed.graph.concepts).toHaveLength(26);
    expect(parsed.graph.derivations).toHaveLength(28);
    expect(JSON.stringify(parsed)).not.toContain('sourceHandle');
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
    invalid.graph.derivations[0].id = 'a';
    invalid.view.positions.a = { x: Number.NaN, y: 0 };
    const issues = validateDocument(invalid);
    expect(issues.some((issue) => issue.message.includes('不能与概念 ID 相同'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('有限数值'))).toBe(true);
  });

  it('generates readable ids without collision', () => {
    expect(uniqueId('c', ['c-1', 'c-2', 'c-4'])).toBe('c-3');
    expect(uniqueId('h', ['h-1'])).toBe('h-2');
  });
});

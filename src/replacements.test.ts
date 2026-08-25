import { describe, expect, it } from 'vitest';
import { analyzeReplacement, replacementFromSelection } from './replacements';
import { sampleDocument } from './sample';

describe('replace with authoring rules', () => {
  it('creates a view relation from selected existing points to X', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [];
    const candidate = replacementFromSelection(document, ['A', 'B'], 'X');

    expect(candidate.analysis.issues).toEqual([]);
    expect(candidate.replacement).toEqual({
      points: ['A', 'B'],
      replaceWith: 'X',
      show: 'points',
    });
  });

  it('rejects using a selected point as its own replacement', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [];
    const candidate = replacementFromSelection(document, ['A', 'B'], 'A');
    expect(candidate.replacement).toBeNull();
    expect(candidate.analysis.issues.some((item) => item.code === 'self')).toBe(true);
  });

  it('allows a replacement point to participate in a second outer relation', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [{ points: ['A', 'B'], replaceWith: 'C', show: 'replacement' }];
    const analysis = analyzeReplacement(document, {
      points: ['C', 'D'],
      replaceWith: 'X',
      show: 'points',
    });
    expect(analysis.valid).toBe(true);
  });

  it('rejects direct point-set overlap', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [{ points: ['A', 'B'], replaceWith: 'C', show: 'points' }];
    const analysis = analyzeReplacement(document, {
      points: ['A', 'D'],
      replaceWith: 'X',
      show: 'points',
    });
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((item) => item.code === 'overlap')).toBe(true);
  });
});

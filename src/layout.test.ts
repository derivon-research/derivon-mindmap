import { describe, expect, it } from 'vitest';
import { layoutDocument, layoutNeighborhood } from './layout';
import { sampleDocument } from './sample';

describe('view layouts', () => {
  it('lays out every semantic node in the overview', () => {
    const positions = layoutDocument(sampleDocument);
    expect(Object.keys(positions)).toHaveLength(
      sampleDocument.graph.concepts.length + sampleDocument.graph.derivations.length,
    );
    expect(Object.values(positions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('anchors a compact neighborhood at the node position from the overview', () => {
    const document = structuredClone(sampleDocument);
    document.view.positions = layoutDocument(document);
    const ids = new Set(['a', 'h-3', 'c']);
    const positions = layoutNeighborhood(document, ids, 'a');
    expect(new Set(Object.keys(positions))).toEqual(ids);
    expect(positions.a).toEqual(document.view.positions.a);
    expect(positions.a.x).toBeLessThan(positions['h-3'].x);
    expect(positions['h-3'].x).toBeLessThan(positions.c.x);
  });
});

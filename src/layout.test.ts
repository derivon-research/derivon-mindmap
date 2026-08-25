import { describe, expect, it } from 'vitest';
import { layoutDocument, layoutNeighborhood } from './layout';
import { sampleDocument } from './sample';

describe('view layouts', () => {
  it('lays out every semantic node in the source graph', () => {
    const positions = layoutDocument(sampleDocument);
    expect(Object.keys(positions)).toHaveLength(
      sampleDocument.graph.points.length + sampleDocument.graph.hyperedges.length,
    );
    expect(Object.values(positions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('anchors a compact neighborhood at the node position from the overview', () => {
    const document = structuredClone(sampleDocument);
    document.view.positions = layoutDocument(document);
    const ids = new Set(['A', 'h-b', 'B']);
    const positions = layoutNeighborhood(document, ids, 'A');
    expect(new Set(Object.keys(positions))).toEqual(ids);
    expect(positions.A).toEqual(document.view.positions.A);
    expect(positions.A.x).toBeLessThan(positions['h-b'].x);
    expect(positions['h-b'].x).toBeLessThan(positions.B.x);
  });
});

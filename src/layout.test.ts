import { describe, expect, it } from 'vitest';
import { FORCE_LAYOUT_THRESHOLD, layoutDocument, layoutNeighborhood } from './layout';
import { sampleDocument } from './sample';

describe('view layouts', () => {
  it('keeps controlled graphs on the directed Dagre side of the hybrid threshold', () => {
    expect(FORCE_LAYOUT_THRESHOLD).toBe(400);
    const positions = layoutDocument(sampleDocument);
    expect(positions.A.x).toBeLessThan(positions['h-b'].x);
    expect(positions['h-b'].x).toBeLessThan(positions.B.x);
  });

  it('lays out every semantic node in the source graph', () => {
    const positions = layoutDocument(sampleDocument);
    expect(Object.keys(positions)).toHaveLength(
      sampleDocument.graph.points.length + sampleDocument.graph.hyperedges.length,
    );
    expect(Object.values(positions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('ignores replacement visibility because it is not layout input', () => {
    const changed = structuredClone(sampleDocument);
    changed.view.replacements[0].show = 'replacement';
    expect(layoutDocument(changed)).toEqual(layoutDocument(sampleDocument));
  });

  it('places parallel derivations at one shared group position', () => {
    const positions = layoutDocument(sampleDocument);
    expect(positions['h-b-alt']).toEqual(positions['h-b']);
  });

  it('lays out a 1,000-concept cyclic hypergraph deterministically', () => {
    const concepts = 1_000;
    const document = structuredClone(sampleDocument);
    document.graph.points = Array.from({ length: concepts }, (_, index) => ({
      id: `p-${index}`,
      data: { label: `Point ${index}`, document: `docs/p-${index}`, format: 'markdown' },
    }));
    document.graph.hyperedges = Array.from({ length: concepts }, (_, index) => ({
      id: `h-${index}`,
      weight: (index % 6) + 0.5,
      tails: [`p-${index}`, `p-${(index + concepts - 1) % concepts}`],
      head: `p-${(index + 1) % concepts}`,
      data: { document: `docs/h-${index}`, format: 'markdown' },
    }));

    const positions = layoutDocument(document);

    expect(Object.keys(positions)).toHaveLength(concepts * 2);
    expect(Object.values(positions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(layoutDocument(document)['p-0']).toEqual(positions['p-0']);

    const conceptsOnly = document.graph.points.map((point) => ({ id: point.id, ...positions[point.id] }));
    for (let left = 0; left < conceptsOnly.length; left += 1) {
      for (let right = left + 1; right < conceptsOnly.length; right += 1) {
        const a = conceptsOnly[left];
        const b = conceptsOnly[right];
        const separated = a.x + 136 + 10 <= b.x
          || b.x + 136 + 10 <= a.x
          || a.y + 64 + 10 <= b.y
          || b.y + 64 + 10 <= a.y;
        expect(separated, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  }, 30_000);

  it('anchors a compact neighborhood at the node position from the overview', () => {
    const document = structuredClone(sampleDocument);
    const overviewPositions = layoutDocument(document);
    const ids = new Set(['A', 'h-b', 'B']);
    const positions = layoutNeighborhood(document, ids, 'A', overviewPositions);
    expect(new Set(Object.keys(positions))).toEqual(ids);
    expect(positions.A).toEqual(overviewPositions.A);
    expect(positions.A.x).toBeLessThan(positions['h-b'].x);
    expect(positions['h-b'].x).toBeLessThan(positions.B.x);
    expect(Object.values(positions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });
});

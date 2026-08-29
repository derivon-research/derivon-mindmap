import { describe, expect, it } from 'vitest';
import {
  compoundPreview,
  connectionKind,
  cubicPoints,
  hitPort,
  marqueeIntersects,
  nodeBounds,
  portPosition,
  replacementAssistPath,
} from './graphGeometry';

describe('graph interaction geometry', () => {
  it('places typed concept and derivation ports on their semantic sides', () => {
    expect(portPosition({ x: 100, y: 80 }, 'concept', 'concept-in')).toEqual({ x: 32, y: 80 });
    expect(portPosition({ x: 100, y: 80 }, 'concept', 'concept-out')).toEqual({ x: 168, y: 80 });
    expect(portPosition({ x: 100, y: 80 }, 'derivation', 'premise-in')).toEqual({ x: 73, y: 80 });
    expect(portPosition({ x: 100, y: 80 }, 'derivation', 'conclusion-out')).toEqual({ x: 127, y: 80 });
  });

  it('uses a CSS-sized port hit target at every graph zoom', () => {
    const center = { x: 100, y: 80 };
    expect(hitPort({ x: 176, y: 80 }, center, 'concept', 'concept-out', 1)).toBe(true);
    expect(hitPort({ x: 250, y: 80 }, center, 'concept', 'concept-out', 0.1)).toBe(true);
    expect(hitPort({ x: 270, y: 80 }, center, 'concept', 'concept-out', 0.1)).toBe(false);
  });

  it('accepts only the three directed authoring gestures', () => {
    expect(connectionKind('concept', 'concept')).toBe('compound');
    expect(connectionKind('concept', 'derivation')).toBe('premise');
    expect(connectionKind('derivation', 'concept')).toBe('conclusion');
    expect(connectionKind('derivation', 'derivation')).toBeNull();
    expect(connectionKind('concept', 'concept', true)).toBeNull();
  });

  it('routes backward edges outside both endpoint cards', () => {
    const points = cubicPoints({ x: 300, y: 80 }, { x: 100, y: 120 });
    expect(points.control1.x).toBeGreaterThan(points.source.x);
    expect(points.control2.x).toBeLessThan(points.target.x);
  });

  it('builds a blue/red compound preview around a midpoint junction', () => {
    const preview = compoundPreview({ x: 0, y: 20 }, { x: 300, y: 80 });
    expect(preview.junction).toEqual({ x: 150, y: 50 });
    expect(preview.premise.target.x).toBe(123);
    expect(preview.conclusion.source.x).toBe(177);
  });

  it('fans direct members into one replacement arrow ending at the target card boundary', () => {
    const path = replacementAssistPath(
      { x: 400, y: 60 },
      [{ x: 100, y: 20 }, { x: 100, y: 100 }],
    );
    expect(path).toContainEqual(['M', 168, 20]);
    expect(path).toContainEqual(['M', 168, 100]);
    expect(path).toContainEqual(['L', 192, 100]);
    expect(path.at(-1)).toEqual(['L', 332, 60]);
  });

  it('routes a vertical replacement arrow between card boundaries', () => {
    const path = replacementAssistPath({ x: 100, y: 20 }, [{ x: 100, y: 160 }]);
    expect(path[0]).toEqual(['M', 100, 128]);
    expect(path).toContainEqual(['L', 100, 104]);
    expect(path.at(-1)).toEqual(['L', 100, 52]);
  });

  it('uses partial overlap for marquee selection', () => {
    const bounds = nodeBounds({ x: 100, y: 100 }, 'concept');
    expect(marqueeIntersects(bounds, { x: 20, y: 90 }, { x: 34, y: 110 })).toBe(true);
    expect(marqueeIntersects(bounds, { x: 0, y: 0 }, { x: 20, y: 20 })).toBe(false);
  });
});

/**
 * The card presentation: concept cards, derivation diamonds and the ported cubic between
 * them. Named for the neighbourhood it was drawn for, and also what a route is drawn with
 * — a route is read the way an author reads a neighbourhood, so the two share one look
 * rather than each getting a treatment of its own.
 *
 * The one thing that differs is which way the flow runs. An author reads a neighbourhood
 * left to right; a learner reads a route down the page, one step under the last. Ports and
 * curves follow that axis, because premises entering a card from its side while the cards
 * are stacked vertically is what makes a route look like a tangle.
 */
import { Cubic, Diamond, Label, Rect, register } from '@antv/g6';
import type { Point, RectStyleProps } from '@antv/g6';
import type { GraphMark } from './index';

export const NEIGHBOURHOOD_CONCEPT = 'mindmap-neighbourhood-concept';
export const NEIGHBOURHOOD_DERIVATION = 'mindmap-neighbourhood-derivation';
export const NEIGHBOURHOOD_EDGE = 'mindmap-neighbourhood-edge';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Which way the flow runs: `x` left to right, `y` top to bottom. */
export type CardAxis = 'x' | 'y';

type ConceptStyle = RectStyleProps & { identityText?: string };
type CurveStyle = { cardAxis?: CardAxis };

class NeighbourhoodConceptNode extends Rect {
  render(attributes = this.parsedAttributes, container: Parameters<Rect['render']>[1] = this): void {
    super.render(attributes, container);
    const style = attributes as ConceptStyle;
    this.upsert('identity', Label, style.identityText ? {
      background: false,
      x: 0,
      y: 12,
      text: style.identityText,
      fill: '#858c88',
      fontFamily: MONO_FONT,
      fontSize: 9,
      textAlign: 'center',
      textBaseline: 'middle',
      maxLines: 1,
      wordWrap: true,
      wordWrapWidth: 112,
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      zIndex: 2,
    } : false, container);
  }
}

// v0.4 control distances, kept local so geometry never depends on the legacy app. The
// same numbers along whichever axis the cards are laid out on.
function cubicControls(source: Point, target: Point, axis: CardAxis): [Point, Point] {
  const main = axis === 'y' ? 1 : 0;
  const cross = main === 0 ? 1 : 0;
  const distance = Math.abs(target[main] - source[main]);
  const point = (from: Point, offset: number): Point => {
    const control: [number, number] = [0, 0];
    control[main] = from[main] + offset;
    control[cross] = from[cross];
    return control;
  };
  if (target[main] >= source[main]) {
    const offset = Math.max(42, distance * 0.48);
    return [point(source, offset), point(target, -offset)];
  }
  const outward = Math.max(70, distance * 0.42 + 44);
  return [point(source, outward), point(target, -outward)];
}

class NeighbourhoodCubicEdge extends Cubic {
  protected getControlPoints(
    sourcePoint: Point,
    targetPoint: Point,
    _curvePosition: [number, number],
    _curveOffset: [number, number],
    controlPoints?: [Point, Point],
  ): [Point, Point] {
    if (controlPoints?.length === 2) return controlPoints;
    return cubicControls(sourcePoint, targetPoint, (this.parsedAttributes as CurveStyle).cardAxis ?? 'x');
  }
}

register('node', NEIGHBOURHOOD_CONCEPT, NeighbourhoodConceptNode);
register('node', NEIGHBOURHOOD_DERIVATION, Diamond);
register('edge', NEIGHBOURHOOD_EDGE, NeighbourhoodCubicEdge);

export function neighbourhoodNodeStyle(kind: 'concept' | 'derivation', marks: readonly GraphMark[], axis: CardAxis = 'x') {
  const concept = kind === 'concept';
  const has = (mark: GraphMark) => marks.includes(mark);
  const incoming = axis === 'y' ? 'top' as const : 'left' as const;
  const outgoing = axis === 'y' ? 'bottom' as const : 'right' as const;
  return {
    size: concept ? [136, 64] as [number, number] : [54, 54] as [number, number],
    fill: has('completed') ? '#f3f8f4' : has('known') ? '#f0f7f9' : concept ? '#fafbf9' : '#fff9f7',
    stroke: has('selected') ? '#9333ea' : has('current') ? '#dc2626' : has('target') ? '#a44f3f'
      : has('known') ? '#2f7087' : has('completed') ? '#4a765f' : concept ? '#6f7973' : '#8d5147',
    lineWidth: has('selected') || has('current') ? 3 : has('target') ? 2.4 : 1,
    opacity: has('muted') ? 0.35 : 1,
    radius: concept ? 2 : 0,
    labelPlacement: 'center' as const,
    labelOffsetY: concept ? -8 : 0,
    labelFill: concept ? '#252a27' : '#78392f',
    labelFontFamily: concept ? 'system-ui, sans-serif' : MONO_FONT,
    labelFontSize: concept ? 13 : 12,
    labelFontWeight: concept ? 650 : 700,
    labelMaxWidth: concept ? 112 : 40,
    labelMaxLines: 1,
    labelWordWrap: true,
    labelTextOverflow: 'ellipsis',
    labelPointerEvents: 'none' as const,
    ports: concept ? [
      { key: 'concept-in', placement: incoming, r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' as const },
      { key: 'concept-out', placement: outgoing, r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' as const },
    ] : [
      { key: 'premise-in', placement: incoming, r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' as const },
      { key: 'conclusion-out', placement: outgoing, r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' as const },
    ],
    port: true,
    portLinkToCenter: true,
  };
}

export function neighbourhoodEdgeStyle(kind: 'premise' | 'conclusion', axis: CardAxis = 'x') {
  const premise = kind === 'premise';
  return {
    stroke: premise ? '#2f7087' : '#a44f3f',
    lineWidth: premise ? 1.1 : 1.2,
    opacity: 1,
    endArrow: true,
    endArrowType: 'simple' as const,
    endArrowSize: 6,
    sourcePort: premise ? 'concept-out' : 'conclusion-out',
    targetPort: premise ? 'premise-in' : 'concept-in',
    pointerEvents: 'none' as const,
    cardAxis: axis,
  };
}

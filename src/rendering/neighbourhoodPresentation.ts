import { Cubic, Diamond, Label, Rect, register } from '@antv/g6';
import type { Point, RectStyleProps } from '@antv/g6';
import type { GraphMark } from './index';

export const NEIGHBOURHOOD_CONCEPT = 'mindmap-neighbourhood-concept';
export const NEIGHBOURHOOD_DERIVATION = 'mindmap-neighbourhood-derivation';
export const NEIGHBOURHOOD_EDGE = 'mindmap-neighbourhood-edge';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

type ConceptStyle = RectStyleProps & { identityText?: string };

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

// v0.4 control distances, kept local so geometry never depends on the legacy app.
function cubicControls(source: Point, target: Point): [Point, Point] {
  const distance = Math.abs(target[0] - source[0]);
  if (target[0] >= source[0]) {
    const offset = Math.max(42, distance * 0.48);
    return [[source[0] + offset, source[1]], [target[0] - offset, target[1]]];
  }
  const outward = Math.max(70, distance * 0.42 + 44);
  return [[source[0] + outward, source[1]], [target[0] - outward, target[1]]];
}

class NeighbourhoodCubicEdge extends Cubic {
  protected getControlPoints(
    sourcePoint: Point,
    targetPoint: Point,
    _curvePosition: [number, number],
    _curveOffset: [number, number],
    controlPoints?: [Point, Point],
  ): [Point, Point] {
    return controlPoints?.length === 2 ? controlPoints : cubicControls(sourcePoint, targetPoint);
  }
}

register('node', NEIGHBOURHOOD_CONCEPT, NeighbourhoodConceptNode);
register('node', NEIGHBOURHOOD_DERIVATION, Diamond);
register('edge', NEIGHBOURHOOD_EDGE, NeighbourhoodCubicEdge);

export function neighbourhoodNodeStyle(kind: 'concept' | 'derivation', marks: readonly GraphMark[]) {
  const concept = kind === 'concept';
  const has = (mark: GraphMark) => marks.includes(mark);
  return {
    size: concept ? [136, 64] : [54, 54],
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
      { key: 'concept-in', placement: 'left', r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' },
      { key: 'concept-out', placement: 'right', r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' },
    ] : [
      { key: 'premise-in', placement: 'left', r: 4.5, fill: '#2f7087', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' },
      { key: 'conclusion-out', placement: 'right', r: 4.5, fill: '#a44f3f', stroke: '#f7f7f5', lineWidth: 2, pointerEvents: 'none' },
    ],
    port: true,
    portLinkToCenter: true,
  };
}

export function neighbourhoodEdgeStyle(kind: 'premise' | 'conclusion') {
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
  };
}

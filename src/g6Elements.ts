import type { DisplayObjectConfig, Group } from '@antv/g';
import { Path as GPath, Polygon as GPolygon, Rect as GRect, Text as GText } from '@antv/g';
import type { Point } from '@antv/g6/esm/types';
import { Cubic } from '@antv/g6/esm/elements/edges/cubic';
import type { CubicStyleProps } from '@antv/g6/esm/elements/edges/cubic';
import { Diamond } from '@antv/g6/esm/elements/nodes/diamond';
import { Rect } from '@antv/g6/esm/elements/nodes/rect';
import type { RectStyleProps } from '@antv/g6/esm/elements/nodes/rect';
import { cubicPoints } from './graphGeometry';
import type { ProjectedReplacementRole } from './projection';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

type DerivonConceptStyle = RectStyleProps & {
  identityText?: string;
  showIdentity?: boolean;
  replacementDepth?: number;
  replacementRoles?: ProjectedReplacementRole[];
};

type DerivonDerivationStyle = RectStyleProps & {
  stackDepth?: number;
};

export class DerivonConceptNode extends Rect {
  constructor(options: DisplayObjectConfig<DerivonConceptStyle>) {
    super(options);
  }

  render(attributes = this.parsedAttributes, container: Group = this): void {
    super.render(attributes, container);
    const style = attributes as DerivonConceptStyle;
    const depthColor = style.replacementDepth === 1
      ? '#3d725c'
      : (style.replacementDepth ?? 0) > 1 ? '#9a5647' : null;
    this.upsert('replacement-depth', GRect, depthColor ? {
      x: -68,
      y: -31,
      width: 2,
      height: 62,
      fill: depthColor,
      pointerEvents: 'none',
      zIndex: 1,
    } : false, container);
    const memberRole = style.replacementRoles?.find((role) => role.role === 'member');
    const aggregateRole = style.replacementRoles?.find((role) => role.role === 'aggregate');
    const markerRoles = [memberRole, aggregateRole].filter(Boolean);
    const markerX = (role: 'member' | 'aggregate') => markerRoles.length > 1
      ? role === 'member' ? 37 : 53
      : 53;
    const markerY = -21;
    this.upsert('replacement-member', GPath, memberRole ? {
      d: [
        ['M', markerX('member') - 5, markerY - 5],
        ['L', markerX('member'), markerY],
        ['M', markerX('member') - 5, markerY + 5],
        ['L', markerX('member'), markerY],
        ['L', markerX('member') + 5, markerY],
      ],
      fill: 'none',
      stroke: '#5f766a',
      lineWidth: 1.3,
      pointerEvents: 'none',
      zIndex: 3,
    } : false, container);
    const aggregateX = markerX('aggregate');
    this.upsert('replacement-aggregate-back', GRect, aggregateRole ? {
      x: aggregateX - 4,
      y: markerY - 6,
      width: 9,
      height: 9,
      fill: '#dfe8e2',
      stroke: '#789083',
      lineWidth: 1,
      pointerEvents: 'none',
      zIndex: 2,
    } : false, container);
    this.upsert('replacement-aggregate-front', GRect, aggregateRole ? {
      x: aggregateX - 6,
      y: markerY - 3,
      width: 10,
      height: 9,
      fill: '#f7faf8',
      stroke: '#5f766a',
      lineWidth: 1,
      pointerEvents: 'none',
      zIndex: 3,
    } : false, container);
    this.upsert('replacement-count', GText, aggregateRole ? {
      x: aggregateX - 1,
      y: markerY + 1.5,
      text: aggregateRole.sourceCount > 99 ? '99+' : String(aggregateRole.sourceCount),
      fill: '#40584c',
      fontFamily: MONO_FONT,
      fontSize: aggregateRole.sourceCount > 99 ? 6 : 8,
      fontWeight: 700,
      textAlign: 'center',
      textBaseline: 'middle',
      pointerEvents: 'none',
      zIndex: 4,
    } : false, container);
    this.upsert('identity', GText, style.showIdentity && style.identityText ? {
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

export class DerivonDerivationNode extends Diamond {
  constructor(options: DisplayObjectConfig<DerivonDerivationStyle>) {
    super(options);
  }

  render(attributes = this.parsedAttributes, container: Group = this): void {
    const style = attributes as DerivonDerivationStyle;
    const stackDepth = Math.min(2, Math.max(0, Number(style.stackDepth ?? 0)));
    for (let layer = 2; layer >= 1; layer -= 1) {
      const offset = layer * 3;
      this.upsert(`stack-${layer}`, GPolygon, layer <= stackDepth ? {
        points: [[0 + offset, -27 - offset], [27 + offset, 0 - offset], [0 + offset, 27 - offset], [-27 + offset, 0 - offset]],
        fill: '#f3e9e6',
        stroke: '#b9877e',
        lineWidth: 1,
        opacity: layer === 1 ? 0.82 : 0.52,
        pointerEvents: 'none',
        zIndex: -layer,
      } : false, container);
    }
    super.render(attributes, container);
  }
}

export class DerivonCubicEdge extends Cubic {
  constructor(options: DisplayObjectConfig<CubicStyleProps>) {
    super(options);
  }

  protected getControlPoints(
    sourcePoint: Point,
    targetPoint: Point,
    _curvePosition: [number, number],
    _curveOffset: [number, number],
    controlPoints?: [Point, Point],
  ): [Point, Point] {
    if (controlPoints?.length === 2) return controlPoints;
    const points = cubicPoints(
      { x: sourcePoint[0], y: sourcePoint[1] },
      { x: targetPoint[0], y: targetPoint[1] },
    );
    return [
      [points.control1.x, points.control1.y],
      [points.control2.x, points.control2.y],
    ];
  }
}

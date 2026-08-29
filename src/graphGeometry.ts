import type { Position } from './domain';

export const CONCEPT_WIDTH = 136;
export const CONCEPT_HEIGHT = 64;
export const DERIVATION_SIZE = 54;
export const PORT_VISUAL_RADIUS = 4.5;
export const PORT_HOVER_RADIUS = 6.5;
export const PORT_HIT_RADIUS_CSS = 9;

export type GraphNodeKind = 'concept' | 'derivation';
export type GraphPortKey = 'concept-in' | 'concept-out' | 'premise-in' | 'conclusion-out';
export type GraphConnectionKind = 'premise' | 'conclusion' | 'compound';

export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type CubicPoints = {
  source: Position;
  control1: Position;
  control2: Position;
  target: Position;
};

export type PathCommand = ['M' | 'L', number, number];

export function nodeBounds(center: Position, kind: GraphNodeKind): Bounds {
  const width = kind === 'concept' ? CONCEPT_WIDTH : DERIVATION_SIZE;
  const height = kind === 'concept' ? CONCEPT_HEIGHT : DERIVATION_SIZE;
  return {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
  };
}

export function sourcePort(kind: GraphNodeKind): GraphPortKey {
  return kind === 'concept' ? 'concept-out' : 'conclusion-out';
}

export function targetPort(kind: GraphNodeKind): GraphPortKey {
  return kind === 'concept' ? 'concept-in' : 'premise-in';
}

export function portPosition(center: Position, kind: GraphNodeKind, port: GraphPortKey): Position {
  const bounds = nodeBounds(center, kind);
  const left = port === 'concept-in' || port === 'premise-in';
  return { x: left ? bounds.left : bounds.right, y: center.y };
}

export function hitPort(
  pointer: Position,
  center: Position,
  kind: GraphNodeKind,
  port: GraphPortKey,
  zoom = 1,
): boolean {
  const anchor = portPosition(center, kind, port);
  const radius = PORT_HIT_RADIUS_CSS / Math.max(0.08, zoom);
  return Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) <= radius;
}

export function connectionKind(
  sourceKind: GraphNodeKind,
  targetKind: GraphNodeKind,
  sameNode = false,
): GraphConnectionKind | null {
  if (sameNode) return null;
  if (sourceKind === 'concept' && targetKind === 'concept') return 'compound';
  if (sourceKind === 'concept' && targetKind === 'derivation') return 'premise';
  if (sourceKind === 'derivation' && targetKind === 'concept') return 'conclusion';
  return null;
}

export function cubicPoints(source: Position, target: Position): CubicPoints {
  const distance = Math.abs(target.x - source.x);
  if (target.x >= source.x) {
    const offset = Math.max(42, distance * 0.48);
    return {
      source,
      control1: { x: source.x + offset, y: source.y },
      control2: { x: target.x - offset, y: target.y },
      target,
    };
  }
  const outward = Math.max(70, distance * 0.42 + 44);
  return {
    source,
    control1: { x: source.x + outward, y: source.y },
    control2: { x: target.x - outward, y: target.y },
    target,
  };
}

export function replacementAssistPath(target: Position, members: Position[]): PathCommand[] {
  if (!members.length) return [];
  const ordered = [...members].sort((left, right) => left.y - right.y || left.x - right.x);
  const groupBounds = {
    left: Math.min(...ordered.map((member) => member.x - CONCEPT_WIDTH / 2)),
    right: Math.max(...ordered.map((member) => member.x + CONCEPT_WIDTH / 2)),
    top: Math.min(...ordered.map((member) => member.y - CONCEPT_HEIGHT / 2)),
    bottom: Math.max(...ordered.map((member) => member.y + CONCEPT_HEIGHT / 2)),
  };
  const groupCenter = {
    x: (groupBounds.left + groupBounds.right) / 2,
    y: (groupBounds.top + groupBounds.bottom) / 2,
  };
  const normalizedX = Math.abs(target.x - groupCenter.x) / ((groupBounds.right - groupBounds.left) / 2);
  const normalizedY = Math.abs(target.y - groupCenter.y) / ((groupBounds.bottom - groupBounds.top) / 2);
  const horizontal = normalizedX >= normalizedY;
  const commands: PathCommand[] = [];

  if (horizontal) {
    const direction = target.x >= groupCenter.x ? 1 : -1;
    const anchors = ordered.map((member) => ({
      x: member.x + direction * CONCEPT_WIDTH / 2,
      y: member.y,
    }));
    const collectorX = direction > 0
      ? Math.max(...anchors.map((anchor) => anchor.x)) + 24
      : Math.min(...anchors.map((anchor) => anchor.x)) - 24;
    anchors.forEach((anchor) => {
      commands.push(['M', anchor.x, anchor.y], ['L', collectorX, anchor.y]);
    });
    const minimumY = Math.min(...anchors.map((anchor) => anchor.y));
    const maximumY = Math.max(...anchors.map((anchor) => anchor.y));
    const joinY = anchors.reduce((sum, anchor) => sum + anchor.y, 0) / anchors.length;
    const targetAnchor = { x: target.x - direction * CONCEPT_WIDTH / 2, y: target.y };
    const elbowX = (collectorX + targetAnchor.x) / 2;
    commands.push(['M', collectorX, minimumY], ['L', collectorX, maximumY]);
    commands.push(
      ['M', collectorX, joinY],
      ['L', elbowX, joinY],
      ['L', elbowX, targetAnchor.y],
      ['L', targetAnchor.x, targetAnchor.y],
    );
    return commands;
  }

  const direction = target.y >= groupCenter.y ? 1 : -1;
  const anchors = ordered.map((member) => ({
    x: member.x,
    y: member.y + direction * CONCEPT_HEIGHT / 2,
  }));
  const collectorY = direction > 0
    ? Math.max(...anchors.map((anchor) => anchor.y)) + 24
    : Math.min(...anchors.map((anchor) => anchor.y)) - 24;
  anchors.forEach((anchor) => {
    commands.push(['M', anchor.x, anchor.y], ['L', anchor.x, collectorY]);
  });
  const minimumX = Math.min(...anchors.map((anchor) => anchor.x));
  const maximumX = Math.max(...anchors.map((anchor) => anchor.x));
  const joinX = anchors.reduce((sum, anchor) => sum + anchor.x, 0) / anchors.length;
  const targetAnchor = { x: target.x, y: target.y - direction * CONCEPT_HEIGHT / 2 };
  const elbowY = (collectorY + targetAnchor.y) / 2;
  commands.push(['M', minimumX, collectorY], ['L', maximumX, collectorY]);
  commands.push(
    ['M', joinX, collectorY],
    ['L', joinX, elbowY],
    ['L', targetAnchor.x, elbowY],
    ['L', targetAnchor.x, targetAnchor.y],
  );
  return commands;
}

export function compoundPreview(source: Position, target: Position): {
  junction: Position;
  premise: CubicPoints;
  conclusion: CubicPoints;
} {
  const junction = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  return {
    junction,
    premise: cubicPoints(source, { x: junction.x - DERIVATION_SIZE / 2, y: junction.y }),
    conclusion: cubicPoints({ x: junction.x + DERIVATION_SIZE / 2, y: junction.y }, target),
  };
}

export function boundsOverlap(left: Bounds, right: Bounds, gap = 0): boolean {
  return left.left < right.right + gap
    && left.right + gap > right.left
    && left.top < right.bottom + gap
    && left.bottom + gap > right.top;
}

export function marqueeIntersects(bounds: Bounds, start: Position, end: Position): boolean {
  const selection = {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
  return boundsOverlap(bounds, selection);
}

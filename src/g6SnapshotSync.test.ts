import { describe, expect, it } from 'vitest';
import type { G6SceneEdge, G6SceneNode, G6SceneSnapshot } from './g6SceneSnapshot';
import { planG6SnapshotSync } from './g6SnapshotSync';

function node(id: string): G6SceneNode {
  return {
    id,
    data: {
      kind: 'concept',
      label: id,
      semanticId: id,
      identity: id,
      showLabel: true,
      replacementDepth: 0,
      replacementRoles: [],
      replacementControls: [],
      stackDepth: 0,
      showIdentity: true,
      showPorts: true,
      portsEnabled: true,
      interactive: true,
      draggable: true,
      opacity: 1,
      zIndex: 1,
    },
    style: { x: 0, y: 0 },
    states: [],
  };
}

function edge(id: string, source: string, target: string): G6SceneEdge {
  return {
    id,
    source,
    target,
    data: {
      kind: 'conclusion',
      derivationId: source,
      sourcePort: 'conclusion-out',
      targetPort: 'concept-in',
      backward: false,
      opacity: 0.18,
    },
    states: [],
  };
}

function snapshot(nodes: G6SceneNode[], edges: G6SceneEdge[]): G6SceneSnapshot {
  return {
    nodes,
    edges,
    replacementAssists: [],
    overviewLod: false,
    visualNodeCount: nodes.length,
    visualEdgeCount: edges.length,
  };
}

describe('G6 snapshot synchronization planning', () => {
  it('does not remove an edge that G6 already cascade-deleted with a node', () => {
    const previous = snapshot([node('old'), node('target')], [edge('head:h', 'old', 'target')]);
    const next = snapshot([node('new'), node('target')], [edge('head:new', 'new', 'target')]);

    const plan = planG6SnapshotSync(previous, next, ['target'], []);

    expect(plan.removedEdgeIds).toEqual([]);
    expect(plan.removedNodeIds).toEqual([]);
    expect(plan.addedNodes.map(({ id }) => id)).toEqual(['new']);
    expect(plan.addedEdges.map(({ id }) => id)).toEqual(['head:new']);
  });

  it('recreates an edge whose stable ID changes endpoints before removing its old node', () => {
    const previousEdge = edge('head:active', 'old-derivation', 'target');
    const nextEdge = edge('head:active', 'new-derivation', 'target');
    const previous = snapshot([node('old-derivation'), node('target')], [previousEdge]);
    const next = snapshot([node('new-derivation'), node('target')], [nextEdge]);

    const plan = planG6SnapshotSync(
      previous,
      next,
      previous.nodes.map(({ id }) => id),
      [previousEdge],
    );

    expect(plan.removedEdgeIds).toEqual(['head:active']);
    expect(plan.removedNodeIds).toEqual(['old-derivation']);
    expect(plan.addedNodes.map(({ id }) => id)).toEqual(['new-derivation']);
    expect(plan.addedEdges).toEqual([nextEdge]);
    expect(plan.updatedEdges).toEqual([]);
  });
});

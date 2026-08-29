import { describe, expect, it } from 'vitest';
import { createGraphScene } from './graphScene';
import { hyperedgeGroupKey } from './hyperedgeGroups';
import { createGraphSceneRuntime, diffGraphSceneRuntime } from './graphSceneRuntime';
import { sampleDocument } from './sample';

const scene = createGraphScene(sampleDocument);
const positions = Object.fromEntries(scene.nodes.map((node, index) => [node.id, { x: index * 10, y: index * 5 }]));

describe('graph scene runtime', () => {
  it('assigns renderer-neutral focus, route, selection, and position state', () => {
    const runtime = createGraphSceneRuntime(scene, {
      positions,
      selectedIds: new Set(['A']),
      activeIds: new Set(['A', 'h-a']),
      routeIds: new Set(['A', 'B']),
      routeDerivationIds: new Set(['h-a']),
      routeStartIds: new Set(['A']),
      routeTargetIds: new Set(['B']),
      focusActive: true,
    });

    expect(runtime.nodes.find((node) => node.id === 'A')).toMatchObject({
      position: positions.A,
      selected: true,
      emphasized: true,
      dimmed: false,
      routeRole: 'start',
    });
    expect(runtime.nodes.find((node) => node.id === 'B')).toMatchObject({
      emphasized: false,
      dimmed: true,
      routeRole: 'target',
    });
    expect(runtime.edges.find((edge) => edge.derivationId === 'h-a')).toMatchObject({
      emphasized: true,
      dimmed: false,
      routeMember: true,
    });
  });

  it('matches an active parallel derivation by semantic ID while keeping the scene node ID stable', () => {
    const parallel = sampleDocument.graph.hyperedges.find((edge) => edge.id === 'h-b')!;
    const alternativeScene = createGraphScene(sampleDocument, {
      [hyperedgeGroupKey(parallel)]: 'h-b-alt',
    });
    const runtime = createGraphSceneRuntime(alternativeScene, {
      positions,
      activeIds: new Set(['h-b-alt']),
      focusActive: true,
    });

    expect(runtime.nodes.find((node) => node.kind === 'derivation' && node.semanticId === 'h-b-alt')).toMatchObject({
      id: 'h-b',
      emphasized: true,
      dimmed: false,
    });
  });

  it('separates pointer, drag, and connection eligibility from visual emphasis', () => {
    const runtime = createGraphSceneRuntime(scene, {
      positions,
      activeIds: new Set(['A', 'h-a']),
      hoveredId: 'A',
      focusActive: true,
      dragDisabled: true,
      connectionDisabled: true,
    });

    expect(runtime.nodes.find((node) => node.id === 'A')).toMatchObject({
      hovered: true,
      interactive: true,
      draggable: false,
      connectable: false,
    });
    expect(runtime.nodes.find((node) => node.id === 'D')).toMatchObject({
      hovered: false,
      dimmed: true,
      interactive: false,
      draggable: false,
      connectable: false,
    });
  });

  it('removes dimmed nodes from renderer selection state', () => {
    const runtime = createGraphSceneRuntime(scene, {
      positions,
      selectedIds: new Set(['D']),
      activeIds: new Set(['A', 'h-a']),
      focusActive: true,
    });
    expect(runtime.nodes.find((node) => node.id === 'D')?.selected).toBe(false);
  });

  it('reports only changed, added, and removed keyed elements', () => {
    const baseline = createGraphSceneRuntime(scene, { positions });
    const changed = createGraphSceneRuntime(scene, {
      positions: { ...positions, A: { x: 99, y: 42 } },
      selectedIds: new Set(['A']),
    });
    const next = {
      nodes: changed.nodes.filter((node) => node.id !== 'D'),
      edges: changed.edges.filter((edge) => edge.target !== 'D'),
      replacementAssists: changed.replacementAssists,
    };
    const diff = diffGraphSceneRuntime(baseline, next);

    expect(diff.nodes.added).toEqual([]);
    expect(diff.nodes.updated.map((node) => node.id)).toEqual(['A']);
    expect(diff.nodes.removed).toEqual(['D']);
    expect(diff.edges.removed.length).toBeGreaterThan(0);
  });
});

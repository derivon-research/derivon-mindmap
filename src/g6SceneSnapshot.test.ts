import { describe, expect, it } from 'vitest';
import type { GraphScene } from './graphScene';
import { createGraphSceneRuntime } from './graphSceneRuntime';
import { createG6SceneSnapshot } from './g6SceneSnapshot';

function largeScene(concepts: number): GraphScene {
  return {
    nodes: [
      ...Array.from({ length: concepts }, (_, index) => ({
        id: `p-${index}`,
        kind: 'concept' as const,
        label: `Concept ${index}`,
        depth: 0,
        replacementControls: [],
        replacementRoles: [],
      })),
      ...Array.from({ length: concepts }, (_, index) => ({
        id: `h-${index}`,
        kind: 'derivation' as const,
        semanticId: `h-${index}`,
        groupKey: `group-${index}`,
        weight: 1,
        premiseCount: 1,
        alternatives: [{ id: `h-${index}`, weight: 1 }],
      })),
    ],
    replacementAssists: [],
    edges: Array.from({ length: concepts }, (_, index) => ({
      id: `head:h-${index}`,
      kind: 'conclusion' as const,
      source: `h-${index}`,
      target: `p-${index}`,
      derivationId: `h-${index}`,
    })),
    semanticIds: new Set(),
  };
}

describe('G6 scene snapshot', () => {
  it('keeps card text, derivations, and edges at production workspace scale', () => {
    const concepts = 1_682;
    const scene = largeScene(concepts);
    const snapshot = createG6SceneSnapshot(createGraphSceneRuntime(scene, { positions: {} }));

    expect(snapshot.overviewLod).toBe(false);
    expect(snapshot.nodes).toHaveLength(concepts * 2);
    expect(snapshot.edges).toHaveLength(concepts);
    expect(snapshot.nodes.filter((node) => node.data.kind === 'concept').every((node) =>
      node.data.showLabel && node.data.showIdentity && node.data.showPorts,
    )).toBe(true);
    expect(snapshot.nodes.filter((node) => node.data.kind === 'derivation')).toHaveLength(concepts);
  });

  it('keeps card text and dimmed edges when a large graph enters focused view', () => {
    const concepts = 301;
    const scene = largeScene(concepts);
    const snapshot = createG6SceneSnapshot(createGraphSceneRuntime(scene, {
      positions: {},
      activeIds: new Set(['p-4', 'h-4']),
      focusActive: true,
    }));

    expect(snapshot.overviewLod).toBe(false);
    expect(snapshot.nodes).toHaveLength(concepts * 2);
    expect(snapshot.edges).toHaveLength(concepts);
    expect(snapshot.nodes.find((node) => node.id === 'p-5')?.data).toMatchObject({
      label: 'Concept 5',
      showLabel: true,
      showIdentity: true,
      opacity: 0.16,
    });
    expect(snapshot.nodes.find((node) => node.id === 'h-5')).toBeDefined();
    expect(snapshot.edges.find((edge) => edge.id === 'head:h-5')?.data.opacity).toBe(0.08);
  });

  it('updates a passive replacement arrow from runtime positions without layout metadata', () => {
    const scene: GraphScene = {
      nodes: ['A', 'B', 'X'].map((id) => ({
        id,
        kind: 'concept' as const,
        label: id,
        depth: 0,
        replacementControls: [],
        replacementRoles: [],
      })),
      edges: [],
      replacementAssists: [{
        id: 'replacement-assist:X',
        kind: 'replacement-assist',
        replaceWith: 'X',
        targetId: 'X',
        memberIds: ['A', 'B'],
      }],
      semanticIds: new Set(['A', 'B', 'X']),
    };
    const positions = {
      A: { x: 0, y: 160 },
      B: { x: 180, y: 160 },
      X: { x: 90, y: 0 },
    };
    const baseline = createG6SceneSnapshot(createGraphSceneRuntime(scene, { positions }));
    const moved = createG6SceneSnapshot(createGraphSceneRuntime(scene, {
      positions: { ...positions, B: { x: 204, y: 176 } },
    }));
    const focused = createG6SceneSnapshot(createGraphSceneRuntime(scene, {
      positions,
      activeIds: new Set(['A']),
      focusActive: true,
    }));
    const unrelatedFocus = createG6SceneSnapshot(createGraphSceneRuntime(scene, {
      positions,
      activeIds: new Set(),
      focusActive: true,
    }));
    const route = createG6SceneSnapshot(createGraphSceneRuntime(scene, { positions, routeActive: true }));

    expect(baseline.replacementAssists[0]?.path).not.toEqual(moved.replacementAssists[0]?.path);
    expect(baseline.replacementAssists[0]?.path.at(-1)).toEqual(['L', 158, 64]);
    expect(baseline.replacementAssists[0]?.opacity).toBe(0.55);
    expect(focused.replacementAssists[0]?.opacity).toBe(0.55);
    expect(unrelatedFocus.replacementAssists[0]?.opacity).toBe(0.14);
    expect(route.replacementAssists[0]?.opacity).toBe(0.14);
  });

  it('carries typed ports, replacement depth, and passive dimmed state into the adapter snapshot', () => {
    const scene = largeScene(2);
    const concept = scene.nodes.find((node) => node.kind === 'concept' && node.id === 'p-0')!;
    if (concept.kind === 'concept') concept.depth = 2;
    const runtime = createGraphSceneRuntime(scene, {
      positions: { 'p-0': { x: 0, y: 0 }, 'h-0': { x: 220, y: 0 } },
      activeIds: new Set(['p-0', 'h-0']),
      focusActive: true,
    });
    const snapshot = createG6SceneSnapshot(runtime);

    expect(snapshot.nodes.find((node) => node.id === 'p-0')?.data).toMatchObject({
      replacementDepth: 2,
      interactive: true,
      portsEnabled: true,
      opacity: 1,
      zIndex: 10,
    });
    expect(snapshot.nodes.find((node) => node.id === 'p-1')?.data).toMatchObject({
      interactive: false,
      portsEnabled: false,
      showPorts: false,
      opacity: 0.16,
      zIndex: 0,
    });
    expect(snapshot.edges[0]?.data).toMatchObject({
      sourcePort: 'conclusion-out',
      targetPort: 'concept-in',
      opacity: 1,
    });
  });
});

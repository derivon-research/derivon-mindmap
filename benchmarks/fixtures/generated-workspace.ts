import { DOCUMENT_SCHEMA, type Hyperedge, type Point } from '../../src/domain.ts';
import type { AuthoringWorkspace } from '../../src/workspace';

export type RuntimeWorkspaceFixture = {
  name: string;
  conceptCount: number;
  workspace: AuthoringWorkspace;
  interactions: {
    selectedConceptId: string;
    targetConceptId: string;
  };
};

export function createGeneratedRuntimeWorkspace(conceptCount: number): RuntimeWorkspaceFixture {
  if (!Number.isSafeInteger(conceptCount) || conceptCount < 100) {
    throw new RangeError('Runtime performance fixture requires at least 100 concepts');
  }

  const points = Array.from({ length: conceptCount }, (_, index): Point => ({
    id: `p-${index}`,
    data: { label: `Concept ${index}`, document: `docs/p-${index}`, format: 'html' },
  }));
  const hyperedges = Array.from({ length: conceptCount }, (_, index): Hyperedge => ({
    id: `h-${index}`,
    weight: (index % 6) + 0.5,
    tails: [`p-${index}`, `p-${(index + conceptCount - 1) % conceptCount}`],
    head: `p-${(index + 1) % conceptCount}`,
    data: { document: `docs/h-${index}`, format: 'html' },
  }));
  const files = Object.fromEntries([
    ...points.map((point) => [`${point.data.document}/index.html`, '']),
    ...hyperedges.map((hyperedge) => [`${hyperedge.data.document}/index.html`, '']),
  ]);

  return {
    name: `generated-cyclic-${conceptCount}`,
    conceptCount,
    workspace: {
      manifest: {
        schema: DOCUMENT_SCHEMA,
        document: {
          title: `Runtime performance ${conceptCount}`,
          description: 'Generated cyclic B-hypergraph runtime fixture',
        },
        graph: { points, hyperedges },
        view: { replacements: [] },
      },
      files,
    },
    interactions: {
      selectedConceptId: `p-${Math.floor(conceptCount / 2)}`,
      targetConceptId: `p-${Math.floor(conceptCount / 2) + 1}`,
    },
  };
}

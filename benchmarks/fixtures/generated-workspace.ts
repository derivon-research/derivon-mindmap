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

export type GeneratedWorkspaceGraph = {
  name: string;
  conceptCount: number;
  /** `derivon.workspace/v1` manifest text, as a `WorkspaceSource` would return it. */
  graph: string;
  /** The bodies a lazily reading session would find on disk, keyed by path. */
  documents: Record<string, string>;
  interactions: { conceptId: string; derivationId: string; deletedConceptId: string };
};

/**
 * The same generated topology as the legacy runtime fixture — a cyclic B-hypergraph with
 * joint tails — expressed in the v1 workspace protocol, so the two benchmarks describe the
 * same shape of graph rather than two conveniently different ones. No workspace content of
 * unverified provenance is republished here; every label is generated.
 */
export function createGeneratedWorkspaceGraph(conceptCount: number): GeneratedWorkspaceGraph {
  if (!Number.isSafeInteger(conceptCount) || conceptCount < 100) {
    throw new RangeError('Runtime performance fixture requires at least 100 concepts');
  }
  const points = Array.from({ length: conceptCount }, (_, index) => ({
    id: `c-${index}`,
    data: { label: `Concept ${index}`, document: `docs/concept-${index}` },
  }));
  const hyperedges = Array.from({ length: conceptCount }, (_, index) => ({
    id: `h-${index}`,
    weight: (index % 6) + 0.5,
    tails: [`c-${index}`, `c-${(index + conceptCount - 1) % conceptCount}`],
    head: `c-${(index + 1) % conceptCount}`,
    data: { document: `docs/derivation-${index}` },
  }));
  const graph = `${JSON.stringify({
    schema: 'derivon.workspace/v1', id: 'generated-workspace',
    document: { title: `Authoring performance ${conceptCount}`, description: 'Generated cyclic B-hypergraph' },
    tags: [],
    graph: { points, hyperedges },
  }, null, 2)}\n`;
  const documents = Object.fromEntries([
    ...points.map((point) => [`${point.data.document}/document.md`, `# ${point.data.label}\n`]),
    ...hyperedges.map((edge) => [`${edge.data.document}/document.md`, '# Derivation\n']),
  ]);
  const middle = Math.floor(conceptCount / 2);
  return {
    name: `generated-cyclic-v1-${conceptCount}`,
    conceptCount,
    graph,
    documents,
    // Deleting a concept takes the three derivations touching it, so the plan is never the
    // trivial one-object case.
    interactions: { conceptId: `c-${middle}`, derivationId: `h-${middle}`, deletedConceptId: `c-${middle + 2}` },
  };
}

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

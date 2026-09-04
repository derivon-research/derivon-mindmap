type GeneratedPoint = {
  id: string;
  data: { label: string; document: string; format: 'html' };
};

type GeneratedHyperedge = {
  id: string;
  weight: number;
  tails: string[];
  head: string;
  data: { document: string; format: 'html' };
};

export type RuntimeWorkspaceFixture = {
  name: string;
  concepts: number;
  workspace: {
    manifest: {
      schema: 'derivon.authoring/v0.3.0';
      document: { title: string; description: string };
      graph: { points: GeneratedPoint[]; hyperedges: GeneratedHyperedge[] };
      view: { replacements: [] };
    };
    files: Record<string, string>;
  };
  interactions: {
    selectedConceptId: string;
    targetConceptId: string;
  };
};

export function createGeneratedRuntimeWorkspace(concepts: number): RuntimeWorkspaceFixture {
  if (!Number.isSafeInteger(concepts) || concepts < 100) {
    throw new RangeError('Runtime performance fixture requires at least 100 concepts');
  }

  const points = Array.from({ length: concepts }, (_, index): GeneratedPoint => ({
    id: `p-${index}`,
    data: { label: `Concept ${index}`, document: `docs/p-${index}`, format: 'html' },
  }));
  const hyperedges = Array.from({ length: concepts }, (_, index): GeneratedHyperedge => ({
    id: `h-${index}`,
    weight: (index % 6) + 0.5,
    tails: [`p-${index}`, `p-${(index + concepts - 1) % concepts}`],
    head: `p-${(index + 1) % concepts}`,
    data: { document: `docs/h-${index}`, format: 'html' },
  }));
  const files = Object.fromEntries([
    ...points.map((point) => [`${point.data.document}/index.html`, '']),
    ...hyperedges.map((hyperedge) => [`${hyperedge.data.document}/index.html`, '']),
  ]);

  return {
    name: `generated-cyclic-${concepts}`,
    concepts,
    workspace: {
      manifest: {
        schema: 'derivon.authoring/v0.3.0',
        document: {
          title: `Runtime performance ${concepts}`,
          description: 'Generated cyclic B-hypergraph runtime fixture',
        },
        graph: { points, hyperedges },
        view: { replacements: [] },
      },
      files,
    },
    interactions: {
      selectedConceptId: `p-${Math.floor(concepts / 2)}`,
      targetConceptId: `p-${Math.floor(concepts / 2) + 1}`,
    },
  };
}

import { DOCUMENT_SCHEMA, type AuthoringDocument } from './domain';
import type { AuthoringWorkspace } from './workspace';
import example from './examples/replace-with/.derivon/workspace.json';
import navigationExample from './examples/math-reforged/.derivon/workspace.json';

const bundledDocuments = import.meta.glob('./examples/replace-with/docs/**/*.{md,html}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export const sampleDocument = example as AuthoringDocument;
export const sampleWorkspace: AuthoringWorkspace = {
  manifest: sampleDocument,
  files: Object.fromEntries(Object.entries(bundledDocuments).map(([path, content]) => [
    path.replace('./examples/replace-with/', ''),
    content,
  ])),
};

const navigationDocument = navigationExample as AuthoringDocument;

export const navigationSampleWorkspace: AuthoringWorkspace = {
  manifest: navigationDocument,
  files: {},
};

const graphTutorialPointIds = new Set([
  'linear-map',
  'null-range',
  'subspace',
  'injective-surjective',
  'surjective',
  'invertible',
]);
const graphTutorialHyperedgeIds = new Set([
  'null-space-def',
  'injective-def',
  'surjective-def',
]);
const nullSpaceDefinition = navigationDocument.graph.hyperedges.find((item) => item.id === 'null-space-def');

if (!nullSpaceDefinition) throw new Error('math-reforged example is missing null-space-def');

export type GraphTutorialStage =
  | 'base'
  | 'invertible-single'
  | 'invertible-complete'
  | 'surjective-parallel'
  | 'null-space-updated';

const graphTutorialManifest: AuthoringDocument = {
  schema: DOCUMENT_SCHEMA,
  document: {
    title: '线性映射：零空间与可逆性',
    description: '从线性代数案例理解概念、推导、平行实现、学习成本和整体/细分视图。',
  },
  graph: {
    points: navigationDocument.graph.points.filter((point) => graphTutorialPointIds.has(point.id)),
    hyperedges: [
      ...navigationDocument.graph.hyperedges.filter((hyperedge) => graphTutorialHyperedgeIds.has(hyperedge.id)),
      {
        ...nullSpaceDefinition,
        id: 'null-space-equations',
        weight: 3,
        data: { document: 'docs/derivation-null-space-equations', format: 'markdown' },
      },
    ],
  },
  view: { replacements: [] },
};

const graphTutorialFiles: Record<string, string> = {
  'docs/concept-linear-map/document.md': '# 线性映射\n\n保持向量加法与标量乘法的映射。',
  'docs/concept-null-range/document.md': '# 零空间\n\n线性映射中所有被映到零向量的输入组成的子空间。',
  'docs/derivation-null-space-def/document.md': '# 由定义理解零空间\n\n从线性映射的定义出发，考察满足 $T(v)=0$ 的全部向量。',
  'docs/derivation-null-space-equations/document.md': '# 由齐次方程理解零空间\n\n把线性映射写成矩阵后，零空间对应齐次线性方程组 $Ax=0$ 的解集。',
  'docs/derivation-tutorial-invertible/document.md': '# 可逆线性映射\n\n由单射与满射共同刻画可逆线性映射。',
  'docs/derivation-tutorial-surjective/document.md': '# 满射的另一种推导\n\n这是教程中创建的平行推导示例。',
};

const tutorialHyperedge = (
  id: string,
  tails: string[],
  head: string,
  weight: number,
  document: string,
): AuthoringDocument['graph']['hyperedges'][number] => ({
  id,
  tails,
  head,
  weight,
  data: { document, format: 'markdown' },
});

export function graphTutorialWorkspaceForStage(
  stage: GraphTutorialStage,
  withReplacement = false,
): AuthoringWorkspace {
  const includeInvertible = stage !== 'base';
  const completeInvertible = stage !== 'base' && stage !== 'invertible-single';
  const includeSurjectiveParallel = stage === 'surjective-parallel' || stage === 'null-space-updated';
  const hyperedges = graphTutorialManifest.graph.hyperedges.map((edge) =>
    edge.id === 'null-space-def' && stage === 'null-space-updated'
      ? { ...edge, tails: ['linear-map', 'subspace'] }
      : edge,
  );
  if (includeInvertible) {
    hyperedges.push(tutorialHyperedge(
      'tutorial-invertible',
      completeInvertible ? ['injective-surjective', 'surjective'] : ['injective-surjective'],
      'invertible',
      1,
      'docs/derivation-tutorial-invertible',
    ));
  }
  if (includeSurjectiveParallel) {
    hyperedges.push(tutorialHyperedge(
      'tutorial-surjective',
      ['linear-map'],
      'surjective',
      2,
      'docs/derivation-tutorial-surjective',
    ));
  }
  return {
    manifest: {
      ...graphTutorialManifest,
      graph: { ...graphTutorialManifest.graph, hyperedges },
      view: {
        replacements: withReplacement ? [{
          points: ['injective-surjective', 'surjective'],
          replaceWith: 'invertible',
          show: 'points',
        }] : [],
      },
    },
    files: graphTutorialFiles,
  };
}

export const graphTutorialWorkspace = graphTutorialWorkspaceForStage('base');
export const graphTutorialWorkspaceWithReplacement = graphTutorialWorkspaceForStage('null-space-updated', true);

export function createEmptyWorkspace(): AuthoringWorkspace {
  return {
    manifest: {
      schema: DOCUMENT_SCHEMA,
      document: {
        title: '未命名项目',
        description: '',
      },
      graph: { points: [], hyperedges: [] },
      view: { replacements: [] },
    },
    files: {},
  };
}

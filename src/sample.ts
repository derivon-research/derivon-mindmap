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
  'invertible-bijection',
]);
const nullSpaceDefinition = navigationDocument.graph.hyperedges.find((item) => item.id === 'null-space-def');

if (!nullSpaceDefinition) throw new Error('math-reforged example is missing null-space-def');

const graphTutorialManifest: AuthoringDocument = {
  schema: DOCUMENT_SCHEMA,
  document: {
    title: '线性映射：零空间与可逆性',
    description: '从线性代数案例理解概念、推导、平行实现、学习成本和整体/细分视图。',
    updatedAt: navigationDocument.document.updatedAt,
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
  view: { positions: {}, replacements: [] },
};

const graphTutorialFiles: Record<string, string> = {
  'docs/concept-linear-map/document.md': '# 线性映射\n\n保持向量加法与标量乘法的映射。',
  'docs/concept-null-range/document.md': '# 零空间\n\n线性映射中所有被映到零向量的输入组成的子空间。',
  'docs/derivation-null-space-def/document.md': '# 由定义理解零空间\n\n从线性映射的定义出发，考察满足 $T(v)=0$ 的全部向量。',
  'docs/derivation-null-space-equations/document.md': '# 由齐次方程理解零空间\n\n把线性映射写成矩阵后，零空间对应齐次线性方程组 $Ax=0$ 的解集。',
};

export const graphTutorialWorkspace: AuthoringWorkspace = {
  manifest: graphTutorialManifest,
  files: graphTutorialFiles,
};

export const graphTutorialWorkspaceWithReplacement: AuthoringWorkspace = {
  manifest: {
    ...graphTutorialManifest,
    view: {
      ...graphTutorialManifest.view,
      replacements: [{
        points: ['injective-surjective', 'surjective'],
        replaceWith: 'invertible',
        show: 'points',
      }],
    },
  },
  files: graphTutorialFiles,
};

export function createEmptyWorkspace(): AuthoringWorkspace {
  return {
    manifest: {
      schema: DOCUMENT_SCHEMA,
      document: {
        title: '未命名项目',
        description: '',
        updatedAt: new Date().toISOString(),
      },
      graph: { points: [], hyperedges: [] },
      view: { positions: {}, replacements: [] },
    },
    files: {},
  };
}

import { DOCUMENT_SCHEMA, type AuthoringDocument } from './domain';
import type { AuthoringWorkspace } from './workspace';
import example from './examples/replace-with/.derivon/workspace.json';

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

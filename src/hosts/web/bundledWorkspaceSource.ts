import { companionFilesIn, type WorkspaceSource } from '../../ports/WorkspaceSource';
import exampleGraph from '../../examples/math-reforged/.derivon/workspace.json?raw';
import exampleOrientation from '../../examples/math-reforged/.derivon/orientation.json?raw';

const exampleDocuments = import.meta.glob('../../examples/math-reforged/docs/**/document.md', {
  import: 'default',
  query: '?raw',
}) as Record<string, () => Promise<string>>;

// Companion documents are read at opening, so the route files are bundled eagerly.
const exampleRoutes = import.meta.glob('../../examples/math-reforged/.derivon/routes/*.json', {
  import: 'default',
  query: '?raw',
  eager: true,
}) as Record<string, string>;

export type BundledWorkspace = {
  graph: string;
  documents?: Readonly<Record<string, string | (() => Promise<string>)>>;
  assets?: Readonly<Record<string, Uint8Array>>;
  companionMetadata?: Readonly<Record<string, string>>;
};

function missing(kind: string, path: string): Error {
  return new Error(`Bundled workspace is missing ${kind} \`${path}\``);
}

export function createBundledWorkspaceSource(bundle: BundledWorkspace): WorkspaceSource {
  return {
    async readGraph() {
      return bundle.graph;
    },
    async readDocument(path) {
      const document = bundle.documents?.[path];
      if (document === undefined) throw missing('document', path);
      return typeof document === 'function' ? document() : document;
    },
    async readAsset(path) {
      const asset = bundle.assets?.[path];
      if (asset === undefined) throw missing('asset', path);
      return asset.slice();
    },
    async readCompanionMetadata(path) {
      return bundle.companionMetadata?.[path] ?? null;
    },
    async listCompanionFiles(directory) {
      return companionFilesIn(Object.keys(bundle.companionMetadata ?? {}), directory);
    },
  };
}

export const bundledExampleWorkspaceSource = createBundledWorkspaceSource({
  graph: exampleGraph,
  // The bundled workspace ships an orientation configuration, so the web build opens into
  // the author's questions, and workspace routes a learner can walk as they are.
  companionMetadata: {
    '.derivon/orientation.json': exampleOrientation,
    ...Object.fromEntries(Object.entries(exampleRoutes).map(([path, text]) => [
      path.replace('../../examples/math-reforged/', ''),
      text,
    ])),
  },
  documents: Object.fromEntries(Object.entries(exampleDocuments).map(([path, content]) => [
    path.replace('../../examples/math-reforged/', ''),
    content,
  ])),
});

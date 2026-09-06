import type { WorkspaceSource } from '../../ports/WorkspaceSource';
import exampleGraph from '../../examples/replace-with/.derivon/workspace.json?raw';
import exampleOrientation from '../../examples/replace-with/.derivon/orientation.json?raw';

const exampleDocuments = import.meta.glob('../../examples/replace-with/docs/**/*.{md,html}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export type BundledWorkspace = {
  graph: string;
  documents?: Readonly<Record<string, string>>;
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
      return document;
    },
    async readAsset(path) {
      const asset = bundle.assets?.[path];
      if (asset === undefined) throw missing('asset', path);
      return asset.slice();
    },
    async readCompanionMetadata(path) {
      return bundle.companionMetadata?.[path] ?? null;
    },
  };
}

export const bundledExampleWorkspaceSource = createBundledWorkspaceSource({
  graph: exampleGraph,
  // The bundled workspace ships an orientation configuration, so the web build opens into
  // the author's questions.
  companionMetadata: { '.derivon/orientation.json': exampleOrientation },
  documents: Object.fromEntries(Object.entries(exampleDocuments).map(([path, content]) => [
    path.replace('../../examples/replace-with/', ''),
    content,
  ])),
});

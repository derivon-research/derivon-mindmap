/**
 * A writable `WorkspaceSource` over in-memory maps, for tests that open a session or render a
 * mode without a host filesystem. Commits are applied to the maps and recorded, so a test can
 * assert what a change wrote. It has no revision: it is never changed behind the session's
 * back unless the test mutates `files` or `assets` itself.
 */
import {
  companionFilesIn, type WorkspaceCommit, type WritableWorkspaceSource,
} from '../ports/WorkspaceSource';

const MANIFEST_PATH = '.derivon/workspace.json';

export type MemoryWorkspace = {
  source: WritableWorkspaceSource;
  /** Every text file by workspace-relative path: the manifest, documents and companion files. */
  files: Map<string, string>;
  assets: Map<string, Uint8Array>;
  /** Every commit the source accepted, in order. */
  commits: WorkspaceCommit[];
};

export function createMemoryWorkspaceSource(graph: string, initial: {
  documents?: Readonly<Record<string, string>>;
  companionMetadata?: Readonly<Record<string, string>>;
  assets?: Readonly<Record<string, Uint8Array>>;
} = {}): MemoryWorkspace {
  const files = new Map<string, string>([
    [MANIFEST_PATH, graph],
    ...Object.entries(initial.documents ?? {}),
    ...Object.entries(initial.companionMetadata ?? {}),
  ]);
  const assets = new Map(Object.entries(initial.assets ?? {}).map(([path, bytes]) => [path, new Uint8Array(bytes)]));
  const commits: WorkspaceCommit[] = [];
  const source: WritableWorkspaceSource = {
    async readGraph() { return files.get(MANIFEST_PATH)!; },
    async readDocument(path) {
      if (!files.has(path)) throw new Error(`Missing: ${path}`);
      return files.get(path)!;
    },
    async readAsset(path) {
      const bytes = assets.get(path);
      if (!bytes) throw new Error(`Missing: ${path}`);
      return new Uint8Array(bytes);
    },
    async readCompanionMetadata(path) { return files.get(path) ?? null; },
    async listCompanionFiles(directory) { return companionFilesIn(files.keys(), directory); },
    async listOwnedFiles(directory) {
      return [...files.keys(), ...assets.keys()].filter((path) => path.startsWith(`${directory}/`)).sort();
    },
    async commit(changes) {
      commits.push(changes);
      if (changes.graph !== undefined) files.set(MANIFEST_PATH, changes.graph);
      for (const change of [...changes.documents ?? [], ...changes.companionMetadata ?? []]) {
        if (change.content === null) files.delete(change.path);
        else files.set(change.path, change.content);
      }
      for (const change of changes.assets ?? []) {
        if (change.content === null) assets.delete(change.path);
        else assets.set(change.path, new Uint8Array(change.content));
      }
    },
  };
  return { source, files, assets, commits };
}

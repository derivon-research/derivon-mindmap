export interface WorkspaceSource {
  readGraph(): Promise<string>;
  readDocument(path: string): Promise<string>;
  readAsset(path: string): Promise<Uint8Array>;
  readCompanionMetadata(path: string): Promise<string | null>;
  /**
   * The files directly inside one companion directory under `.derivon` (for example
   * `.derivon/routes`), as sorted workspace-relative paths. Opening a workspace needs this to
   * find companion documents stored one file each, such as workspace routes.
   *
   * The contract: the directory must be strictly inside `.derivon`; only direct child files
   * are reported, never a subdirectory or anything below one; a symlink, whether the
   * directory, an entry in it, or a directory on the way to it, is refused rather than
   * followed; and a directory that does not exist is an empty listing, not a failure.
   */
  listCompanionFiles(directory: string): Promise<readonly string[]>;
  /** Opaque content observation token; absent for immutable sources. Not an atomic filesystem snapshot. */
  revision?(): Promise<string>;
}

/**
 * `listCompanionFiles` for a source that holds its files as a set of paths rather than a
 * filesystem: the bundled web workspace and the in-memory test source. It refuses the same
 * directories the desktop host refuses; symlinks cannot occur in a path set.
 */
export function companionFilesIn(paths: Iterable<string>, directory: string): string[] {
  const segments = directory.split('/');
  if (segments.length < 2 || segments[0] !== '.derivon'
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`\`${directory}\` is not a companion directory inside \`.derivon\``);
  }
  const prefix = `${directory}/`;
  return [...new Set(paths)]
    .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export type WorkspaceTextChange = {
  /** Refuse an existing target during commit preparation; not a concurrency guarantee. */
  createOnly?: true;
  path: string;
  content: string | null;
};

export type WorkspaceAssetChange = {
  path: string;
  content: Uint8Array | null;
};

export type WorkspaceCommit = {
  /** Reject a commit when the source no longer matches the accepted content version. */
  expectedRevision?: string;
  /** Initialize only absent files; reject collisions instead of overwriting a workspace. */
  createOnly?: true;
  graph?: string;
  documents?: readonly WorkspaceTextChange[];
  assets?: readonly WorkspaceAssetChange[];
  companionMetadata?: readonly WorkspaceTextChange[];
};

export interface WritableWorkspaceSource extends WorkspaceSource {
  /** Revision-capable hosts must return the version produced by this write, not a later external observation. */
  commit(changes: WorkspaceCommit): Promise<string | void>;
  /**
   * Every file stored under one object's owned directory, as workspace-relative paths,
   * including assets no document mentions. Two callers need what a document scan cannot see:
   * deleting an object needs the files it would take with it, and a mastery judgement's
   * content basis covers every file under the object's directory
   * (`docs/learner-records.md`).
   *
   * It is a read and nothing more, but it sits on the writable source because a source that
   * cannot commit cannot delete, so it is never asked what an object owns; a learning-only
   * host grants just this function through `LearningModeProps.readOwnedFiles`.
   *
   * The contract, which the caller checks again rather than trusts: the directory must be
   * one the manifest claims as an object's own, so this is never a recursive listing of an
   * arbitrary workspace path; nothing outside it is ever reported; a symlink anywhere under
   * it is refused rather than followed; and a directory that is already gone is an empty
   * inventory, not a failure.
   */
  listOwnedFiles(directory: string): Promise<readonly string[]>;
}

export interface WorkspaceSource {
  readGraph(): Promise<string>;
  readDocument(path: string): Promise<string>;
  readAsset(path: string): Promise<Uint8Array>;
  readCompanionMetadata(path: string): Promise<string | null>;
  /** Opaque content observation token; absent for immutable sources. Not an atomic filesystem snapshot. */
  revision?(): Promise<string>;
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
   * including assets no document mentions. Deleting an object needs what the host can see
   * and a document scan cannot.
   *
   * The contract, which the caller checks again rather than trusts: the directory must be
   * one the manifest claims as an object's own, so this is never a recursive listing of an
   * arbitrary workspace path; nothing outside it is ever reported; a symlink anywhere under
   * it is refused rather than followed; and a directory that is already gone is an empty
   * inventory, not a failure.
   */
  listOwnedFiles(directory: string): Promise<readonly string[]>;
}

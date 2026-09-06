export interface WorkspaceSource {
  readGraph(): Promise<string>;
  readDocument(path: string): Promise<string>;
  readAsset(path: string): Promise<Uint8Array>;
  readCompanionMetadata(path: string): Promise<string | null>;
  /** Changes whenever source content changes; absent for immutable sources such as the web bundle. */
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
  /** Returns the source revision after a successful commit when the host can provide one. */
  commit(changes: WorkspaceCommit): Promise<string | void>;
}

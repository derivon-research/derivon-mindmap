/**
 * The raw-file port for learner records: `state.json` and one file per personal route, for
 * one workspace id. It says nothing about the record protocols — `src/learner-records/` and
 * `src/workspace/route.ts` own those — and nothing about where the files live, because the host
 * computes the one layout (`docs/learner-records.md`).
 *
 * `write` and `deleteRoute` are compare-and-swap on one file: `precondition` is the version the
 * caller read, and a write whose precondition no longer holds refuses rather than overwrites.
 * That version is a digest of the file's bytes — the file-level precondition the specification
 * calls compare-and-swap on the file. It is deliberately not a record's `basis`: `basis` says
 * what workspace content a record was made against and is data inside the record, so guarding
 * a write with it would let two writers updating different records each succeed and lose one.
 */

/**
 * Which record file: the one `state.json`, or the personal route whose id is `id`. A host
 * refuses an `id` that is not a route id, so no id can name a file outside `routes/`.
 */
export type LearnerRecordFile =
  | { readonly kind: 'state' }
  | { readonly kind: 'route'; readonly id: string };

export type LearnerRecordFileRead =
  /** An absent file is an absent record, not an error. */
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly text: string; readonly version: string };

export type LearnerRecordWritePrecondition =
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly version: string };

export interface LearnerRecordFiles {
  read(workspaceId: string, file: LearnerRecordFile): Promise<LearnerRecordFileRead>;
  /** Replace the file atomically and return the version the caller must read back with. */
  write(
    workspaceId: string,
    file: LearnerRecordFile,
    text: string,
    precondition: LearnerRecordWritePrecondition,
  ): Promise<string>;
  /** Delete one personal route, only if it is still at the version the caller read. */
  deleteRoute(workspaceId: string, routeId: string, version: string): Promise<void>;
  /**
   * The names of the files directly under `routes/`, sorted; a missing directory is an empty
   * list. Which of them are route files is the route protocol's rule (`isRouteFileName`), not
   * the host's. A symlink there is refused, not followed.
   */
  listRoutes(workspaceId: string): Promise<readonly string[]>;
}

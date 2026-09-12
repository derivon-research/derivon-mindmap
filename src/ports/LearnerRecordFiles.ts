/**
 * The raw-file port for learner records: read and replace one of the two record files for
 * one workspace id. It says nothing about the record protocols — `src/learner-records/`
 * owns those — and nothing about where the files live, because the host computes the one
 * layout (`docs/learner-records.md`).
 *
 * `write` is compare-and-swap on the file: `precondition` is the version the caller read, and
 * a write whose precondition no longer holds refuses rather than overwrites. That version is a
 * digest of the file's bytes — the file-level precondition the specification calls
 * compare-and-swap on the file. It is deliberately not a record's `basis`: `basis` says what
 * workspace content a judgement was made against and is data inside the record, so guarding a
 * write with it would let two writers updating different records each succeed and lose one.
 */
export type LearnerRecordFileName = 'state' | 'routes';

export type LearnerRecordFileRead =
  /** An absent file is an absent record, not an error. */
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly text: string; readonly version: string };

export type LearnerRecordWritePrecondition =
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly version: string };

export interface LearnerRecordFiles {
  read(workspaceId: string, file: LearnerRecordFileName): Promise<LearnerRecordFileRead>;
  /** Replace the file atomically and return the version the caller must read back with. */
  write(
    workspaceId: string,
    file: LearnerRecordFileName,
    text: string,
    precondition: LearnerRecordWritePrecondition,
  ): Promise<string>;
}

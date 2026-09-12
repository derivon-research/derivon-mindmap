/**
 * The application-side store for one workspace's learner records. It binds the record
 * protocols to the raw-file port: a read parses and reports an unreadable record rather than
 * treating it as empty; a write serializes, lets the protocol refuse a bad record before any
 * file is touched, and replaces the file under the precondition the caller read.
 *
 * The store never derives a key: the workspace id it is constructed with is the whole key,
 * so a copied workspace shares the record and no folder path can fork one (ADR-0009).
 */
import type { LearnerRecordFiles, LearnerRecordWritePrecondition } from '../ports/LearnerRecordFiles';
import {
  parseLearningState, parseRoutesState, serializeLearningState, serializeRoutesState,
  type LearningState, type RoutesState,
} from './protocol';

export type StoredLearningState =
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly state: LearningState; readonly version: string };

export type StoredRoutes =
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly state: RoutesState; readonly version: string };

export type LearnerRecordStore = {
  readLearningState(): Promise<StoredLearningState>;
  readRoutes(): Promise<StoredRoutes>;
  /** Returns the new version. Refuses a record the protocol rejects, before writing. */
  writeLearningState(state: LearningState, precondition: LearnerRecordWritePrecondition): Promise<string>;
  writeRoutes(state: RoutesState, precondition: LearnerRecordWritePrecondition): Promise<string>;
};

export function createLearnerRecordStore(
  files: LearnerRecordFiles,
  workspaceId: string,
): LearnerRecordStore {
  return {
    async readLearningState() {
      const read = await files.read(workspaceId, 'state');
      if (read.presence === 'missing') return { presence: 'missing' };
      // An unreadable record is reported as one; it never becomes an empty record.
      return { presence: 'present', state: parseLearningState(read.text), version: read.version };
    },
    async readRoutes() {
      const read = await files.read(workspaceId, 'routes');
      if (read.presence === 'missing') return { presence: 'missing' };
      return { presence: 'present', state: parseRoutesState(read.text), version: read.version };
    },
    async writeLearningState(state, precondition) {
      // The serializer is the guard: it refuses exactly what the reader would. `async` keeps
      // a refusal a rejected promise rather than a synchronous throw at the call site.
      return files.write(workspaceId, 'state', serializeLearningState(state), precondition);
    },
    async writeRoutes(state, precondition) {
      return files.write(workspaceId, 'routes', serializeRoutesState(state), precondition);
    },
  };
}

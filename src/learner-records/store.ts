/**
 * The application-side store for one workspace's learner records. It binds the record
 * protocols to the raw-file port: a read parses and reports an unreadable record rather than
 * treating it as empty; a write serializes, lets the protocol refuse a bad record before any
 * file is touched, and replaces the file under the precondition the caller read.
 *
 * Personal routes are one file each. Listing them reads every file and reports each on its
 * own, so one unreadable route never hides the others and is never dropped from the list.
 * Validating a route against the graph is not the store's business: it has no graph.
 *
 * The store never derives a key: the workspace id it is constructed with is the whole key,
 * so a copied workspace shares the record and no folder path can fork one (ADR-0009).
 */
import type { LearnerRecordFiles, LearnerRecordWritePrecondition } from '../ports/LearnerRecordFiles';
import {
  decodeRoute, errorMessage, isRouteFileName, routeFileName, routeIdOfFileName, serializeRoute,
  type Route, type RouteFileIssue,
} from '../workspace/index';
import { parseLearningState, serializeLearningState, type LearningState } from './protocol';

export type StoredLearningState =
  | { readonly presence: 'missing' }
  | { readonly presence: 'present'; readonly state: LearningState; readonly version: string };

/**
 * One file under `routes/`, as read. A file that could not be read or decoded is `unreadable`
 * with its reasons; it stays in the list. `routeId` is the id the file name stands for, or
 * null when the name is not `<route id>.json` — such a file cannot be addressed by id, so it
 * cannot be rewritten or deleted from here either.
 */
export type StoredPersonalRoute =
  | {
    readonly status: 'ready';
    readonly fileName: string;
    readonly routeId: string;
    readonly route: Route;
    readonly version: string;
  }
  | {
    readonly status: 'unreadable';
    readonly fileName: string;
    readonly routeId: string | null;
    readonly issues: readonly RouteFileIssue[];
    /** The version to delete it under, when the file could be read at all. */
    readonly version: string | null;
  };

export type StoredPersonalRouteRead = { readonly presence: 'missing' } | ({ readonly presence: 'present' } & StoredPersonalRoute);

export type LearnerRecordStore = {
  readLearningState(): Promise<StoredLearningState>;
  /** Returns the new version. Refuses a record the protocol rejects, before writing. */
  writeLearningState(state: LearningState, precondition: LearnerRecordWritePrecondition): Promise<string>;
  /** Every route file, each read and decoded on its own, in file-name order. */
  listRoutes(): Promise<readonly StoredPersonalRoute[]>;
  readRoute(routeId: string): Promise<StoredPersonalRouteRead>;
  /**
   * Write `route` to `routes/<route.id>.json`. The personal-route serializer is the guard: a
   * route without `basis`, or with any shape error, is refused before a file is touched. Graph
   * errors need the graph; `savePersonalRoute` refuses those. Returns the new version.
   */
  writeRoute(route: Route, precondition: LearnerRecordWritePrecondition): Promise<string>;
  /** Delete one route file, only if it is still at `version`. Touches nothing else. */
  deleteRoute(routeId: string, version: string): Promise<void>;
};

export function createLearnerRecordStore(
  files: LearnerRecordFiles,
  workspaceId: string,
): LearnerRecordStore {
  const readRouteFile = async (fileName: string): Promise<StoredPersonalRouteRead> => {
    const routeId = routeIdOfFileName(fileName);
    if (routeId === null) {
      return {
        presence: 'present', status: 'unreadable', fileName, routeId, version: null,
        issues: [{ code: 'unreadable', message: `文件名 ${fileName} 不是「路线 id.json」` }],
      };
    }
    let read;
    try {
      read = await files.read(workspaceId, { kind: 'route', id: routeId });
    } catch (error) {
      return {
        presence: 'present', status: 'unreadable', fileName, routeId, version: null,
        issues: [{ code: 'unreadable', message: errorMessage(error) }],
      };
    }
    if (read.presence === 'missing') return { presence: 'missing' };
    const decoded = decodeRoute(read.text);
    return decoded.route
      ? { presence: 'present', status: 'ready', fileName, routeId, route: decoded.route, version: read.version }
      : { presence: 'present', status: 'unreadable', fileName, routeId, issues: decoded.issues, version: read.version };
  };

  return {
    async readLearningState() {
      const read = await files.read(workspaceId, { kind: 'state' });
      if (read.presence === 'missing') return { presence: 'missing' };
      // An unreadable record is reported as one; it never becomes an empty record.
      return { presence: 'present', state: parseLearningState(read.text), version: read.version };
    },
    async writeLearningState(state, precondition) {
      // The serializer is the guard: it refuses exactly what the reader would. `async` keeps
      // a refusal a rejected promise rather than a synchronous throw at the call site.
      return files.write(workspaceId, { kind: 'state' }, serializeLearningState(state), precondition);
    },
    async listRoutes() {
      const names = (await files.listRoutes(workspaceId)).filter(isRouteFileName);
      const read = await Promise.all(names.map(readRouteFile));
      // A file deleted between the listing and its read is simply no longer there.
      return read.flatMap((entry) => {
        if (entry.presence === 'missing') return [];
        const { presence: _presence, ...stored } = entry;
        return [stored];
      });
    },
    readRoute(routeId) {
      return readRouteFile(routeFileName(routeId));
    },
    async writeRoute(route, precondition) {
      return files.write(workspaceId, { kind: 'route', id: route.id }, serializeRoute(route, 'personal'), precondition);
    },
    async deleteRoute(routeId, version) {
      return files.deleteRoute(workspaceId, routeId, version);
    },
  };
}

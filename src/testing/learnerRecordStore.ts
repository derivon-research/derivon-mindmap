/**
 * A learner-record store in memory, for a test that cares what the application wrote rather
 * than how the file got to disk. The shape mirrors the desktop port: `state.json` and one
 * `routes/<id>.json` per personal route, an absent file is an absent record, and a write or a
 * delete carries the version the caller read.
 */
import { createLearnerRecordStore, type LearnerRecordStore, type LearningState } from '../learner-records';
import type { LearnerRecordFile, LearnerRecordFiles } from '../ports/LearnerRecordFiles';
import { decodeRoute, isRouteId, serializeRoute, type Route } from '../workspace/index';

export type MemoryLearnerRecords = {
  readonly store: LearnerRecordStore;
  /** Every personal route file that decodes, in file-name order. */
  routes(): readonly Route[];
  /** The names of the files under `routes/`, sorted. */
  routeFileNames(): readonly string[];
  /** The raw text of `routes/<id>.json`, or null when the file is absent. */
  routeText(routeId: string): string | null;
  /** The raw `state.json` text, or null when the file is absent. */
  stateText(): string | null;
};

const STATE = 'state.json';
const routePath = (fileName: string) => `routes/${fileName}`;

export function createMemoryLearnerRecords(
  workspaceId = 'test-workspace',
  initial: {
    /** Personal routes, each written as its own file with the canonical text. */
    readonly routes?: readonly Route[];
    /** Raw files under `routes/` by file name, for a test that needs one the reader refuses. */
    readonly routeTexts?: Readonly<Record<string, string>>;
    readonly state?: LearningState;
    /** Every write and delete loses, for a test about a refusal staying visible. */
    readonly failWrites?: boolean;
  } = {},
): MemoryLearnerRecords {
  const files = new Map<string, { readonly text: string; readonly version: number }>();
  let versions = 0;
  for (const route of initial.routes ?? []) {
    files.set(routePath(`${route.id}.json`), { text: serializeRoute(route, 'personal'), version: ++versions });
  }
  for (const [fileName, text] of Object.entries(initial.routeTexts ?? {})) {
    files.set(routePath(fileName), { text, version: ++versions });
  }
  if (initial.state) {
    files.set(STATE, { text: JSON.stringify({ schema: 'derivon.learning/v1', ...initial.state }), version: ++versions });
  }
  const pathOf = (file: LearnerRecordFile) => {
    if (file.kind === 'state') return STATE;
    if (!isRouteId(file.id)) throw new Error(`${file.id} 不是路线 id`);
    return routePath(`${file.id}.json`);
  };
  const claim = (key: string, expected: string | null) => {
    if (initial.failWrites) throw new Error(`学习者记录已被其他写入方更新（${key}）`);
    const entry = files.get(key);
    if ((entry === undefined ? null : String(entry.version)) !== expected) {
      throw new Error(`学习者记录已被其他写入方更新（${key}）`);
    }
  };
  const routeFileNames = () => [...files.keys()]
    .filter((key) => key.startsWith('routes/'))
    .map((key) => key.slice('routes/'.length))
    .sort();
  const port: LearnerRecordFiles = {
    async read(_workspaceId, file) {
      const entry = files.get(pathOf(file));
      return entry === undefined
        ? { presence: 'missing' }
        : { presence: 'present', text: entry.text, version: String(entry.version) };
    },
    async write(_workspaceId, file, text, precondition) {
      const key = pathOf(file);
      claim(key, precondition.presence === 'present' ? precondition.version : null);
      files.set(key, { text, version: ++versions });
      return String(versions);
    },
    async deleteRoute(_workspaceId, routeId, version) {
      const key = pathOf({ kind: 'route', id: routeId });
      claim(key, version);
      files.delete(key);
    },
    async listRoutes() {
      return routeFileNames();
    },
  };
  const store = createLearnerRecordStore(port, workspaceId);
  return {
    store,
    routes: () => routeFileNames().flatMap((name) => {
      const decoded = decodeRoute(files.get(routePath(name))!.text);
      return decoded.route ? [decoded.route] : [];
    }),
    routeFileNames,
    routeText: (routeId) => files.get(routePath(`${routeId}.json`))?.text ?? null,
    stateText: () => files.get(STATE)?.text ?? null,
  };
}

/**
 * A learner-record store in memory, for a test that cares what the application wrote rather
 * than how the file got to disk. The shape mirrors the desktop port: an absent file is an
 * absent record, and a write carries the version the caller read.
 */
import { createLearnerRecordStore, type LearnerRecordStore, type LearningState, type RouteRecord } from '../learner-records';
import type { LearnerRecordFiles } from '../ports/LearnerRecordFiles';

export type MemoryLearnerRecords = {
  readonly store: LearnerRecordStore;
  /** What `routes.json` holds right now. */
  routes(): readonly RouteRecord[];
  /** The raw `routes.json` text, or null when the file is absent. */
  text(): string | null;
  /** The raw `state.json` text, or null when the file is absent. */
  stateText(): string | null;
};

export function createMemoryLearnerRecords(
  workspaceId = 'test-workspace',
  initial: { readonly routes?: readonly RouteRecord[]; readonly state?: LearningState } = {},
): MemoryLearnerRecords {
  const files = new Map<string, { readonly text: string; readonly version: number }>();
  let versions = 0;
  if (initial.routes) {
    files.set('routes', { text: routesText(initial.routes), version: ++versions });
  }
  if (initial.state) {
    files.set('state', { text: JSON.stringify({ schema: 'derivon.learning/v1', ...initial.state }), version: ++versions });
  }
  const port: LearnerRecordFiles = {
    async read(_workspaceId, file) {
      const entry = files.get(file);
      return entry === undefined
        ? { presence: 'missing' }
        : { presence: 'present', text: entry.text, version: String(entry.version) };
    },
    async write(_workspaceId, file, text, precondition) {
      const entry = files.get(file);
      const current = entry === undefined ? null : String(entry.version);
      const expected = precondition.presence === 'present' ? precondition.version : null;
      if (current !== expected) throw new Error(`学习者记录已被其他写入方更新（${file}.json）`);
      files.set(file, { text, version: ++versions });
      return String(versions);
    },
  };
  const store = createLearnerRecordStore(port, workspaceId);
  return {
    store,
    routes: () => {
      const text = files.get('routes')?.text;
      if (text === undefined) return [];
      try {
        return (JSON.parse(text) as { routes: RouteRecord[] }).routes;
      } catch {
        return [];
      }
    },
    text: () => files.get('routes')?.text ?? null,
    stateText: () => files.get('state')?.text ?? null,
  };
}

const routesText = (routes: readonly RouteRecord[]) =>
  `${JSON.stringify({ schema: 'derivon.routes/v1', routes }, null, 2)}\n`;

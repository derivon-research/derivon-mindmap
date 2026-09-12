import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { createLearnerRecordStore, type LearnerRecordStore } from '../../learner-records';
import type { LearnerRecordFiles } from '../../ports/LearnerRecordFiles';
import type { DesktopInvoke } from './desktopWorkspaceSource';

/** What Rust returns for one record file; both fields are null together for an absent record. */
type RawLearnerRecord = { text: string | null; version: string | null };

/**
 * The learner records live under the application data directory, which only the desktop host
 * has. Rust computes the one layout and does the compare-and-swap replacement; this adapter
 * carries the protocol's vocabulary across the command boundary and nothing else.
 */
export function createDesktopLearnerRecordFiles(invoke: DesktopInvoke = tauriInvoke): LearnerRecordFiles {
  return {
    async read(workspaceId, file) {
      const raw = await invoke<RawLearnerRecord>('read_learner_record', { workspaceId, file });
      return raw.text === null || raw.version === null
        ? { presence: 'missing' }
        : { presence: 'present', text: raw.text, version: raw.version };
    },
    write(workspaceId, file, text, precondition) {
      return invoke<string>('write_learner_record', {
        workspaceId,
        file,
        text,
        expectedVersion: precondition.presence === 'present' ? precondition.version : null,
      });
    },
  };
}

/** The store for one workspace, keyed by the manifest `id` and rooted in the data directory. */
export function createDesktopLearnerRecordStore(
  workspaceId: string,
  invoke: DesktopInvoke = tauriInvoke,
): LearnerRecordStore {
  return createLearnerRecordStore(createDesktopLearnerRecordFiles(invoke), workspaceId);
}

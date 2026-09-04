import type { Host, WorkspaceHandle } from '../../app/host';

/**
 * The web host: one bundled workspace, read-only, learning only.
 *
 * There is no `loadAuthoringMode` here, and that is the whole mechanism. A web build's
 * module graph has no path to `src/modes/authoring/`, so the authoring side cannot be
 * bundled, revealed by a flipped flag, or reached by editing a URL.
 */
export const host: Host = {
  id: 'web',
  modes: ['learning'],

  async openInitialWorkspace(): Promise<WorkspaceHandle> {
    const { bundledExampleWorkspaceSource } = await import('./bundledWorkspaceSource');
    return { id: 'bundled', name: '内置工作区', source: bundledExampleWorkspaceSource };
  },

  async loadLearningMode() {
    const { LearningMode } = await import('../../modes/learning');
    return LearningMode;
  },
};

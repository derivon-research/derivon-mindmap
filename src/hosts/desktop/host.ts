import type { Host, RecentWorkspace, WorkspaceHandle } from '../../app/host';
import {
  readRecentWorkspaces,
  rememberWorkspace,
  type RecentWorkspaceStorage,
} from './recentWorkspaces';

function storage(): RecentWorkspaceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function workspaceName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? path;
}

/**
 * The desktop host: local workspaces on the file system, both modes.
 *
 * It opens without a workspace, so the application's first frame is this host's recent
 * workspace list — never a mode chooser. Creating a workspace from nothing is #51.
 */
export const host: Host = {
  id: 'desktop',
  modes: ['authoring', 'learning'],

  async openInitialWorkspace(): Promise<WorkspaceHandle | null> {
    return null;
  },

  async listRecentWorkspaces(): Promise<readonly RecentWorkspace[]> {
    const store = storage();
    return store ? readRecentWorkspaces(store) : [];
  },

  async openRecentWorkspace(id: string): Promise<WorkspaceHandle> {
    const { createDesktopWorkspaceSource } = await import('./desktopWorkspaceSource');
    const name = workspaceName(id);
    const store = storage();
    if (store) rememberWorkspace(store, { path: id, name });
    return { id, name, source: createDesktopWorkspaceSource(id) };
  },

  async loadLearningMode() {
    const { LearningMode } = await import('../../modes/learning');
    return LearningMode;
  },

  async loadAuthoringMode() {
    const { AuthoringMode } = await import('../../modes/authoring');
    return AuthoringMode;
  },
};

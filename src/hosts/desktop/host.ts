import type { Host, RecentWorkspace, WorkspaceHandle } from '../../app/host';
import {
  readRecentWorkspaces,
  type RecentWorkspaceStorage,
} from './recentWorkspaces';

function storage(): RecentWorkspaceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The desktop host: local workspaces on the file system, both modes.
 *
 * It opens without a workspace, so the application's first frame is this host's recent
 * workspace list, with native open/create actions and no mode chooser.
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
    const { createDesktopWorkspaceActions } = await import('./desktopWorkspaces');
    return createDesktopWorkspaceActions(undefined, storage()).openRecentWorkspace(id);
  },

  async chooseWorkspace() {
    const { createDesktopWorkspaceActions } = await import('./desktopWorkspaces');
    return createDesktopWorkspaceActions(undefined, storage()).chooseWorkspace();
  },

  async createWorkspace() {
    const { createDesktopWorkspaceActions } = await import('./desktopWorkspaces');
    return createDesktopWorkspaceActions(undefined, storage()).createWorkspace();
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

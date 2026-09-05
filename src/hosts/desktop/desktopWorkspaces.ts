import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { WorkspaceHandle } from '../../app/host';
import { createWorkspace, parseWorkspaceGraph } from '../../workspace/index';
import { createDesktopWorkspaceSource, type DesktopInvoke } from './desktopWorkspaceSource';
import { rememberWorkspace, type RecentWorkspaceStorage } from './recentWorkspaces';

type Directory = { path: string; name: string };

/** Native selection carries identity only; every content read/write uses WorkspaceSource. */
export function createDesktopWorkspaceActions(invoke: DesktopInvoke = tauriInvoke, storage: RecentWorkspaceStorage | null = null) {
  function handle(directory: Directory): WorkspaceHandle {
    const source = createDesktopWorkspaceSource(directory.path, invoke);
    if (storage) rememberWorkspace(storage, directory);
    return { id: directory.path, name: directory.name, source, authoringSource: source };
  }

  async function open(directory: Directory): Promise<WorkspaceHandle> {
    const source = createDesktopWorkspaceSource(directory.path, invoke);
    parseWorkspaceGraph(await source.readGraph());
    return handle(directory);
  }

  return {
    async openRecentWorkspace(path: string): Promise<WorkspaceHandle> {
      return open({ path, name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path });
    },
    async chooseWorkspace(): Promise<WorkspaceHandle | null> {
      const directory = await invoke<Directory | null>('choose_workspace_source_directory');
      return directory ? open(directory) : null;
    },
    async createWorkspace(): Promise<WorkspaceHandle | null> {
      const directory = await invoke<Directory | null>('choose_workspace_source_directory');
      if (!directory) return null;
      const source = createDesktopWorkspaceSource(directory.path, invoke);
      const change = createWorkspace({ title: directory.name });
      await source.commit(change.changes);
      return handle(directory);
    },
  };
}

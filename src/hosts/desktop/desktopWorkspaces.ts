import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { WorkspaceHandle } from '../../app/host';
import { WORKSPACE_ID_RULE, createWorkspace, isValidWorkspaceId, parseWorkspaceGraph } from '../../workspace/index';
import { createDesktopWorkspaceSource, type DesktopInvoke } from './desktopWorkspaceSource';
import { rememberWorkspace, type RecentWorkspaceStorage } from './recentWorkspaces';

type Directory = { path: string; name: string };

/** Native selection carries identity only; every content read/write uses WorkspaceSource. */
export function createDesktopWorkspaceActions(invoke: DesktopInvoke = tauriInvoke, storage: RecentWorkspaceStorage | null = null) {
  function handle(directory: Directory): WorkspaceHandle {
    const source = createDesktopWorkspaceSource(directory.path, invoke);
    try { if (storage) rememberWorkspace(storage, directory); }
    catch { /* A recent-list cache failure must not invalidate a successful workspace open. */ }
    return {
      id: directory.path, name: directory.name, source, authoringSource: source,
      async registerCloseGuard(hasProtectedChanges) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow().onCloseRequested((event) => {
          if (hasProtectedChanges() && !window.confirm('工作区有未提交草稿或未保存内容，仍要关闭吗？')) event.preventDefault();
        });
      },
    };
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
      /* This host's only naming step is a directory picker, so the name the user gave the folder
       * is the identity, taken as it is. Nothing is generated and nothing is rewritten: folding
       * or truncating an unusable name would hand two different folders one identity, so it is
       * refused and the application shows the refusal. Asking for the id outright is the naming
       * flow, not this bridge. */
      if (!isValidWorkspaceId(directory.name)) {
        throw new Error(`「${directory.name}」不能作为工作区 id：必须是${WORKSPACE_ID_RULE}，请重命名这个文件夹`);
      }
      const change = createWorkspace({ id: directory.name, title: directory.name });
      await source.commit(change.changes);
      return handle(directory);
    },
  };
}

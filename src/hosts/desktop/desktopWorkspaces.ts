import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { WorkspaceHandle } from '../../app/host';
import { WORKSPACE_ID_RULE, createWorkspace, isValidWorkspaceId, parseWorkspaceManifest } from '../../workspace/index';
import { createDesktopLearnerRecordStore } from './desktopLearnerRecords';
import { createDesktopWorkspaceSource, type DesktopInvoke } from './desktopWorkspaceSource';
import { detectLearnerRecordMigration, rememberWorkspace, type RecentWorkspaceStorage } from './recentWorkspaces';

type Directory = { path: string; name: string };

/** Native selection carries identity only; every content read/write uses WorkspaceSource. */
export function createDesktopWorkspaceActions(invoke: DesktopInvoke = tauriInvoke, storage: RecentWorkspaceStorage | null = null) {
  function handle(directory: Directory, workspaceId: string): WorkspaceHandle {
    const source = createDesktopWorkspaceSource(directory.path, invoke);
    // The id index is read before the list is written, so this open is compared against the
    // last sighting rather than against itself. Detection never renames or deletes anything.
    let learnerRecordMigration;
    try {
      if (storage) learnerRecordMigration = detectLearnerRecordMigration(
        storage,
        { path: directory.path, name: directory.name, workspaceId },
      ) ?? undefined;
    } catch { /* A stale index must not block opening the workspace it describes. */ }
    try { if (storage) rememberWorkspace(storage, { ...directory, workspaceId }); }
    catch { /* A recent-list cache failure must not invalidate a successful workspace open. */ }
    return {
      id: directory.path,
      name: directory.name,
      source,
      authoringSource: source,
      learnerRecords: createDesktopLearnerRecordStore(workspaceId, invoke),
      ...(learnerRecordMigration ? { learnerRecordMigration } : {}),
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
    // Opening validates the whole manifest, `id` included: a manifest without one is a broken
    // workspace and never reaches learner-record addressing, so there is no fallback branch.
    const manifest = parseWorkspaceManifest(await source.readGraph());
    return handle(directory, manifest.manifest.id);
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
      return handle(directory, directory.name);
    },
  };
}

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { WorkspaceCommit, WritableWorkspaceSource } from '../../ports/WorkspaceSource';

export type DesktopInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

function asBytes(value: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}

function commandChanges(changes: WorkspaceCommit) {
  return {
    ...(changes.expectedRevision === undefined ? {} : { expectedRevision: changes.expectedRevision }),
    ...(changes.createOnly ? { createOnly: true } : {}),
    ...(changes.graph === undefined ? {} : { graph: changes.graph }),
    documents: [...(changes.documents ?? [])],
    assets: (changes.assets ?? []).map(({ path, content }) => ({
      path,
      content: content === null ? null : Array.from(content),
    })),
    companionMetadata: [...(changes.companionMetadata ?? [])],
  };
}

export function createDesktopWorkspaceSource(
  rootPath: string,
  invoke: DesktopInvoke = tauriInvoke,
): WritableWorkspaceSource {
  return {
    readGraph() {
      return invoke('read_workspace_source_graph', { rootPath });
    },
    readDocument(relativePath) {
      return invoke('read_workspace_source_document', { rootPath, relativePath });
    },
    async readAsset(relativePath) {
      return asBytes(await invoke('read_workspace_source_asset', { rootPath, relativePath }));
    },
    readCompanionMetadata(relativePath) {
      return invoke('read_workspace_source_companion_metadata', { rootPath, relativePath });
    },
    revision() {
      return invoke('workspace_source_revision', { rootPath });
    },
    listOwnedFiles(directory) {
      return invoke<readonly string[]>('list_workspace_source_owned_files', { rootPath, directory });
    },
    commit(changes) {
      return invoke<string>('commit_workspace_source_changes', {
        rootPath,
        changes: commandChanges(changes),
      });
    },
  };
}

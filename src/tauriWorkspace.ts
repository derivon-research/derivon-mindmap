import { invoke } from '@tauri-apps/api/core';
import { parseDocument, type DocumentReference } from './domain';
import type { AuthoringWorkspace, WorkspaceDirectorySnapshot } from './workspace';

export type NativeWorkspaceDirectory = {
  kind: 'tauri';
  name: string;
  path: string;
};

type NativeChosenWorkspace = {
  path: string;
  name: string;
  workspace: AuthoringWorkspace;
  revision: string;
  created: false;
};

export function isNativeWorkspaceDirectory(value: unknown): value is NativeWorkspaceDirectory {
  return typeof value === 'object' && value !== null && (value as NativeWorkspaceDirectory).kind === 'tauri';
}

export async function chooseNativeWorkspace(): Promise<{
  handle: NativeWorkspaceDirectory;
  workspace: AuthoringWorkspace;
  revision: string;
  created: false;
}> {
  const result = await invoke<NativeChosenWorkspace | null>('choose_workspace');
  if (!result) throw new DOMException('Folder selection cancelled', 'AbortError');
  result.workspace.manifest = parseDocument(JSON.stringify(result.workspace.manifest));
  return {
    handle: { kind: 'tauri', name: result.name, path: result.path },
    workspace: result.workspace,
    revision: result.revision,
    created: false,
  };
}

export async function readNativeWorkspace(
  root: NativeWorkspaceDirectory,
  loadFiles: boolean,
): Promise<WorkspaceDirectorySnapshot> {
  const snapshot = await invoke<WorkspaceDirectorySnapshot>('read_workspace', { rootPath: root.path, loadFiles });
  snapshot.workspace.manifest = parseDocument(JSON.stringify(snapshot.workspace.manifest));
  return snapshot;
}

export function writeNativeWorkspace(
  root: NativeWorkspaceDirectory,
  workspace: AuthoringWorkspace,
): Promise<void> {
  return invoke('write_workspace', {
    rootPath: root.path,
    manifest: workspace.manifest,
    files: workspace.files,
  });
}

export function readNativeWorkspaceDocument(
  root: NativeWorkspaceDirectory,
  reference: DocumentReference,
): Promise<string> {
  const relativePath = reference.format === 'markdown'
    ? `${reference.document}/document.md`
    : `${reference.document}/index.html`;
  return invoke('read_workspace_file', { rootPath: root.path, relativePath });
}

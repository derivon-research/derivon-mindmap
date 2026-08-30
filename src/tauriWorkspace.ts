import { invoke } from '@tauri-apps/api/core';
import { parseDocumentWithMigration, type DocumentReference } from './domain';
import type { AuthoringWorkspace, ChosenWorkspaceDirectory, WorkspaceDirectorySnapshot } from './workspace';

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

type NativeSelectedDirectory = {
  path: string;
  name: string;
};

export function isNativeWorkspaceDirectory(value: unknown): value is NativeWorkspaceDirectory {
  return typeof value === 'object' && value !== null && (value as NativeWorkspaceDirectory).kind === 'tauri';
}

export async function chooseNativeWorkspace(): Promise<ChosenWorkspaceDirectory> {
  const result = await invoke<NativeChosenWorkspace | null>('choose_workspace');
  if (!result) throw new DOMException('Folder selection cancelled', 'AbortError');
  const parsed = parseDocumentWithMigration(JSON.stringify(result.workspace.manifest));
  result.workspace.manifest = parsed.document;
  return {
    handle: { kind: 'tauri', name: result.name, path: result.path },
    workspace: result.workspace,
    revision: result.revision,
    migrationSource: parsed.migratedFrom,
    created: false,
  };
}

export async function saveNativeWorkspaceAs(
  workspace: AuthoringWorkspace,
): Promise<NativeWorkspaceDirectory> {
  const result = await invoke<NativeSelectedDirectory | null>('save_workspace_as', {
    manifest: workspace.manifest,
    files: workspace.files,
  });
  if (!result) throw new DOMException('Folder selection cancelled', 'AbortError');
  return { kind: 'tauri', name: result.name, path: result.path };
}

export async function readNativeWorkspace(
  root: NativeWorkspaceDirectory,
  loadFiles: boolean,
): Promise<WorkspaceDirectorySnapshot> {
  const snapshot = await invoke<Omit<WorkspaceDirectorySnapshot, 'migrationSource'>>('read_workspace', { rootPath: root.path, loadFiles });
  const parsed = parseDocumentWithMigration(JSON.stringify(snapshot.workspace.manifest));
  snapshot.workspace.manifest = parsed.document;
  return { ...snapshot, migrationSource: parsed.migratedFrom };
}

export function readNativeWorkspaceRevision(root: NativeWorkspaceDirectory): Promise<string> {
  return invoke('workspace_revision', { rootPath: root.path });
}

export function readNativeWorkspaceAsset(
  root: NativeWorkspaceDirectory,
  relativePath: string,
): Promise<ArrayBuffer> {
  return invoke('read_workspace_asset', { rootPath: root.path, relativePath });
}

export async function writeNativeWorkspaceAsset(
  root: NativeWorkspaceDirectory,
  relativePath: string,
  file: File,
): Promise<void> {
  await invoke('write_workspace_asset', await file.arrayBuffer(), {
    headers: {
      'x-derivon-workspace-root': encodeURIComponent(root.path),
      'x-derivon-relative-path': encodeURIComponent(relativePath),
    },
  });
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

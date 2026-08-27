import { DOCUMENT_SCHEMA, parseDocument, type AuthoringDocument, type DocumentFormat, type DocumentReference } from './domain';
import {
  conceptDocumentTemplate,
  derivationDocumentTemplate,
  markdownToHtml,
} from './documentContent';
import { WORKSPACE_AGENT_FILES, WORKSPACE_AGENT_REFERENCE_SET } from './agentSkill';
import {
  chooseNativeWorkspace,
  isNativeWorkspaceDirectory,
  readNativeWorkspace,
  readNativeWorkspaceDocument,
  readNativeWorkspaceRevision,
  saveNativeWorkspaceAs,
  writeNativeWorkspace,
  type NativeWorkspaceDirectory,
} from './tauriWorkspace';
import { isTauriRuntime } from './route';

export const WORKSPACE_MANIFEST = '.derivon/workspace.json';
export const LOCAL_WORKSPACE_KEY = 'derivon.authoring.workspace/v0.2.0';
const LEGACY_SCHEMA = 'derivon.authoring/v0.1.0';
const LEGACY_STORAGE_KEY = 'derivon.authoring.demo/v0.1.0';

export type AuthoringWorkspace = {
  manifest: AuthoringDocument;
  files: Record<string, string>;
};

export type WorkspaceDirectory = FileSystemDirectoryHandle | NativeWorkspaceDirectory;

export type WorkspaceDirectorySnapshot = {
  workspace: AuthoringWorkspace;
  revision: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function documentReferences(manifest: AuthoringDocument): DocumentReference[] {
  return [
    ...manifest.graph.points.map((point) => point.data),
    ...manifest.graph.hyperedges.map((hyperedge) => hyperedge.data),
  ];
}

export function documentEntryPath(directory: string): string {
  return `${directory}/index.html`;
}

export function documentSourcePath(reference: DocumentReference): string {
  return reference.format === 'markdown'
    ? `${reference.document}/document.md`
    : documentEntryPath(reference.document);
}

export function referencedDocumentFiles(manifest: AuthoringDocument): string[] {
  return documentReferences(manifest).flatMap((reference) => reference.format === 'markdown'
    ? [documentEntryPath(reference.document), documentSourcePath(reference)]
    : [documentEntryPath(reference.document)]);
}

export function validateWorkspace(workspace: AuthoringWorkspace): void {
  const missing = referencedDocumentFiles(workspace.manifest).filter((path) => typeof workspace.files[path] !== 'string');
  if (missing.length) throw new Error(`工作区缺少文档：${missing.slice(0, 3).join('、')}`);
}

export function parseWorkspaceSnapshot(text: string): AuthoringWorkspace {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || !isRecord(value.files)) throw new Error('工作区快照无效');
  const manifest = parseDocument(JSON.stringify(value.manifest));
  const files = Object.fromEntries(Object.entries(value.files).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const workspace = { manifest, files };
  validateWorkspace(workspace);
  return workspace;
}

function safeSegment(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

export function createDocumentDirectory(kind: 'concept' | 'derivation', id: string, used: Iterable<string>): string {
  const existing = new Set(used);
  const base = `docs/${kind}-${safeSegment(id)}`;
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

export function storeDocumentFiles(
  current: Record<string, string>,
  directory: string,
  format: DocumentFormat,
  source: string,
  title: string,
): Record<string, string> {
  return {
    ...current,
    [documentEntryPath(directory)]: format === 'html' ? source : markdownToHtml(source, title),
    ...(format === 'markdown' ? { [`${directory}/document.md`]: source } : {}),
  };
}

export function conceptTemplate(label: string, format: DocumentFormat = 'markdown'): string {
  return conceptDocumentTemplate(label, format);
}

export function derivationTemplate(id: string, format: DocumentFormat = 'markdown'): string {
  return derivationDocumentTemplate(id, format);
}

export function migrateLegacyDocument(text: string): AuthoringWorkspace {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.schema !== LEGACY_SCHEMA || !isRecord(value.graph)) throw new Error('不是可迁移的 Derivon v0.1 文档');
  if (!Array.isArray(value.graph.points) || !Array.isArray(value.graph.hyperedges)) throw new Error('旧文档缺少图数据');

  let files: Record<string, string> = {};
  const directories = new Set<string>();
  const points = value.graph.points.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.data) || typeof raw.data.label !== 'string') throw new Error(`旧文档的点 ${index} 无效`);
    const directory = createDocumentDirectory('concept', raw.id, directories);
    directories.add(directory);
    const definition = typeof raw.data.definition === 'string' ? raw.data.definition.trim() : '';
    const source = `# ${raw.data.label || raw.id}\n\n${definition}\n`;
    files = storeDocumentFiles(files, directory, 'markdown', source, raw.data.label || raw.id);
    return { id: raw.id, data: { label: raw.data.label, document: directory, format: 'markdown' as const } };
  });
  const hyperedges = value.graph.hyperedges.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.data)) throw new Error(`旧文档的超边 ${index} 无效`);
    const directory = createDocumentDirectory('derivation', raw.id, directories);
    directories.add(directory);
    const introduction = typeof raw.data.introduction === 'string' ? raw.data.introduction.trim() : '';
    const reasoning = typeof raw.data.reasoning === 'string' ? raw.data.reasoning.trim() : '';
    const source = `# 推导 ${raw.id}\n\n## 问题引入\n\n${introduction}\n\n## 推导过程\n\n${reasoning}\n`;
    files = storeDocumentFiles(files, directory, 'markdown', source, `推导 ${raw.id}`);
    return {
      id: raw.id,
      weight: raw.weight,
      tails: raw.tails,
      head: raw.head,
      data: { document: directory, format: 'markdown' as const },
    };
  });
  const migrated = {
    ...value,
    schema: DOCUMENT_SCHEMA,
    graph: { points, hyperedges },
  };
  const manifest = parseDocument(JSON.stringify(migrated));
  return { manifest, files };
}

export function importManifest(
  text: string,
  currentFiles: Record<string, string>,
  { allowMissingFiles = false }: { allowMissingFiles?: boolean } = {},
): AuthoringWorkspace {
  const parsed: unknown = JSON.parse(text);
  if (isRecord(parsed) && parsed.schema === LEGACY_SCHEMA) return migrateLegacyDocument(text);
  const manifest = parseDocument(text);
  const workspace = { manifest, files: currentFiles };
  if (!allowMissingFiles) validateWorkspace(workspace);
  return workspace;
}

export function loadLocalWorkspace(fallback: AuthoringWorkspace): AuthoringWorkspace {
  try {
    const saved = localStorage.getItem(LOCAL_WORKSPACE_KEY);
    if (saved) return parseWorkspaceSnapshot(saved);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return migrateLegacyDocument(legacy);
  } catch {
    localStorage.removeItem(LOCAL_WORKSPACE_KEY);
  }
  return structuredClone(fallback);
}

async function getDirectory(root: FileSystemDirectoryHandle, parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of parts) current = await current.getDirectoryHandle(part, { create });
  return current;
}

async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  const parts = path.split('/');
  const filename = parts.pop()!;
  const directory = await getDirectory(root, parts, false);
  const handle = await directory.getFileHandle(filename);
  return handle.getFile();
}

async function readTextFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  return (await readFile(root, path)).text();
}

export async function readWorkspaceDocumentSource(
  root: WorkspaceDirectory,
  reference: DocumentReference,
): Promise<string> {
  if (isNativeWorkspaceDirectory(root)) return readNativeWorkspaceDocument(root, reference);
  return readTextFile(root, documentSourcePath(reference));
}

export async function validateWorkspaceDirectoryFiles(
  root: WorkspaceDirectory,
  manifest: AuthoringDocument,
  pendingFiles: Record<string, string> = {},
): Promise<void> {
  if (isNativeWorkspaceDirectory(root)) {
    const disk = await readNativeWorkspace(root, true);
    const missing = referencedDocumentFiles(manifest).filter((path) =>
      typeof disk.workspace.files[path] !== 'string' && typeof pendingFiles[path] !== 'string',
    );
    if (missing.length) throw new Error(`工作区缺少文档：${missing.slice(0, 3).join('、')}`);
    return;
  }
  await Promise.all(referencedDocumentFiles(manifest).map(async (path) => {
    if (typeof pendingFiles[path] === 'string') return;
    try {
      await readFile(root, path);
    } catch (error) {
      if (isNotFoundError(error)) throw new Error(`工作区缺少文档：${path}`, { cause: error });
      throw error;
    }
  }));
}

async function writeTextFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const parts = path.split('/');
  const filename = parts.pop()!;
  const directory = await getDirectory(root, parts, true);
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function removeTextFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split('/');
  const filename = parts.pop()!;
  const directory = await getDirectory(root, parts, false);
  await directory.removeEntry(filename);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

const MANAGED_AGENT_FILE_MARKER = 'managed-by: derivon-mindmap-demo';
const WORKSPACE_AGENT_BUNDLE_MANIFEST = '.derivon/agent/bundle.json';
const WORKSPACE_AGENT_BUNDLE_SCHEMA = 'derivon.agent-bundle/v0.1.0';

type AgentBundleManifest = {
  schema: typeof WORKSPACE_AGENT_BUNDLE_SCHEMA;
  referenceSet: string;
  files: Record<string, string>;
  protectedFiles: string[];
};

type StoredAgentBundle = {
  exists: boolean;
  text: string | null;
  manifest: AgentBundleManifest | null;
};

async function contentDigest(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function workspaceRevision(workspace: AuthoringWorkspace): Promise<string> {
  const files = referencedDocumentFiles(workspace.manifest)
    .sort()
    .map((path) => [path, workspace.files[path]] as const);
  return contentDigest(JSON.stringify([
    [WORKSPACE_MANIFEST, `${JSON.stringify(workspace.manifest, null, 2)}\n`],
    ...files,
  ]));
}

function parseAgentBundleManifest(text: string): AgentBundleManifest | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value)
      || value.schema !== WORKSPACE_AGENT_BUNDLE_SCHEMA
      || typeof value.referenceSet !== 'string'
      || !isRecord(value.files)
      || !Array.isArray(value.protectedFiles)
    ) return null;
    const files = Object.fromEntries(Object.entries(value.files).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string',
    ));
    const protectedFiles = value.protectedFiles.filter((path): path is string => typeof path === 'string');
    return { schema: WORKSPACE_AGENT_BUNDLE_SCHEMA, referenceSet: value.referenceSet, files, protectedFiles };
  } catch {
    return null;
  }
}

async function readStoredAgentBundle(root: FileSystemDirectoryHandle): Promise<StoredAgentBundle> {
  try {
    const text = await readTextFile(root, WORKSPACE_AGENT_BUNDLE_MANIFEST);
    return { exists: true, text, manifest: parseAgentBundleManifest(text) };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return { exists: false, text: null, manifest: null };
  }
}

export async function attachWorkspaceAgentFiles(root: FileSystemDirectoryHandle): Promise<void> {
  const stored = await readStoredAgentBundle(root);
  const nextFiles: Record<string, string> = {};
  const protectedFiles = new Set(stored.manifest?.protectedFiles ?? []);

  for (const [path, content] of Object.entries(WORKSPACE_AGENT_FILES)) {
    const desiredDigest = await contentDigest(content);
    try {
      const existing = await readTextFile(root, path);
      const existingDigest = await contentDigest(existing);
      const previousDigest = stored.manifest?.files[path];
      const isUnmodifiedManagedFile = previousDigest !== undefined && previousDigest === existingDigest;
      const isLegacyManagedFile = !stored.exists && existing.includes(MANAGED_AGENT_FILE_MARKER);

      if (existing === content) {
        nextFiles[path] = desiredDigest;
        protectedFiles.delete(path);
      } else if (isUnmodifiedManagedFile || isLegacyManagedFile) {
        await writeTextFile(root, path, content);
        nextFiles[path] = desiredDigest;
        protectedFiles.delete(path);
      } else {
        protectedFiles.add(path);
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      await writeTextFile(root, path, content);
      nextFiles[path] = desiredDigest;
      protectedFiles.delete(path);
    }
  }

  for (const [path, previousDigest] of Object.entries(stored.manifest?.files ?? {})) {
    if (Object.hasOwn(WORKSPACE_AGENT_FILES, path)) continue;
    try {
      const existingDigest = await contentDigest(await readTextFile(root, path));
      if (existingDigest === previousDigest) {
        await removeTextFile(root, path);
        protectedFiles.delete(path);
      } else {
        protectedFiles.add(path);
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      protectedFiles.delete(path);
    }
  }

  const manifest: AgentBundleManifest = {
    schema: WORKSPACE_AGENT_BUNDLE_SCHEMA,
    referenceSet: WORKSPACE_AGENT_REFERENCE_SET,
    files: nextFiles,
    protectedFiles: [...protectedFiles].sort(),
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (stored.text !== text) await writeTextFile(root, WORKSPACE_AGENT_BUNDLE_MANIFEST, text);
}

export async function readWorkspaceDirectorySnapshot(
  root: WorkspaceDirectory,
  { loadFiles = true }: { loadFiles?: boolean } = {},
): Promise<WorkspaceDirectorySnapshot> {
  if (isNativeWorkspaceDirectory(root)) return readNativeWorkspace(root, loadFiles);
  const manifestText = await readTextFile(root, WORKSPACE_MANIFEST);
  let manifest: AuthoringDocument;
  try {
    manifest = parseDocument(manifestText);
  } catch (error) {
    throw new Error(`${WORKSPACE_MANIFEST} 无效`, { cause: error });
  }
  const entries = await Promise.all(referencedDocumentFiles(manifest).sort().map(async (path) => {
    try {
      const file = await readFile(root, path);
      return loadFiles
        ? [path, await file.text()] as const
        : [path, { size: file.size, lastModified: file.lastModified }] as const;
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error(`工作区缺少文档：${path}`, { cause: error });
      }
      throw error;
    }
  }));
  const files = loadFiles ? Object.fromEntries(entries as ReadonlyArray<readonly [string, string]>) : {};
  const workspace = { manifest, files };
  const revision = await contentDigest(JSON.stringify([
    [WORKSPACE_MANIFEST, manifestText],
    ...entries,
  ]));
  return { workspace, revision };
}

export async function readWorkspaceDirectory(root: WorkspaceDirectory): Promise<AuthoringWorkspace> {
  return (await readWorkspaceDirectorySnapshot(root)).workspace;
}

export async function readWorkspaceDirectoryRevision(root: WorkspaceDirectory): Promise<string> {
  if (isNativeWorkspaceDirectory(root)) return readNativeWorkspaceRevision(root);
  return (await readWorkspaceDirectorySnapshot(root, { loadFiles: false })).revision;
}

export async function writeWorkspaceDirectoryChanges(
  root: WorkspaceDirectory,
  manifest: AuthoringDocument,
  files: Record<string, string>,
): Promise<void> {
  if (isNativeWorkspaceDirectory(root)) {
    await writeNativeWorkspace(root, { manifest, files });
    return;
  }
  await writeTextFile(root, WORKSPACE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [path, content] of Object.entries(files)) {
    await writeTextFile(root, path, content);
  }
}

export async function writeWorkspaceDirectory(root: FileSystemDirectoryHandle, workspace: AuthoringWorkspace): Promise<void> {
  validateWorkspace(workspace);
  await writeWorkspaceDirectoryChanges(root, workspace.manifest, workspace.files);
  await attachWorkspaceAgentFiles(root);
}

export function supportsWorkspaceDirectory(): boolean {
  return isTauriRuntime() || (window.isSecureContext && typeof window.showDirectoryPicker === 'function');
}

function requireWorkspaceDirectoryPicker(): NonNullable<Window['showDirectoryPicker']> {
  if (!window.isSecureContext) {
    throw new Error('工作区目录需要 HTTPS 安全连接，请使用 https://mindmap.derivon.net/');
  }
  const picker = window.showDirectoryPicker;
  if (!picker) throw new Error('当前浏览器不支持工作区目录，请使用 Chromium 系浏览器');
  return picker;
}

export async function ensureWorkspaceDirectoryPermission(handle: WorkspaceDirectory): Promise<void> {
  if (isNativeWorkspaceDirectory(handle)) return;
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if (!handle.queryPermission || !handle.requestPermission) return;
  try {
    if (await handle.queryPermission(descriptor) === 'granted') return;
    if (await handle.requestPermission(descriptor) === 'granted') return;
  } catch (error) {
    throw new Error('无法取得项目文件夹的读写权限，请重新选择文件夹并允许读写', { cause: error });
  }
  throw new Error('未取得项目文件夹的读写权限，请重新选择文件夹并允许读写');
}

export async function writeWorkspaceToNewDirectory(
  root: FileSystemDirectoryHandle,
  workspace: AuthoringWorkspace,
): Promise<void> {
  try {
    await readTextFile(root, WORKSPACE_MANIFEST);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await writeWorkspaceDirectory(root, workspace);
    return;
  }
  throw new Error('所选文件夹已经是 Derivon 工作区，请选择新的文件夹');
}

export async function saveWorkspaceAsDirectory(
  current: AuthoringWorkspace,
  source?: WorkspaceDirectory,
): Promise<WorkspaceDirectory> {
  const workspace = source
    ? {
        manifest: current.manifest,
        files: {
          ...(await readWorkspaceDirectorySnapshot(source)).workspace.files,
          ...current.files,
        },
      }
    : current;
  if (isTauriRuntime()) return saveNativeWorkspaceAs(workspace);
  const picker = requireWorkspaceDirectoryPicker();
  const handle = await picker({ mode: 'readwrite' });
  await ensureWorkspaceDirectoryPermission(handle);
  await writeWorkspaceToNewDirectory(handle, workspace);
  return handle;
}

export async function chooseWorkspaceDirectory(current: AuthoringWorkspace): Promise<{
  handle: WorkspaceDirectory;
  workspace: AuthoringWorkspace;
  revision: string;
  created: boolean;
}> {
  if (isTauriRuntime()) return chooseNativeWorkspace();
  const picker = requireWorkspaceDirectoryPicker();
  const handle = await picker({ mode: 'readwrite' });
  await ensureWorkspaceDirectoryPermission(handle);
  try {
    const snapshot = await readWorkspaceDirectorySnapshot(handle, { loadFiles: false });
    await attachWorkspaceAgentFiles(handle);
    return { handle, workspace: snapshot.workspace, revision: snapshot.revision, created: false };
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
    await writeWorkspaceDirectory(handle, current);
    const snapshot = await readWorkspaceDirectorySnapshot(handle, { loadFiles: false });
    return { handle, workspace: current, revision: snapshot.revision, created: true };
  }
}

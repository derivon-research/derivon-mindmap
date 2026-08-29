import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_SCHEMA, PREVIOUS_DOCUMENT_SCHEMA, validateDocument } from './domain';
import { sampleDocument, sampleWorkspace } from './sample';
import {
  WORKSPACE_MANIFEST,
  createDocumentDirectory,
  ensureWorkspaceDirectoryPermission,
  migrateLegacyDocument,
  parseWorkspaceSnapshot,
  readWorkspaceDirectorySnapshot,
  readWorkspaceDocumentSource,
  upgradeWorkspaceDirectorySchema,
  validateWorkspace,
  workspaceRevision,
  writeWorkspaceToNewDirectory,
} from './workspace';

function memoryDirectory(initial: Record<string, string> = {}): {
  handle: FileSystemDirectoryHandle;
  read(path: string): string | undefined;
  reads(path: string): number;
  write(path: string, content: string): void;
} {
  const files = new Map(Object.entries(initial));
  const readCounts = new Map<string, number>();
  const directories = new Set<string>(['']);
  for (const filePath of files.keys()) {
    const parts = filePath.split('/');
    parts.pop();
    while (parts.length) {
      directories.add(parts.join('/'));
      parts.pop();
    }
  }

  const directoryHandle = (prefix: string, name: string): FileSystemDirectoryHandle => ({
    kind: 'directory',
    name,
    async removeEntry(filename: string) {
      const filePath = [prefix, filename].filter(Boolean).join('/');
      if (!files.has(filePath)) throw new DOMException(`Missing file ${filePath}`, 'NotFoundError');
      files.delete(filePath);
    },
    async getDirectoryHandle(child: string, options?: { create?: boolean }) {
      const childPath = [prefix, child].filter(Boolean).join('/');
      if (!directories.has(childPath)) {
        if (!options?.create) throw new DOMException(`Missing directory ${childPath}`, 'NotFoundError');
        directories.add(childPath);
      }
      return directoryHandle(childPath, child);
    },
    async getFileHandle(filename: string, options?: { create?: boolean }) {
      const filePath = [prefix, filename].filter(Boolean).join('/');
      if (!files.has(filePath) && !options?.create) throw new DOMException(`Missing file ${filePath}`, 'NotFoundError');
      return {
        kind: 'file',
        name: filename,
        async getFile() {
          const content = files.get(filePath) ?? '';
          return {
            size: content.length,
            lastModified: 0,
            text: async () => {
              readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
              return content;
            },
          } as File;
        },
        async createWritable() {
          let content = '';
          return {
            async write(data: string | BufferSource | Blob) {
              if (typeof data !== 'string') throw new TypeError('Test filesystem only accepts strings');
              content = data;
            },
            async close() {
              files.set(filePath, content);
            },
          } as FileSystemWritableFileStream;
        },
      } as unknown as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle);

  return {
    handle: directoryHandle('', 'workspace'),
    read: (path) => files.get(path),
    reads: (path) => readCounts.get(path) ?? 0,
    write: (path, content) => files.set(path, content),
  };
}

describe('authoring workspace', () => {
  it('does not create or modify agent-managed files when writing a workspace', async () => {
    const customPath = '.agents/skills/team-skill/SKILL.md';
    const bundlePath = '.derivon/agent/bundle.json';
    const directory = memoryDirectory({
      [customPath]: 'team instructions\n',
      [bundlePath]: '{"schema":"legacy-agent-bundle"}\n',
    });

    await writeWorkspaceToNewDirectory(directory.handle, sampleWorkspace);

    expect(directory.read(customPath)).toBe('team instructions\n');
    expect(directory.read(bundlePath)).toBe('{"schema":"legacy-agent-bundle"}\n');
    expect(directory.read('.agents/skills/derivon-cli/SKILL.md')).toBeUndefined();
    expect(directory.read('.claude/skills/derivon-cli/SKILL.md')).toBeUndefined();
    expect(directory.read('.github/skills/derivon-cli/SKILL.md')).toBeUndefined();
  });

  it('requests explicit read-write permission for a selected directory', async () => {
    const queryPermission = vi.fn(async () => 'prompt' as PermissionState);
    const requestPermission = vi.fn(async () => 'granted' as PermissionState);
    const handle = { queryPermission, requestPermission } as unknown as FileSystemDirectoryHandle;

    await ensureWorkspaceDirectoryPermission(handle);

    expect(queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('rejects a selected directory without read-write permission', async () => {
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'denied' as PermissionState),
    } as unknown as FileSystemDirectoryHandle;

    await expect(ensureWorkspaceDirectoryPermission(handle)).rejects.toThrow('未取得项目文件夹的读写权限');
  });

  it('writes the current project to a new directory and refuses workspace overwrite', async () => {
    const customPath = '.github/skills/team-skill/SKILL.md';
    const directory = memoryDirectory({ [customPath]: 'team instructions\n' });

    await writeWorkspaceToNewDirectory(directory.handle, sampleWorkspace);

    const manifest = JSON.parse(directory.read('.derivon/workspace.json')!);
    expect(manifest.schema).toBe('derivon.authoring/v0.3.0');
    expect(manifest.view).not.toHaveProperty('positions');
    expect(directory.read('docs/concept-a/document.md')).toBe(sampleWorkspace.files['docs/concept-a/document.md']);
    expect(directory.read(customPath)).toBe('team instructions\n');
    expect(directory.read('.derivon/agent/bundle.json')).toBeUndefined();
    await expect(writeWorkspaceToNewDirectory(directory.handle, sampleWorkspace)).rejects.toThrow('已经是 Derivon 工作区');
  });

  it('fingerprints external changes to managed workspace files', async () => {
    const directory = memoryDirectory();
    await writeWorkspaceToNewDirectory(directory.handle, sampleWorkspace);

    const initial = await readWorkspaceDirectorySnapshot(directory.handle);
    expect(initial.revision).toBe(await workspaceRevision(sampleWorkspace));

    directory.write('docs/concept-a/document.md', '# Changed outside the WebUI\n');
    const changed = await readWorkspaceDirectorySnapshot(directory.handle);

    expect(changed.revision).not.toBe(initial.revision);
    expect(changed.workspace.files['docs/concept-a/document.md']).toBe('# Changed outside the WebUI\n');
  });

  it('reports a previous directory schema without rewriting it before confirmation', async () => {
    const previousManifest = {
      ...structuredClone(sampleDocument),
      schema: PREVIOUS_DOCUMENT_SCHEMA,
      document: { ...sampleDocument.document, updatedAt: 'not-a-date' },
      view: { ...sampleDocument.view, positions: { missing: null } },
    };
    const originalText = `${JSON.stringify(previousManifest, null, 2)}\n`;
    const directory = memoryDirectory({
      ...sampleWorkspace.files,
      [WORKSPACE_MANIFEST]: originalText,
    });

    const snapshot = await readWorkspaceDirectorySnapshot(directory.handle, { loadFiles: false });

    expect(snapshot.migrationSource).toBe(PREVIOUS_DOCUMENT_SCHEMA);
    expect(snapshot.workspace.manifest.schema).toBe(DOCUMENT_SCHEMA);
    expect(directory.read(WORKSPACE_MANIFEST)).toBe(originalText);

    const upgraded = await upgradeWorkspaceDirectorySchema({
      handle: directory.handle,
      ...snapshot,
      created: false,
    });
    expect(upgraded.migrationSource).toBeNull();
    expect(JSON.parse(directory.read(WORKSPACE_MANIFEST)!).schema).toBe(DOCUMENT_SCHEMA);
  });

  it('loads directory documents lazily and reads only the opened source', async () => {
    const directory = memoryDirectory();
    await writeWorkspaceToNewDirectory(directory.handle, sampleWorkspace);
    const sourcePath = 'docs/concept-a/document.md';
    const entryPath = 'docs/concept-a/index.html';

    const snapshot = await readWorkspaceDirectorySnapshot(directory.handle, { loadFiles: false });

    expect(snapshot.workspace.files).toEqual({});
    expect(directory.reads('.derivon/workspace.json')).toBe(1);
    expect(directory.reads(sourcePath)).toBe(0);
    expect(directory.reads(entryPath)).toBe(0);

    const source = await readWorkspaceDocumentSource(directory.handle, sampleDocument.graph.points[0].data);

    expect(source).toBe(sampleWorkspace.files[sourcePath]);
    expect(directory.reads(sourcePath)).toBe(1);
    expect(directory.reads(entryPath)).toBe(0);
  });

  it('rejects sharing one document directory between graph objects', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.points[1].data.document = invalid.graph.points[0].data.document;
    expect(validateDocument(invalid)).toContainEqual({
      path: 'graph.points[1].data.document',
      message: 'docs/concept-a 已由 点 A 拥有',
    });
  });

  it('discards v0.2 workspace positions during migration', () => {
    const previousManifest = {
      ...structuredClone(sampleDocument),
      schema: PREVIOUS_DOCUMENT_SCHEMA,
      document: {
        ...sampleDocument.document,
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      view: {
        ...sampleDocument.view,
        positions: { A: { x: 12, y: 34 } },
      },
    };

    const migrated = parseWorkspaceSnapshot(JSON.stringify({
      manifest: previousManifest,
      files: sampleWorkspace.files,
    }));

    expect(migrated.manifest.schema).toBe(DOCUMENT_SCHEMA);
    expect(migrated).not.toHaveProperty('initialLayout');
    expect(migrated.manifest.view).not.toHaveProperty('positions');
    expect(migrated.manifest.document).not.toHaveProperty('updatedAt');
  });

  it('requires every referenced document to exist in the workspace', () => {
    const invalid = structuredClone(sampleWorkspace);
    delete invalid.files['docs/concept-a/index.html'];
    expect(() => validateWorkspace(invalid)).toThrow('工作区缺少文档：docs/concept-a/index.html');
    expect(() => parseWorkspaceSnapshot(JSON.stringify(invalid))).toThrow('工作区缺少文档');

    const missingSource = structuredClone(sampleWorkspace);
    delete missingSource.files['docs/concept-a/document.md'];
    expect(() => validateWorkspace(missingSource)).toThrow('工作区缺少文档：docs/concept-a/document.md');
  });

  it('creates collision-free document directories for web-authored objects', () => {
    expect(createDocumentDirectory('concept', 'C 1', [])).toBe('docs/concept-c-1');
    expect(createDocumentDirectory('concept', 'C 1', ['docs/concept-c-1'])).toBe('docs/concept-c-1-2');
  });

  it('migrates inline v0.1 content to uniquely owned document directories', () => {
    const legacy = {
      schema: 'derivon.authoring/v0.1.0',
      document: { title: '旧文档', description: '', updatedAt: '2026-08-25T00:00:00.000Z' },
      graph: {
        points: [
          { id: 'A', data: { label: '概念 A', definition: 'A 的定义。' } },
          { id: 'B', data: { label: '概念 B', definition: '' } },
        ],
        hyperedges: [{
          id: 'h-1',
          weight: 1,
          tails: ['A'],
          head: 'B',
          data: { introduction: '目标', reasoning: '由 A 得到 B。' },
        }],
      },
      view: { positions: {}, replacements: [] },
    };
    const migrated = migrateLegacyDocument(JSON.stringify(legacy));
    expect(migrated.manifest.graph.points[0].data).toMatchObject({ document: 'docs/concept-a', format: 'markdown' });
    expect(migrated.manifest.graph.hyperedges[0].data).toEqual({ document: 'docs/derivation-h-1', format: 'markdown' });
    expect(migrated.manifest.document).not.toHaveProperty('updatedAt');
    expect(migrated.files['docs/concept-a/document.md']).toContain('A 的定义。');
    expect(migrated.files['docs/concept-a/index.html']).toContain('A 的定义。');
    expect(migrated.files['docs/derivation-h-1/document.md']).toContain('由 A 得到 B。');
    expect(migrated.files['docs/derivation-h-1/index.html']).toContain('由 A 得到 B。');
    expect(new Set([
      ...migrated.manifest.graph.points.map((item) => item.data.document),
      ...migrated.manifest.graph.hyperedges.map((item) => item.data.document),
    ]).size).toBe(3);
  });
});

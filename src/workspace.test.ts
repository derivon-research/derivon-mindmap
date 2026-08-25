import { describe, expect, it, vi } from 'vitest';
import { validateDocument } from './domain';
import { WORKSPACE_AGENT_FILES } from './agentSkill';
import { sampleDocument, sampleWorkspace } from './sample';
import {
  attachWorkspaceAgentFiles,
  createDocumentDirectory,
  ensureWorkspaceDirectoryPermission,
  migrateLegacyDocument,
  parseWorkspaceSnapshot,
  readWorkspaceDirectorySnapshot,
  validateWorkspace,
  workspaceRevision,
  writeWorkspaceToNewDirectory,
} from './workspace';

function memoryDirectory(initial: Record<string, string> = {}): {
  handle: FileSystemDirectoryHandle;
  read(path: string): string | undefined;
  write(path: string, content: string): void;
} {
  const files = new Map(Object.entries(initial));
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
          return { text: async () => files.get(filePath) ?? '' } as File;
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
    write: (path, content) => files.set(path, content),
  };
}

describe('authoring workspace', () => {
  it('bundles one Derivon skill for common coding-agent discovery paths', () => {
    const paths = Object.keys(WORKSPACE_AGENT_FILES);
    expect(paths).toContain('.agents/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.claude/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.github/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.agents/skills/derivon-math-authoring/SKILL.md');
    expect(paths).toContain('.claude/skills/derivon-math-authoring/SKILL.md');
    expect(paths).toContain('.github/skills/derivon-math-authoring/SKILL.md');
    expect(paths).toContain('.derivon/agent/references/README.md');
    expect(paths).toContain('.derivon/agent/references/model.md');
    expect(paths).toContain('.derivon/agent/references/derivon-paper.md');
    expect(paths).toContain('.derivon/agent/references/learning-route-hypergraph.md');
    expect(paths).toContain('.derivon/agent/validate-workspace.mjs');

    const workspaceSkills = paths.filter((path) => path.endsWith('/derivon-workspace/SKILL.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(workspaceSkills).size).toBe(1);
    expect(workspaceSkills[0]).toContain('name: derivon-workspace');
    expect(workspaceSkills[0]).toContain('managed-by: derivon-mindmap-demo');
    expect(workspaceSkills[0]).toContain('Required model references');
    expect(workspaceSkills[0]).toContain('Review a derivation');
    expect(workspaceSkills[0]).toContain('missing prerequisite');
    expect(workspaceSkills[0]).toContain('automatically sized sandboxed iframe');
    expect(workspaceSkills[0]).not.toContain('SVG diagrams, Canvas simulations');
    const mathSkills = paths.filter((path) => path.endsWith('/derivon-math-authoring/SKILL.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(mathSkills).size).toBe(1);
    expect(mathSkills[0]).toContain('name: derivon-math-authoring');
    expect(mathSkills[0]).toContain('excellent introductory');
    expect(mathSkills[0]).toContain('Before a formula, explain the plan');
    expect(mathSkills[0]).toContain('Interactive mathematical HTML');
    expect(WORKSPACE_AGENT_FILES['.derivon/agent/references/README.md']).toContain('Migration when official documentation ships');
    const model = WORKSPACE_AGENT_FILES['.derivon/agent/references/model.md'];
    expect(model).toContain('Empty tail is not the start set');
    expect(model).toContain('A Query is');
    expect(model).toContain('a **Derivation** for query');
    expect(model).toContain('AND and OR without group objects');
    expect(model).toContain('three different route costs');
    expect(WORKSPACE_AGENT_FILES['.derivon/agent/references/derivon-paper.md']).toContain('Definition 1 (Graph)');
    const blog = WORKSPACE_AGENT_FILES['.derivon/agent/references/learning-route-hypergraph.md'];
    expect(blog).toContain('加权有向 B-超图');
    expect(blog).toContain('区间宽度同时是「图质量指标」和「问题难度指标」');
    expect(WORKSPACE_AGENT_FILES['.derivon/agent/validate-workspace.mjs']).toContain('--review');
  });

  it('attaches missing agent files without overwriting an unmarked customized skill', async () => {
    const customPath = '.agents/skills/derivon-workspace/SKILL.md';
    const directory = memoryDirectory({ [customPath]: 'custom instructions\n' });

    await attachWorkspaceAgentFiles(directory.handle);

    expect(directory.read(customPath)).toBe('custom instructions\n');
    for (const [path, content] of Object.entries(WORKSPACE_AGENT_FILES)) {
      expect(directory.read(path)).toBe(path === customPath ? 'custom instructions\n' : content);
    }
  });

  it('upgrades an outdated application-managed agent file', async () => {
    const managedPath = '.agents/skills/derivon-workspace/SKILL.md';
    const directory = memoryDirectory({
      [managedPath]: '---\nmanaged-by: derivon-mindmap-demo\nreference-set: old\n---\n',
    });

    await attachWorkspaceAgentFiles(directory.handle);

    expect(directory.read(managedPath)).toBe(WORKSPACE_AGENT_FILES[managedPath]);
  });

  it('preserves a user-modified generated skill during later synchronization', async () => {
    const managedPath = '.agents/skills/derivon-workspace/SKILL.md';
    const directory = memoryDirectory();
    await attachWorkspaceAgentFiles(directory.handle);
    const customized = `${directory.read(managedPath)}\nUser customization.\n`;
    directory.write(managedPath, customized);

    await attachWorkspaceAgentFiles(directory.handle);

    expect(directory.read(managedPath)).toBe(customized);
    const bundle = JSON.parse(directory.read('.derivon/agent/bundle.json')!);
    expect(bundle.protectedFiles).toContain(managedPath);
    expect(bundle.files).not.toHaveProperty(managedPath);
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

    expect(JSON.parse(directory.read('.derivon/workspace.json')!).schema).toBe('derivon.authoring/v0.2.0');
    expect(directory.read('docs/concept-a/document.md')).toBe(sampleWorkspace.files['docs/concept-a/document.md']);
    expect(directory.read('.agents/skills/derivon-workspace/SKILL.md')).toBe(WORKSPACE_AGENT_FILES['.agents/skills/derivon-workspace/SKILL.md']);
    expect(directory.read(customPath)).toBe('team instructions\n');
    expect(directory.read('.derivon/agent/bundle.json')).toContain('derivon.agent-bundle/v0.1.0');
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

  it('rejects sharing one document directory between graph objects', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.points[1].data.document = invalid.graph.points[0].data.document;
    expect(validateDocument(invalid)).toContainEqual({
      path: 'graph.points[1].data.document',
      message: 'docs/concept-a 已由 点 A 拥有',
    });
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

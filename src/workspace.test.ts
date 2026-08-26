import { describe, expect, it, vi } from 'vitest';
import { validateDocument } from './domain';
import { WORKSPACE_AGENT_FILES, WORKSPACE_AGENT_REFERENCE_SET } from './agentSkill';
import { sampleDocument, sampleWorkspace } from './sample';
import {
  attachWorkspaceAgentFiles,
  createDocumentDirectory,
  ensureWorkspaceDirectoryPermission,
  migrateLegacyDocument,
  parseWorkspaceSnapshot,
  readWorkspaceDirectorySnapshot,
  readWorkspaceDocumentSource,
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
  it('bundles layered Derivon skills and reusable resources for common agent paths', () => {
    expect(WORKSPACE_AGENT_REFERENCE_SET).toBe('provisional-2026-08-27-concept-atomicity');
    const paths = Object.keys(WORKSPACE_AGENT_FILES);
    expect(paths).toContain('.agents/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.agents/skills/derivon-workspace/scripts/render-documents.mjs');
    expect(paths).toContain('.agents/skills/derivon-workspace/scripts/audit-workspace-artifacts.mjs');
    expect(paths).toContain('.claude/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.claude/skills/derivon-workspace/scripts/render-documents.mjs');
    expect(paths).toContain('.claude/skills/derivon-workspace/scripts/audit-workspace-artifacts.mjs');
    expect(paths).toContain('.github/skills/derivon-workspace/SKILL.md');
    expect(paths).toContain('.github/skills/derivon-workspace/scripts/render-documents.mjs');
    expect(paths).toContain('.github/skills/derivon-workspace/scripts/audit-workspace-artifacts.mjs');
    for (const root of ['.agents', '.claude', '.github']) {
      expect(paths).toContain(`${root}/skills/derivon-learning-graph/SKILL.md`);
      expect(paths).toContain(`${root}/skills/derivon-learning-graph/references/source-import.md`);
      expect(paths).toContain(`${root}/skills/derivon-learning-graph/references/weight-calibration.md`);
      expect(paths).toContain(`${root}/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs`);
      expect(paths).toContain(`${root}/skills/derivon-document-authoring/SKILL.md`);
      expect(paths).toContain(`${root}/skills/derivon-document-authoring/references/large-scale-authoring.md`);
      expect(paths).toContain(`${root}/skills/derivon-document-authoring/scripts/audit-document-pages.mjs`);
      expect(paths).toContain(`${root}/skills/derivon-math-authoring/SKILL.md`);
      expect(paths).not.toContain(`${root}/skills/derivon-math-authoring/references/large-scale-authoring.md`);
      expect(paths).not.toContain(`${root}/skills/derivon-math-authoring/scripts/audit-math-pages.mjs`);
    }
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
    expect(workspaceSkills[0]).toContain('audit-workspace-artifacts.mjs');
    expect(workspaceSkills[0]).toContain('Move reusable deterministic logic');
    expect(workspaceSkills[0]).toContain('Preserve pre-existing or unknown files');
    expect(workspaceSkills[0]).toContain('Use `derivon-learning-graph`');
    expect(workspaceSkills[0]).not.toContain('SVG diagrams, Canvas simulations');
    const learningSkills = paths.filter((path) => path.endsWith('/derivon-learning-graph/SKILL.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(learningSkills).size).toBe(1);
    expect(learningSkills[0]).toContain('concept identity and scope');
    expect(learningSkills[0]).toContain('historical influence');
    expect(learningSkills[0]).toContain('weight-calibration.md');
    expect(learningSkills[0]).toContain('Enforce concept atomicity');
    expect(learningSkills[0]).toContain('mandatory review signal');
    const sourceImportReferences = paths.filter((path) => path.endsWith('/references/source-import.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(sourceImportReferences).size).toBe(1);
    expect(sourceImportReferences[0]).toContain('This distinction is especially important in philosophy');
    expect(sourceImportReferences[0]).toContain('Produce minimal object documents');
    expect(sourceImportReferences[0]).toContain('record an atomicity decision before integration');
    const weightReferences = paths.filter((path) => path.endsWith('/references/weight-calibration.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(weightReferences).size).toBe(1);
    expect(weightReferences[0]).toContain('marginal cognitive effort');
    expect(weightReferences[0]).toContain('| 5 | A major learning unit');
    expect(weightReferences[0]).toContain('it is not an integer enum');
    expect(weightReferences[0]).toContain('A concentrated distribution is not inherently defective');
    expect(weightReferences[0]).toContain('limited coverage for testing whether variable weights change route selection');
    expect(weightReferences[0]).toContain('`1.9`,\n`2.0`, and `2.1`');
    const documentSkills = paths.filter((path) => path.endsWith('/derivon-document-authoring/SKILL.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(documentSkills).size).toBe(1);
    expect(documentSkills[0]).toContain('The user must explicitly ask');
    expect(documentSkills[0]).toContain('more than five documents');
    expect(documentSkills[0]).toContain('responsive normal flow');
    const mathSkills = paths.filter((path) => path.endsWith('/derivon-math-authoring/SKILL.md')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(mathSkills).size).toBe(1);
    expect(mathSkills[0]).toContain('name: derivon-math-authoring');
    expect(mathSkills[0]).toContain('Do not turn a request to import');
    expect(mathSkills[0]).toContain('Before a substantial formula');
    expect(mathSkills[0]).toContain('Mathematical visual decisions');
    const largeScaleReferences = paths
      .filter((path) => path.endsWith('/references/large-scale-authoring.md'))
      .map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(largeScaleReferences).size).toBe(1);
    expect(largeScaleReferences[0]).toContain('actively use them');
    expect(largeScaleReferences[0]).toContain('tell the user before undertaking');
    expect(largeScaleReferences[0]).toContain('at most one repair pass');
    const renderScripts = paths.filter((path) => path.endsWith('/scripts/render-documents.mjs')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(renderScripts).size).toBe(1);
    expect(renderScripts[0]).toContain('marked-katex-extension');
    expect(renderScripts[0]).toContain("argv.includes('--write')");
    const workspaceAuditScripts = paths.filter((path) => path.endsWith('/scripts/audit-workspace-artifacts.mjs')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(workspaceAuditScripts).size).toBe(1);
    expect(workspaceAuditScripts[0]).toContain('unownedDocumentDirectories');
    expect(workspaceAuditScripts[0]).toContain('workspaceHelperCandidates');
    expect(workspaceAuditScripts[0]).toContain('It never deletes or changes files');
    const graphAuditScripts = paths.filter((path) => path.endsWith('/scripts/audit-learning-graph.mjs')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(graphAuditScripts).size).toBe(1);
    expect(graphAuditScripts[0]).toContain('weightHistogram');
    expect(graphAuditScripts[0]).toContain('weightAnchorBands');
    expect(graphAuditScripts[0]).toContain('weightStatistics');
    expect(graphAuditScripts[0]).toContain('reviewSignals');
    expect(graphAuditScripts[0]).toContain('consistently atomic granularity');
    expect(graphAuditScripts[0]).toContain('limited coverage for testing variable-weight routing');
    expect(graphAuditScripts[0]).toContain('expected at most one decimal place');
    expect(graphAuditScripts[0]).toContain('parallelRoutes');
    expect(graphAuditScripts[0]).toContain('alternativeHeads');
    const documentAuditScripts = paths.filter((path) => path.endsWith('/scripts/audit-document-pages.mjs')).map((path) => WORKSPACE_AGENT_FILES[path]);
    expect(new Set(documentAuditScripts).size).toBe(1);
    expect(documentAuditScripts[0]).toContain('formulaOverflow');
    expect(documentAuditScripts[0]).toContain('componentScroll');
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

  it('removes retired managed files while preserving customized retired files', async () => {
    const retiredPath = '.agents/skills/retired/SKILL.md';
    const customizedPath = '.agents/skills/customized-retired/SKILL.md';
    const generated = 'generated instructions\n';
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(generated)));
    const digest = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const directory = memoryDirectory({
      [retiredPath]: generated,
      [customizedPath]: `${generated}user changes\n`,
      '.derivon/agent/bundle.json': `${JSON.stringify({
        schema: 'derivon.agent-bundle/v0.1.0',
        referenceSet: 'retired-set',
        files: { [retiredPath]: digest, [customizedPath]: digest },
        protectedFiles: [],
      })}\n`,
    });

    await attachWorkspaceAgentFiles(directory.handle);

    expect(directory.read(retiredPath)).toBeUndefined();
    expect(directory.read(customizedPath)).toBe(`${generated}user changes\n`);
    const bundle = JSON.parse(directory.read('.derivon/agent/bundle.json')!);
    expect(bundle.files).not.toHaveProperty(retiredPath);
    expect(bundle.protectedFiles).toContain(customizedPath);
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

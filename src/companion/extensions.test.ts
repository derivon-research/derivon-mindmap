import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brokenExtension, echoExtension, installExtension, writeExtension } from '../testing/extensions';
import {
  extensionRoots,
  extensionToolNames,
  openExtensions,
  readTrustStore,
  trustDecisionAt,
  trustFile,
  type TrustStore,
} from './extensions';

async function directory(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/** A root that exists and holds nothing: an installed-nothing machine, not a missing root. */
async function emptyRoot(): Promise<string> {
  return directory('derivon-extensions-empty-');
}

describe('the two roots', () => {
  it('is the application root, and the workspace\'s own only once there is a workspace', () => {
    expect(extensionRoots('/home/operator/.derivon', null)).toEqual([
      { path: path.join('/home/operator/.derivon', 'extensions'), project: false },
    ]);
    expect(extensionRoots('/home/operator/.derivon', '/work/graph')).toEqual([
      { path: path.join('/home/operator/.derivon', 'extensions'), project: false },
      { path: path.join('/work/graph', '.derivon', 'extensions'), project: true },
    ]);
  });
});

describe('the trust store', () => {
  it('is nothing at all when the operator has never written one', async () => {
    const config = await directory('derivon-trust-missing-');
    expect(readTrustStore(trustFile(config))).toEqual({ trust: new Map() });
  });

  it('reads each path with its decision', async () => {
    const config = await directory('derivon-trust-read-');
    const file = trustFile(config);
    await writeFile(file, JSON.stringify({ '/work/graph': true, '/work/other': false }));
    const { trust, note } = readTrustStore(file);
    expect(note).toBeUndefined();
    expect(trust.get(path.resolve('/work/graph'))).toBe(true);
    expect(trust.get(path.resolve('/work/other'))).toBe(false);
  });

  it('trusts nothing when it cannot be parsed, and says so rather than throwing', async () => {
    const config = await directory('derivon-trust-broken-');
    const file = trustFile(config);
    await writeFile(file, '{ this is not json');
    const { trust, note } = readTrustStore(file);
    expect(trust.size).toBe(0);
    expect(note).toContain(file);

    await writeFile(file, JSON.stringify(['/work/graph']));
    const notAnObject = readTrustStore(file);
    expect(notAnObject.trust.size).toBe(0);
    expect(notAnObject.note).toContain(file);
  });

  it('lets the nearest entry decide, and lets a closer no take a farther yes back', () => {
    const trust: TrustStore = new Map([
      [path.resolve('/work'), true],
      [path.resolve('/work/private'), false],
    ]);
    expect(trustDecisionAt(trust, '/work/graph')).toBe(true);
    expect(trustDecisionAt(trust, '/work/private/graph')).toBe(false);
    // An entry below the project cannot speak for it.
    expect(trustDecisionAt(new Map([[path.resolve('/work/graph/sub'), true]]), '/work/graph')).toBe(false);
    expect(trustDecisionAt(new Map(), '/work/graph')).toBe(false);
  });
});

describe('loading the extensions a session may hold', () => {
  it('loads a user-level extension and hands back the tool it registered', async () => {
    const config = await directory('derivon-extensions-user-');
    await installExtension(path.join(config, 'extensions'), 'echo', echoExtension);
    const state = await openExtensions({ configDirectory: config, workspacePath: null });
    expect(state.errors).toEqual([]);
    expect(state.notes).toEqual([]);
    expect(extensionToolNames(state)).toEqual(['fixture-echo']);
    expect(state.extensions[0]?.resolvedPath).toContain('echo.ts');
  });

  it('ignores a root that is not there, and says nothing about it', async () => {
    const config = await directory('derivon-extensions-absent-');
    const workspace = await directory('derivon-extensions-absent-ws-');
    const state = await openExtensions({ configDirectory: config, workspacePath: workspace });
    expect(state.extensions).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(state.notes).toEqual([]);
  });

  it('reports an extension that will not load without failing the load', async () => {
    const config = await emptyRoot();
    await installExtension(path.join(config, 'extensions'), 'broken', brokenExtension);
    await installExtension(path.join(config, 'extensions'), 'echo', echoExtension);
    const state = await openExtensions({ configDirectory: config, workspacePath: null });
    // The broken one is a note and an error entry; the other one still arrives.
    expect(extensionToolNames(state)).toEqual(['fixture-echo']);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.path).toContain('broken.ts');
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]).toContain('扩展加载失败');
    expect(state.notes[0]).toContain('this extension refuses to load');
  });

  it('does not load a project-level extension until the project is trusted', async () => {
    const config = await directory('derivon-extensions-untrusted-');
    const workspace = await directory('derivon-extensions-untrusted-ws-');
    await installExtension(path.join(workspace, '.derivon', 'extensions'), 'echo', echoExtension);
    // The operator's own root holds one too: an untrusted project must not take that away.
    await installExtension(path.join(config, 'extensions'), 'mine', writeExtension);

    const state = await openExtensions({ configDirectory: config, workspacePath: workspace });
    expect(extensionToolNames(state)).toEqual(['write']);
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]).toContain('项目级扩展未加载');
    expect(state.notes[0]).toContain(workspace);
    expect(state.notes[0]).toContain(trustFile(config));
  });

  it('loads the project\'s extensions once the project is trusted, exactly and by parent', async () => {
    const config = await directory('derivon-extensions-trusted-');
    const workspace = path.join(config, 'workspace');
    await installExtension(path.join(workspace, '.derivon', 'extensions'), 'echo', echoExtension);

    const exact = await openExtensions({
      configDirectory: config,
      workspacePath: workspace,
    });
    // Nothing is trusted yet, and the project root is there, so the skip is said out loud.
    expect(exact.notes).toHaveLength(1);
    expect(exact.notes[0]).toContain('未受信任');
    expect(extensionToolNames(exact)).toEqual([]);

    await writeFile(trustFile(config), JSON.stringify({ [workspace]: true }));
    const trusted = await openExtensions({ configDirectory: config, workspacePath: workspace });
    expect(trusted.notes).toEqual([]);
    expect(extensionToolNames(trusted)).toEqual(['fixture-echo']);

    // A parent entry covers what is inside it, which is how a whole checkout is trusted once.
    await writeFile(trustFile(config), JSON.stringify({ [config]: true }));
    const byParent = await openExtensions({ configDirectory: config, workspacePath: workspace });
    expect(extensionToolNames(byParent)).toEqual(['fixture-echo']);
  });

  it('says nothing about a project root that is not there, trusted or not', async () => {
    const config = await directory('derivon-extensions-noproject-');
    const workspace = await directory('derivon-extensions-noproject-ws-');
    const state = await openExtensions({ configDirectory: config, workspacePath: workspace });
    expect(state.notes).toEqual([]);
  });
});

describe('the tool names an extension state offers', () => {
  it('names each tool once, whoever registered it', async () => {
    const config = await directory('derivon-extensions-names-');
    await installExtension(path.join(config, 'extensions'), 'echo', echoExtension);
    await installExtension(path.join(config, 'extensions'), 'also-echo', echoExtension);
    const state = await openExtensions({ configDirectory: config, workspacePath: null });
    expect(extensionToolNames(state)).toEqual(['fixture-echo']);
  });
});

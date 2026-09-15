import { existsSync, lstatSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_DIR_ENVIRONMENT_VARIABLE, installNodeShim, nodeShim, prepareSessionEnvironment,
} from './sessionEnvironment';

let directory: string;
const savedAgentDirectory = process.env[AGENT_DIR_ENVIRONMENT_VARIABLE];

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-environment-'));
});

afterEach(() => {
  if (savedAgentDirectory === undefined) delete process.env[AGENT_DIR_ENVIRONMENT_VARIABLE];
  else process.env[AGENT_DIR_ENVIRONMENT_VARIABLE] = savedAgentDirectory;
});

describe('the node a session finds', () => {
  it('is a link to the runtime the companion was started with', () => {
    expect(nodeShim({ binDirectory: path.join(directory, 'bin'), execPath: '/apps/node', platform: 'darwin' }))
      .toEqual({ kind: 'symlink', path: path.join(directory, 'bin', 'node'), target: '/apps/node' });
  });

  it('is a forwarding script on Windows, never a copy of the runtime', () => {
    const shim = nodeShim({ binDirectory: 'C:\\root\\bin', execPath: 'C:\\apps\\node.exe', platform: 'win32' });
    expect(shim.kind).toBe('command');
    if (shim.kind !== 'command') throw new Error('unreachable');
    expect(path.basename(shim.path)).toBe('node.cmd');
    expect(shim.content).toContain('C:\\apps\\node.exe');
    expect(shim.content).toContain('%*');
  });
});

describe('installing the node shim', () => {
  it('creates the link once, and follows a runtime that moved', async () => {
    const bin = path.join(directory, 'bin');
    const first = nodeShim({ binDirectory: bin, execPath: '/apps/node-1', platform: 'darwin' });
    expect(installNodeShim(first)).toBeNull();
    expect(await readlink(path.join(bin, 'node'))).toBe('/apps/node-1');
    // Already right: a second run has nothing to do.
    expect(installNodeShim(first)).toBeNull();
    // A runtime that moved: the link follows it rather than dangling at the old path.
    expect(installNodeShim(nodeShim({ binDirectory: bin, execPath: '/apps/node-2', platform: 'darwin' })))
      .toBeNull();
    expect(await readlink(path.join(bin, 'node'))).toBe('/apps/node-2');
  });

  it('leaves a file the operator put there alone, and says so', async () => {
    const bin = path.join(directory, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, 'node'), '#!/bin/sh\n');
    const note = installNodeShim(nodeShim({ binDirectory: bin, execPath: '/apps/node', platform: 'darwin' }));
    expect(note).toContain('未改动');
    expect(await readFile(path.join(bin, 'node'), 'utf8')).toBe('#!/bin/sh\n');
  });

  it('writes the Windows forwarding script, and rewrites a stale one', async () => {
    const bin = path.join(directory, 'bin');
    const shim = nodeShim({ binDirectory: bin, execPath: 'C:\\apps\\node.exe', platform: 'win32' });
    if (shim.kind !== 'command') throw new Error('unreachable');
    expect(installNodeShim(shim)).toBeNull();
    expect(await readFile(shim.path, 'utf8')).toBe(shim.content);
    expect(installNodeShim(shim)).toBeNull();
    await writeFile(shim.path, '@echo off\n');
    expect(installNodeShim(shim)).toBeNull();
    expect(await readFile(shim.path, 'utf8')).toBe(shim.content);
  });

  it('defers to a real runtime beside the script', async () => {
    const bin = path.join(directory, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, 'node.exe'), 'runtime');
    const shim = nodeShim({ binDirectory: bin, execPath: 'C:\\apps\\node.exe', platform: 'win32' });
    expect(installNodeShim(shim)).toContain('node.exe');
    expect(existsSync(shim.path)).toBe(false);
  });

  it('reports a bin directory it cannot write, rather than failing', async () => {
    const file = path.join(directory, 'not-a-directory');
    await writeFile(file, 'x');
    const note = installNodeShim(nodeShim({
      binDirectory: path.join(file, 'bin'),
      execPath: '/apps/node',
      platform: 'darwin',
    }));
    expect(note).toContain('无法提供');
  });
});

describe('preparing the session environment', () => {
  it("points Pi's agent directory at the application's root", () => {
    const environment = prepareSessionEnvironment({
      configDirectory: directory,
      platform: 'darwin',
      execPath: '/apps/node',
      findShell: () => ({ found: true, path: '/bin/bash' }),
    });
    // This is the whole point: `getShellEnv` builds the session's PATH from
    // `getAgentDir()/bin`, so the agent directory *is* the PATH prefix.
    expect(getAgentDir()).toBe(directory);
    expect(environment.shellTool).toBe('bash');
    expect(environment.notes).toEqual([]);
    // `existsSync` would follow the link; the runtime it names need not exist in this test.
    expect(lstatSync(path.join(directory, 'bin', 'node')).isSymbolicLink()).toBe(true);
  });

  it('grants PowerShell on Windows', () => {
    const environment = prepareSessionEnvironment({
      configDirectory: directory,
      platform: 'win32',
      execPath: 'C:\\apps\\node.exe',
      findShell: () => ({ found: true, path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }),
    });
    expect(environment.shellTool).toBe('powershell');
    expect(existsSync(path.join(directory, 'bin', 'node.cmd'))).toBe(true);
    expect(environment.notes).toEqual([]);
  });

  it('says which shell it could not find, and stays usable', () => {
    const environment = prepareSessionEnvironment({
      configDirectory: directory,
      platform: 'win32',
      execPath: 'C:\\apps\\node.exe',
      findShell: () => ({ found: false, searched: 'PATH 上的 pwsh.exe 或 powershell.exe' }),
    });
    expect(environment.notes.join('\n')).toContain('powershell.exe');
    expect(environment.shellTool).toBe('powershell');
  });
});

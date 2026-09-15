import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bashWritesWorkspace, canonicalizeNearest, guardDecision, powershellWriteTargets,
  powershellWritesWorkspace, writeTargets,
} from './guard';

let workspace: string;
let outside: string;

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'derivon-guard-'));
  // The runtime canonicalizes the workspace root before judging anything against it, because
  // a temporary directory is reached through a symlink on macOS (`/var` -> `/private/var`).
  workspace = canonicalizeNearest(path.join(root, 'workspace'));
  outside = canonicalizeNearest(path.join(root, 'elsewhere'));
  await mkdir(workspace);
  await mkdir(outside);
  // A directory inside the workspace that resolves outside it: a path-prefix check would
  // call a write here a workspace write, and it is not one.
  await symlink(outside, path.join(workspace, 'linked'));
});

const blocked = (toolName: string, input: unknown) => Boolean(guardDecision(toolName, input, workspace));

describe('path tools', () => {
  it('refuses a write or edit whose target resolves inside the workspace', () => {
    expect(blocked('write', { path: 'objects/c-1/document.md' })).toBe(true);
    expect(blocked('write', { path: path.join(workspace, '.derivon/workspace.json') })).toBe(true);
    expect(blocked('edit', { path: 'notes.md' })).toBe(true);
  });

  it('leaves a write outside the workspace alone', () => {
    expect(blocked('write', { path: '/tmp/notes.md' })).toBe(false);
    expect(blocked('write', { path: '../elsewhere/notes.md' })).toBe(false);
    expect(blocked('edit', { path: path.join(outside, 'notes.md') })).toBe(false);
  });

  it('judges a symlinked directory by where it really points', () => {
    expect(blocked('write', { path: 'linked/notes.md' })).toBe(false);
    expect(blocked('write', { path: path.join(workspace, 'linked', 'notes.md') })).toBe(false);
  });

  it('says nothing about a call that is not about writing', () => {
    expect(blocked('read', { path: 'objects/c-1/document.md' })).toBe(false);
    expect(blocked('grep', { pattern: 'x' })).toBe(false);
    expect(blocked('write', {})).toBe(false);
  });
});

describe('shell commands', () => {
  it('refuses the forms that write where the shell would land', () => {
    for (const command of [
      'echo hello > poc.txt',
      'echo hello >> objects/c-1/document.md',
      'rm -rf objects',
      'mkdir -p notes',
      'touch notes.md',
      'cp /tmp/source.md document.md',
      'mv document.md renamed.md',
      'sed -i s/a/b/ document.md',
      'dd if=/dev/zero of=out.bin count=1',
      `echo hello > ${path.join(workspace, 'notes.md')}`,
    ]) {
      expect(bashWritesWorkspace(command, workspace), command).toBe(true);
    }
  });

  it('leaves reads and writes elsewhere alone', () => {
    for (const command of [
      'ls -la',
      'rg --files .',
      'cat document.md',
      'sed -n 1p document.md',
      'find . -name "*.md"',
      'echo hello > /tmp/poc.txt',
      'echo hello > ~/poc.txt',
      'rm -f /tmp/poc.txt',
      'cp a.md /tmp/b.md',
      'dd if=/dev/zero of=/tmp/out.bin count=1',
      'tavily-cli search "hypergraph closure"',
      `ls ${workspace}`,
    ]) {
      expect(bashWritesWorkspace(command, workspace), command).toBe(false);
    }
  });

  it('reads the redirection target rather than treating every word as a path', () => {
    expect(writeTargets('echo "a b c" > out.txt')).toEqual(['out.txt']);
    expect(writeTargets('grep ">" document.md')).toEqual([]);
  });

  it('names a path inside the workspace as one of the targets', () => {
    expect(writeTargets('cp /tmp/a.md b.md')).toEqual(['b.md']);
    expect(writeTargets('rm -rf a b')).toEqual(['a', 'b']);
  });
});

describe('PowerShell commands', () => {
  it('refuses the forms that write where PowerShell would land', () => {
    for (const command of [
      'Set-Content -Path notes.md -Value hello',
      'set-content notes.md hello',
      'Add-Content -Path objects/c-1/document.md -Value hello',
      'Out-File -FilePath poc.txt',
      'New-Item -ItemType Directory -Path notes',
      'Remove-Item objects/c-1',
      'Remove-Item -Recurse a, b',
      'Move-Item document.md renamed.md',
      'Copy-Item /tmp/source.md document.md',
      'Rename-Item -Path document.md -NewName renamed.md',
      'echo hello > poc.txt',
      'echo hello >> objects/c-1/document.md',
      'Get-Content x | Set-Content poc.txt',
      `Set-Content -Path ${path.join(workspace, 'notes.md')} -Value x`,
      `Set-Content -Path:'${path.join(workspace, 'notes.md')}' -Value x`,
    ]) {
      expect(powershellWritesWorkspace(command, workspace), command).toBe(true);
    }
  });

  it('leaves reads and writes elsewhere alone', () => {
    for (const command of [
      'Get-Content document.md',
      'Get-ChildItem .',
      'Select-String -Pattern x document.md',
      'Set-Content -Path /tmp/out.txt -Value x',
      'Out-File -FilePath /tmp/out.txt',
      'New-Item -ItemType Directory -Path /tmp/notes',
      'Remove-Item -Recurse /tmp/notes',
      'Move-Item /tmp/a.md /tmp/b.md',
      'Copy-Item document.md /tmp/b.md',
      'Rename-Item -Path /tmp/a.md -NewName b.md',
      'echo hello > /tmp/poc.txt',
      'Set-Content -Path ~/poc.txt -Value x',
      `Get-ChildItem ${workspace}`,
    ]) {
      expect(powershellWritesWorkspace(command, workspace), command).toBe(false);
    }
  });

  it('does not mistake a value operand for a path', () => {
    expect(powershellWriteTargets('Set-Content /tmp/out.txt -Value hello')).toEqual(['/tmp/out.txt']);
    expect(powershellWriteTargets('Set-Content -Path /tmp/out.txt hello')).toEqual(['/tmp/out.txt']);
    expect(powershellWriteTargets('Get-Content a | Out-File /tmp/b.txt')).toEqual(['/tmp/b.txt']);
  });

  it('resolves an absolute path before judging it, and refuses a relative one outright', () => {
    // Relative to the session's working directory, which is the workspace — refused without
    // consulting the link, the same as the POSIX shell rule.
    expect(powershellWritesWorkspace('Set-Content -Path linked/notes.md -Value x', workspace)).toBe(true);
    // Absolute: the link's real target answers, and it is outside the workspace.
    expect(powershellWritesWorkspace(`Set-Content -Path ${path.join(workspace, 'linked/notes.md')} -Value x`, workspace)).toBe(false);
  });

  it('refuses as the learning session, the same as the POSIX shell', () => {
    const decision = guardDecision('powershell', { command: 'Set-Content -Path poc.txt -Value x' }, workspace);
    expect(decision?.block).toBe(true);
    expect(decision?.reason).toContain('learning session');
  });
});

describe('what the model is told', () => {
  it('refuses as the learning session rather than as a tool failure', () => {
    const decision = guardDecision('bash', { command: 'echo hello > poc.txt' }, workspace);
    expect(decision?.block).toBe(true);
    expect(decision?.reason).toContain('learning session');
  });

  it('names the file it refused to write', () => {
    const decision = guardDecision('write', { path: 'objects/c-1/document.md' }, workspace);
    expect(decision?.reason).toContain('objects/c-1/document.md');
  });
});

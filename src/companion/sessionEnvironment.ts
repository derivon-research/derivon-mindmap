import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getAgentDir, getPowerShellConfig, getShellConfig } from '@earendil-works/pi-coding-agent';
import { shellToolName, type ShellTool } from './commandSurface';

/**
 * Pi's variable for its agent directory.
 *
 * The session's PATH is built by `getShellEnv()` from `getAgentDir()/bin`, and `getAgentDir()`
 * reads *this variable*: `createAgentSession`'s `agentDir` option moves Pi's loader, settings
 * and session directories, but not the directory the shell's PATH comes from. The SDK exports
 * neither the variable's name nor `getShellEnv`, so the name is spelled here and then checked
 * — `pointsAtOurRoot` — so a change on Pi's side is a diagnostic line instead of the session
 * quietly getting `~/.pi/agent/bin` again. The companion never reads or writes `~/.pi/`
 * (ADR-0010).
 */
export const AGENT_DIR_ENVIRONMENT_VARIABLE = 'PI_CODING_AGENT_DIR';

/** The shell the platform offers a session, or what was searched for one. */
export type ShellLookup =
  | { readonly found: true }
  | { readonly found: false; readonly searched: string };

/** Injected by tests, so the answer is a fixture rather than whatever this machine has. */
export type ShellFinder = (platform: NodeJS.Platform) => ShellLookup;

/** What `<root>/bin/node` is: a link to the runtime, or a forwarding script where a link is not available. */
export type NodeShim =
  | { readonly kind: 'symlink'; readonly path: string; readonly target: string }
  | { readonly kind: 'command'; readonly path: string; readonly content: string };

export type SessionEnvironment = {
  /** The shell tool name this session holds; the grant itself is `sessionToolNames`. */
  readonly shellTool: ShellTool;
  /** What could not be arranged, for the operator's stderr. Empty when nothing was wrong. */
  readonly notes: readonly string[];
};

/**
 * What `<root>/bin/node` should be.
 *
 * A symlink to the runtime the companion itself was started with — the sidecar Rust launches,
 * so the session's `node` is the application's runtime and not one borrowed from the operator.
 * On Windows a symlink needs a privilege an installer does not have, so the shim is a `.cmd`
 * that forwards, never a copy: the runtime is around 110 MB and it already ships beside the
 * companion.
 */
export function nodeShim(options: {
  readonly binDirectory: string;
  readonly execPath: string;
  readonly platform: NodeJS.Platform;
}): NodeShim {
  const { binDirectory, execPath, platform } = options;
  if (platform === 'win32') {
    return {
      kind: 'command',
      path: path.join(binDirectory, 'node.cmd'),
      content: `@echo off\r\n"${execPath}" %*\r\n`,
    };
  }
  return { kind: 'symlink', path: path.join(binDirectory, 'node'), target: execPath };
}

/**
 * Put the shim in place, unless it is already there and already right.
 *
 * Never throws and never fails a session: a session without a `node` still works, and the one
 * thing that fixes this is the operator's action. A regular file or directory in the shim's
 * place is left as it is and named — `<root>` is the operator's directory, and this is only a
 * convenience in it. A symlink is the shim's own slot, so a wrong or dangling one is repointed.
 */
export function installNodeShim(shim: NodeShim): string | null {
  try {
    mkdirSync(path.dirname(shim.path), { recursive: true });
  } catch (error) {
    return shimFailure(shim, error);
  }
  try {
    return shim.kind === 'symlink' ? installSymlink(shim) : installCommandFile(shim);
  } catch (error) {
    return shimFailure(shim, error);
  }
}

function shimFailure(shim: NodeShim, error: unknown): string {
  return `无法提供 ${shim.path}：${message(error)}。会话仍可用，但技能里的 node … 未必成立。`;
}

function installSymlink(shim: Extract<NodeShim, { kind: 'symlink' }>): string | null {
  const existing = lstatSync(shim.path, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink()) {
    // Already following the runtime this companion was started with: nothing to do.
    if (path.resolve(readlinkSync(shim.path)) === path.resolve(shim.target)) return null;
    unlinkSync(shim.path);
  } else if (existing) {
    return `${shim.path} 已存在且不是本应用创建的，未改动。`;
  }
  symlinkSync(shim.target, shim.path);
  return null;
}

function installCommandFile(shim: Extract<NodeShim, { kind: 'command' }>): string | null {
  const beside = path.join(path.dirname(shim.path), 'node.exe');
  // A real runtime beside the shim wins at lookup time, so adding ours would be shadowed noise.
  if (existsSync(beside)) return `${beside} 已存在，未写 ${shim.path}。`;
  if (readIfPresent(shim.path) === shim.content) return null;
  writeFileSync(shim.path, shim.content);
  return null;
}

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    // Not there, or not readable: writing it is the next step either way.
    return null;
  }
}

/**
 * Point this process's session environment at the application's own root.
 *
 * Runs once, before any session exists, and never fails. Both of its effects are
 * process-wide — Pi's agent directory, which is what puts `<root>/bin` first on the session's
 * PATH, and the `node` shim in it — and each one that could not be arranged becomes a note for
 * the caller to put on stderr rather than a refusal, because a session without either is still a
 * usable session.
 */
export function prepareSessionEnvironment(options: {
  readonly configDirectory: string;
  readonly platform?: NodeJS.Platform;
  readonly execPath?: string;
  readonly findShell?: ShellFinder;
}): SessionEnvironment {
  const platform = options.platform ?? process.platform;
  const notes: string[] = [];
  process.env[AGENT_DIR_ENVIRONMENT_VARIABLE] = options.configDirectory;
  if (!pointsAtOurRoot(options.configDirectory)) {
    notes.push(`Pi 的 agent 目录没有指向 ${options.configDirectory}（现在是 ${getAgentDir()}），会话的 PATH 可能仍以 ~/.pi/agent/bin 开头。`);
  }
  const diagnostic = installNodeShim(nodeShim({
    binDirectory: path.join(options.configDirectory, 'bin'),
    execPath: options.execPath ?? process.execPath,
    platform,
  }));
  if (diagnostic) notes.push(diagnostic);
  const shell = (options.findShell ?? findShell)(platform);
  if (!shell.found) {
    notes.push(`没有找到 shell：${shell.searched}。${shellToolName(platform)} 工具调用会失败，会话本身仍可用。`);
  }
  return { shellTool: shellToolName(platform), notes };
}

/**
 * Whether Pi now resolves its agent directory — and so the session's PATH prefix — to our root.
 *
 * This is the check that makes the hard-coded variable name safe: if Pi renames it, the session
 * gets a diagnostic instead of silently borrowing `~/.pi/agent/bin`.
 */
function pointsAtOurRoot(configDirectory: string): boolean {
  return path.resolve(getAgentDir()) === path.resolve(configDirectory);
}

/**
 * The shell this platform offers.
 *
 * Windows has no `bash` to rely on — Pi's `bash` tool looks for Git Bash, which this
 * application does not require and the companion's cleared environment does not find — while
 * PowerShell is there on any Windows install. Everywhere else `bash` is what Pi resolves.
 */
function findShell(platform: NodeJS.Platform): ShellLookup {
  if (platform === 'win32') {
    try {
      getPowerShellConfig();
      return { found: true };
    } catch {
      return { found: false, searched: 'PATH 上的 pwsh.exe 或 powershell.exe' };
    }
  }
  const config = getShellConfig();
  return onPath(config.shell, platform)
    ? { found: true }
    : { found: false, searched: 'PATH 上的 bash 或 sh，以及 /bin/bash' };
}

/** Whether a command name resolves to an existing file, the way the shell would find it. */
function onPath(command: string, platform: NodeJS.Platform): boolean {
  if (command.includes('/') || command.includes('\\')) return existsSync(command);
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  return (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
    .some((entry) => suffixes.some((suffix) => existsSync(path.join(entry, `${command}${suffix}`))));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

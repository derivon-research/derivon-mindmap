import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadSkills, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ConversationMode } from '../ports/ConversationProvider';

type Mode = ConversationMode;

/** Where a skill keeps its command surface, inside the skill's own directory. */
const SURFACE_SCRIPT_NAME = 'derivon-workspace.mjs';
const SURFACE_SCRIPT = ['scripts', SURFACE_SCRIPT_NAME] as const;

/**
 * Which (artifact, capability) pairs a mode holds.
 *
 * The command surface holds command → capability; this table holds mode → capability; a
 * session receives the intersection. The words themselves have one owner — ADR-0011 and
 * `CONTEXT.md` — so this is the only place the client spells them, and there is no second
 * command list: every tool is derived from `--capabilities`.
 */
export type Grant = {
  readonly artifact: string;
  readonly capability: string;
};

const MODE_GRANTS = {
  authoring: [
    { artifact: 'workspace', capability: 'read' },
    { artifact: 'workspace', capability: 'write-structure' },
    { artifact: 'workspace', capability: 'write-document' },
    { artifact: 'workspace', capability: 'delete' },
    { artifact: 'workspace', capability: 'import' },
  ],
  learning: [
    { artifact: 'workspace', capability: 'read' },
    { artifact: 'learner-records', capability: 'read-learner-record' },
  ],
} satisfies Record<Mode, readonly Grant[]>;

/**
 * Built-in tools a mode grants itself, on the other axis from capability.
 *
 * Built-ins start disabled (`settings.defaultTools` is the empty array in `index.ts`), and a
 * mode asks for the ones it needs. The learning session holds `bash` so a user can run
 * something like `tavily-cli` while learning; what it must not do is write inside the
 * workspace, and that is refused by the `tool_call` guard as an operation class rather than
 * by taking the tool away. Authoring asks for no built-in at all: its only tools are the
 * command surface's.
 */
const MODE_BUILTIN_GRANTS = {
  authoring: [],
  learning: ['bash'],
} satisfies Record<Mode, readonly string[]>;

export type CommandArgument = {
  readonly name: string;
  readonly positional: boolean;
  readonly flag?: string;
  readonly kind: 'path' | 'id' | 'string' | 'number' | 'boolean';
  readonly required: boolean;
  readonly repeatable: boolean;
  readonly values?: readonly string[];
  readonly description?: string;
};

export type CommandStdin = {
  readonly required: boolean;
  readonly schema: string;
  readonly description: string;
};

export type Command = {
  readonly name: string;
  readonly artifact: string;
  readonly capability: string;
  readonly summary: string;
  readonly argv: readonly CommandArgument[];
  readonly stdin: CommandStdin | null;
};

export type CommandSurface = {
  readonly scriptPath: string;
  readonly commands: readonly Command[];
};

/**
 * What the two fixed skill roots offered.
 *
 * A missing command surface is a configuration state, not an error: the session stays
 * usable and the notes are what says why it has no command tools.
 */
export type CommandSurfaceState = {
  readonly surface: CommandSurface | null;
  readonly notes: readonly string[];
};

/**
 * What one call's result means, said once: the tool's own description and the session prompt
 * both carry this sentence, and two copies would be two things to keep in step.
 */
export const COMMAND_RESULT_NOTE = 'One call is one commit. The command prints one derivon.command-result/v1 envelope on stdout: status is "ok" or "diagnostics", and issues[] carries a stable code, a path and a message. Exit 0 is clean, 1 carries diagnostics, 2 is a usage error. A diagnostics result is a normal refusal rather than a crash — read issues[].code and retry with corrected input.';

/** The two roots a command surface is installed under, in the order Pi loads skills. */
export function skillRoots(configDirectory: string, workspacePath: string): readonly string[] {
  return [path.join(configDirectory, 'skills'), path.join(workspacePath, '.derivon', 'skills')];
}

/**
 * The tools a session holds: the granted commands plus the built-ins the mode grants.
 *
 * Returned as the session's `tools` allowlist, which is the whole grant — a tool that is not
 * named here is not enabled.
 */
export function sessionToolNames(commands: readonly Command[], mode: Mode): string[] {
  return [...commands.map((command) => command.name), ...MODE_BUILTIN_GRANTS[mode]];
}

/** The commands of one mode: the intersection of the surface's declaration and the grant. */
export function grantedCommands(surface: CommandSurface, mode: Mode): readonly Command[] {
  const grants: readonly Grant[] = MODE_GRANTS[mode];
  return surface.commands.filter((command) =>
    grants.some((grant) =>
      command.artifact === grant.artifact && command.capability === grant.capability));
}

/**
 * Discover the installed command surface and read what it declares.
 *
 * Skills are discovered the way Pi discovers them — the same loader, the same one-directory-
 * per-skill rule, the same first-wins collision rule — but only from this application's two
 * roots. Pi's own skill directories (`~/.pi/agent/skills`, `.pi/skills`) are never consulted,
 * and no `SKILL.md` body enters a prompt here: this reads the script's `--capabilities`.
 */
export async function openCommandSurface(options: {
  configDirectory: string;
  workspacePath: string | null;
}): Promise<CommandSurfaceState> {
  const { configDirectory, workspacePath } = options;
  if (!workspacePath) {
    return { surface: null, notes: ['没有打开工作区，脚本命令面不可用。'] };
  }
  const roots = skillRoots(configDirectory, workspacePath);
  // The roots are passed explicitly and includeDefaults is off, so this can only read them:
  // the application has its own user-level root and does not consult Pi's (#120).
  const { skills, diagnostics } = loadSkills({
    cwd: workspacePath,
    agentDir: configDirectory,
    skillPaths: [...roots],
    includeDefaults: false,
  });
  // Pi resolves a conflict by keeping the skill it found first and diagnosing it; that
  // diagnostic is the only thing that says a choice happened, so it travels rather than
  // staying in the loader's return value.
  const notes = diagnostics
    .filter((diagnostic) => diagnostic.type === 'collision')
    .map(collisionNote);
  const scripts = skills
    .map((skill) => path.join(skill.baseDir, ...SURFACE_SCRIPT))
    .filter((scriptPath) => existsSync(scriptPath));
  if (!scripts.length) {
    return { surface: null, notes: [...notes, noSurfaceNote(roots)] };
  }
  // Pi keeps the first skill it found; the surface follows the same rule, and says so rather
  // than quietly using one of however many there are.
  const [scriptPath, ...ignored] = scripts;
  const capabilities = await readCapabilities(scriptPath);
  if (!capabilities) {
    return {
      surface: null,
      notes: [...notes, `脚本命令面不可用：${scriptPath} 没有给出可用的 --capabilities 输出（搜索过的根：${roots.join(' 和 ')}）。`],
    };
  }
  return {
    surface: { scriptPath, commands: capabilities },
    notes: [...notes, ...ignored.map((other) =>
      `发现多个脚本命令面，使用 ${scriptPath}，忽略 ${other}。`)],
  };
}

type SkillDiagnostic = ReturnType<typeof loadSkills>['diagnostics'][number];

function collisionNote(diagnostic: SkillDiagnostic): string {
  const collision = diagnostic.collision;
  if (!collision) return `技能冲突：${diagnostic.message}`;
  return `技能冲突：${diagnostic.message}（保留 ${collision.winnerPath}，忽略 ${collision.loserPath}）`;
}

function noSurfaceNote(roots: readonly string[]): string {
  return `没有可用的脚本命令面：在 ${roots.join(' 和 ')} 下都没有找到 <skill>/scripts/derivon-workspace.mjs。`;
}

/** The command surface's own description of itself, or null when it does not give one. */
async function readCapabilities(scriptPath: string): Promise<readonly Command[] | null> {
  const result = await run(scriptPath, ['--capabilities'], undefined, undefined);
  if (result.code !== 0) return null;
  return parseCapabilities(result.stdout);
}

/**
 * `--capabilities` as `derivon.command-capabilities/v1`.
 *
 * Read by shape rather than by a pinned schema string: the surface may add fields, and a
 * command that does not declare the parts a tool needs is skipped instead of guessed at.
 */
export function parseCapabilities(text: string): readonly Command[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const commands = (value as { commands?: unknown }).commands;
  if (!Array.isArray(commands)) return null;
  const parsed: Command[] = [];
  for (const entry of commands) {
    const command = parseCommand(entry);
    if (command) parsed.push(command);
  }
  return parsed;
}

function parseCommand(entry: unknown): Command | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const value = entry as Record<string, unknown>;
  if (typeof value.name !== 'string' || typeof value.artifact !== 'string'
    || typeof value.capability !== 'string') return null;
  const summary = typeof value.summary === 'string' ? value.summary : value.name;
  const argv = Array.isArray(value.argv)
    ? value.argv.map(parseArgument).filter((argument): argument is CommandArgument => argument !== null)
    : [];
  return { name: value.name, artifact: value.artifact, capability: value.capability, summary, argv, stdin: parseStdin(value.stdin) };
}

const ARGUMENT_KINDS = ['path', 'id', 'string', 'number', 'boolean'] as const;

function parseArgument(entry: unknown): CommandArgument | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const value = entry as Record<string, unknown>;
  if (typeof value.name !== 'string') return null;
  const kind = ARGUMENT_KINDS.find((candidate) => candidate === value.kind);
  if (!kind) return null;
  return {
    name: value.name,
    positional: value.positional === true,
    ...(typeof value.flag === 'string' ? { flag: value.flag } : {}),
    kind,
    required: value.required === true,
    repeatable: value.repeatable === true,
    ...(Array.isArray(value.values)
      ? { values: value.values.filter((item): item is string => typeof item === 'string') }
      : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
  };
}

function parseStdin(entry: unknown): CommandStdin | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const value = entry as Record<string, unknown>;
  if (typeof value.schema !== 'string') return null;
  return {
    required: value.required === true,
    schema: value.schema,
    description: typeof value.description === 'string' ? value.description : '',
  };
}

/** One Pi custom tool per granted command, all of them against the same fixed workspace. */
export function commandTools(options: {
  surface: CommandSurface;
  mode: Mode;
  workspacePath: string;
}): ToolDefinition[] {
  return grantedCommands(options.surface, options.mode).map((command) =>
    commandTool(command, options.surface.scriptPath, options.workspacePath));
}

/**
 * The workspace root is the session's, never the model's.
 *
 * Every command declares it as its first positional argument, and ADR-0011 fixes it for the
 * session; exposing it as a parameter would let a call retarget the surface.
 */
function isSuppliedWorkspaceArgument(argument: CommandArgument): boolean {
  return argument.positional && argument.name === 'workspace';
}

function paramName(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

function argumentType(argument: CommandArgument): string {
  if (argument.kind === 'number') return 'number';
  if (argument.kind === 'boolean') return 'boolean';
  return 'string';
}

/**
 * The tool's parameter schema, derived from the declaration.
 *
 * A plain JSON Schema object on purpose: Pi validates tool arguments against a schema with
 * no TypeBox kind by coercing it as JSON Schema, and depending on `typebox` from the
 * companion would add a package this application does not otherwise use. A command that
 * reads a document on stdin gets one free-form object parameter — the surface publishes a
 * schema *name* and a prose shape, not a machine-readable one, and the command validates
 * its own input.
 */
function parametersFor(command: Command): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const argument of command.argv) {
    if (isSuppliedWorkspaceArgument(argument)) continue;
    const type = argumentType(argument);
    const name = paramName(argument.name);
    properties[name] = {
      ...(argument.repeatable
        ? { type: 'array', items: { type, ...(argument.values ? { enum: [...argument.values] } : {}) } }
        : { type, ...(argument.values ? { enum: [...argument.values] } : {}) }),
      ...(argument.description ? { description: argument.description } : {}),
    };
    if (argument.required) required.push(name);
  }
  if (command.stdin) {
    properties.stdin = {
      type: 'object',
      additionalProperties: true,
      description: `The JSON document this command reads on stdin. Schema ${command.stdin.schema}. ${command.stdin.description}`,
    };
    if (command.stdin.required) required.push('stdin');
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

function describeCommand(command: Command): string {
  const lines = [command.summary, ''];
  const positionals = command.argv.filter((argument) => argument.positional && !isSuppliedWorkspaceArgument(argument));
  const flags = command.argv.filter((argument) => !argument.positional);
  lines.push(`Usage: ${SURFACE_SCRIPT_NAME} ${command.name} <workspace>${positionals.map((argument) => ` <${argument.name}>${argument.repeatable ? '…' : ''}`).join('')}${flags.length ? ' [flags]' : ''}`);
  for (const argument of [...positionals, ...flags]) {
    const spelling = argumentSpelling(argument);
    const traits = [
      argument.required ? 'required' : 'optional',
      argument.repeatable ? 'repeatable' : '',
      argument.values ? `one of ${argument.values.join(', ')}` : '',
      argument.description ?? '',
    ].filter(Boolean).join('; ');
    lines.push(`- ${spelling}: ${traits}`);
  }
  if (command.stdin) {
    lines.push(`- stdin (${command.stdin.schema}, ${command.stdin.required ? 'required' : 'optional'}): ${command.stdin.description}`);
  }
  lines.push('', 'The workspace is the one this session is rooted at; it is not a parameter.');
  lines.push(COMMAND_RESULT_NOTE);
  return lines.join('\n');
}

/** How one argument is spelled on the command line, for the tool's own description. */
function argumentSpelling(argument: CommandArgument): string {
  if (argument.positional) return `<${argument.name}>`;
  const flag = argument.flag ?? `--${argument.name}`;
  if (argument.kind === 'boolean') return flag;
  return `${flag} <${argumentType(argument)}>`;
}

function commandTool(command: Command, scriptPath: string, workspacePath: string): ToolDefinition {
  return {
    name: command.name,
    label: command.name,
    description: describeCommand(command),
    // SAFETY: Pi accepts a plain JSON Schema in this field — `validateToolArguments` compiles
    // it as JSON Schema whenever the object carries no TypeBox kind symbol — while the type
    // admits only TypeBox's branded `TSchema`, a package this application does not depend on.
    parameters: parametersFor(command) as unknown as ToolDefinition['parameters'],
    execute: async (_toolCallId, parameters, signal) => {
      const invocation = invocationFor(command, (parameters ?? {}) as Record<string, unknown>);
      const result = await run(scriptPath, [command.name, workspacePath, ...invocation.argv], invocation.stdin, signal);
      const envelope = parseEnvelope(result.stdout);
      if (result.code === 2) {
        throw new Error(result.stdout.trim() || result.stderr.trim() || `${command.name} was called with wrong arguments.`);
      }
      if (!envelope || (result.code !== 0 && result.code !== 1)) {
        const detail = result.stdout.trim() || result.stderr.trim() || `exit code ${result.code ?? 'unknown'}`;
        throw new Error(`The ${command.name} command did not return a derivon.command-result/v1 envelope: ${detail.slice(0, 2000)}`);
      }
      // Diagnostics are a successful call: the model has to read issues[].code and retry.
      return { content: [{ type: 'text', text: result.stdout.trim() }], details: envelope };
    },
  };
}

/** Turn validated parameters into the argv and stdin the command surface takes. */
export function invocationFor(command: Command, parameters: Record<string, unknown>): {
  argv: string[];
  stdin: string | undefined;
} {
  const argv: string[] = [];
  for (const argument of command.argv) {
    if (isSuppliedWorkspaceArgument(argument)) continue;
    const value = parameters[paramName(argument.name)];
    if (argument.positional) appendPositional(argv, value);
    else appendFlag(argv, argument, value);
  }
  return {
    argv,
    stdin: command.stdin && parameters.stdin !== undefined
      ? JSON.stringify(parameters.stdin)
      : undefined,
  };
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function appendPositional(argv: string[], value: unknown): void {
  if (isAbsent(value)) return;
  if (Array.isArray(value)) argv.push(...value.map((item) => String(item)));
  else argv.push(String(value));
}

function appendFlag(argv: string[], argument: CommandArgument, value: unknown): void {
  // A boolean flag is the flag itself; every other kind takes the next argument as its value.
  if (argument.kind === 'boolean') {
    if (value === true) argv.push(argument.flag ?? `--${argument.name}`);
    return;
  }
  if (isAbsent(value)) return;
  const flag = argument.flag ?? `--${argument.name}`;
  if (Array.isArray(value)) {
    for (const item of value) argv.push(flag, String(item));
    return;
  }
  argv.push(flag, String(value));
}

/** One call's outcome. `code` is null when the process could not be started at all. */
type RunResult = {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Run the command surface with the bundled Node runtime, not one from `PATH`.
 *
 * The companion is itself started by the application's sidecar Node, so `process.execPath`
 * is that runtime; borrowing the operator's would let a bundle ship without its sidecar and
 * still work on the build machine.
 */
function run(scriptPath: string, args: readonly string[], stdin: string | undefined, signal: AbortSignal | undefined): Promise<RunResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, [scriptPath, ...args], {
        cwd: path.dirname(scriptPath),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    // A command that exits before reading its input leaves the write to fail with EPIPE, and an
    // unhandled 'error' on a stream would take the companion down with it. The exit code and the
    // envelope are the whole report; the failed write adds nothing to them.
    child.stdin.on('error', () => {});
    const abort = () => { child.kill(); };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort);
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      resolve({ code, stdout, stderr });
    });
    if (stdin === undefined) child.stdin.end();
    else child.stdin.end(stdin);
  });
}

function parseEnvelope(text: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const status = (value as { status?: unknown }).status;
  if (status !== 'ok' && status !== 'diagnostics') return null;
  return value as Record<string, unknown>;
}

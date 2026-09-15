import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  loadSkills,
  type ResourceDiagnostic,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
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
 * mode asks for the ones it needs. Both modes read the workspace — reading documents is how
 * the model inspects what it is working on — and both hold the platform's shell: authoring
 * looks things up while it writes, and learning runs something like `tavily-cli` while the
 * user learns. The two modes differ in what a *write* may do, and that is a different axis:
 * the learning session's workspace writes are refused by the `tool_call` guard, not by taking
 * the shell away (ADR-0011).
 */
const MODE_BUILTIN_GRANTS = {
  authoring: ['read'],
  learning: ['read'],
} satisfies Record<Mode, readonly string[]>;

/** The two shell tools Pi ships, one per kind of platform. */
export type ShellTool = 'bash' | 'powershell';

/**
 * The shell a session on this platform holds.
 *
 * Pi's `bash` tool resolves Git Bash on Windows, which this application does not require and
 * the companion's cleared environment does not find, while PowerShell is there on any Windows
 * install. Naming the tool is the whole difference: the same grant, a different tool
 * (`sessionEnvironment.ts` reports the one case where neither is there).
 */
export function shellToolName(platform: NodeJS.Platform): ShellTool {
  return platform === 'win32' ? 'powershell' : 'bash';
}

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
 * What the two fixed skill roots offered, and what was wrong with the rest.
 *
 * The skills travel as Pi's own `Skill` records — name, description and file path, with no
 * body. That is exactly what progressive disclosure needs: the description goes into the
 * prompt, and the model opens `filePath` with `read` when the description matches the task.
 * A skill that carries only a `SKILL.md` is therefore a usable skill, not an empty one.
 */
export type SkillDiscovery = {
  readonly skills: readonly Skill[];
  readonly diagnostics: readonly ResourceDiagnostic[];
  /** Readable one-liners for the operator; the shape #131 raises into the panel. */
  readonly skillNotes: readonly string[];
};

/**
 * What the two roots offered to one session.
 *
 * A missing command surface is a configuration state, not an error: the session stays
 * usable and the notes are what says why it has no command tools. Skill discovery is not a
 * configuration state and not a precondition of one — the two are reported separately.
 */
export type CommandSurfaceState = SkillDiscovery & {
  readonly surface: CommandSurface | null;
  /** Readable notes about the command surface itself, not about skills. */
  readonly surfaceNotes: readonly string[];
};

/**
 * What one call's result means, said once: the tool's own description and the session prompt
 * both carry this sentence, and two copies would be two things to keep in step.
 */
export const COMMAND_RESULT_NOTE = 'One call is one commit. The command prints one derivon.command-result/v1 envelope on stdout: status is "ok" or "diagnostics", and issues[] carries a stable code, a path and a message. Exit 0 is clean, 1 carries diagnostics, 2 is a usage error. A diagnostics result is a normal refusal rather than a crash — read issues[].code and retry with corrected input.';

/**
 * The two roots a skill is installed under, in the order Pi loads skills.
 *
 * The user-level root does not depend on a workspace, so it is the only one before one is
 * open; the project-level root joins it after.
 */
export function skillRoots(configDirectory: string, workspacePath: string | null): readonly string[] {
  return [
    path.join(configDirectory, 'skills'),
    ...(workspacePath ? [path.join(workspacePath, '.derivon', 'skills')] : []),
  ];
}

/**
 * The tools a session holds: the granted commands plus the built-ins the mode grants.
 *
 * Returned as the session's `tools` allowlist, which is the whole grant — a tool that is not
 * named here is not enabled.
 */
export function sessionToolNames(commands: readonly Command[], mode: Mode, shellTool: ShellTool): string[] {
  return [
    ...commands.map((command) => command.name),
    ...MODE_BUILTIN_GRANTS[mode],
    shellTool,
  ];
}

/** The commands of one mode: the intersection of the surface's declaration and the grant. */
export function grantedCommands(surface: CommandSurface, mode: Mode): readonly Command[] {
  const grants: readonly Grant[] = MODE_GRANTS[mode];
  return surface.commands.filter((command) =>
    grants.some((grant) =>
      command.artifact === grant.artifact && command.capability === grant.capability));
}

/**
 * The skills installed under this application's two roots.
 *
 * Discovery is Pi's — the same loader, the same one-directory-per-skill rule, the same
 * first-wins collision rule, the same diagnostics — but only from this application's roots.
 * Pi's own skill directories (`~/.pi/agent/skills`, `.pi/skills`) are never among them, so a
 * skill that never left Pi's tree cannot reach a session here.
 *
 * This is also where the command surface's skills come from: one `loadSkills` call per
 * session, never two, so the skills the surface draws from and the ones the prompt lists are
 * decided together.
 */
export function discoverSkills(options: {
  configDirectory: string;
  workspacePath: string | null;
}): SkillDiscovery {
  const { configDirectory, workspacePath } = options;
  // A root that is not there is the ordinary state — most machines have installed nothing —
  // and it is not a load failure. Only the roots that exist are offered, so an absent one
  // is silence rather than a diagnostic about a directory the application expects to miss.
  const roots = skillRoots(configDirectory, workspacePath).filter((root) => existsSync(root));
  // The roots are passed explicitly and includeDefaults is off, so this can only read them:
  // the application has its own user-level root and does not consult Pi's (#120).
  const { skills, diagnostics } = loadSkills({
    cwd: workspacePath ?? configDirectory,
    agentDir: configDirectory,
    skillPaths: [...roots],
    includeDefaults: false,
  });
  return { skills, diagnostics, skillNotes: diagnostics.map(skillDiagnosticNote) };
}

/**
 * Discover the installed command surface and read what it declares.
 *
 * Skills are loaded once, here, and travel with the surface: the prompt gets their name,
 * description and path, and every tool is derived from the script's `--capabilities`. No
 * `SKILL.md` body enters a prompt from this function — the model opens the file itself.
 */
export async function openCommandSurface(options: {
  configDirectory: string;
  workspacePath: string | null;
}): Promise<CommandSurfaceState> {
  const { workspacePath } = options;
  const discovery = discoverSkills(options);
  if (!workspacePath) {
    return { ...discovery, surface: null, surfaceNotes: ['没有打开工作区，脚本命令面不可用。'] };
  }
  const roots = skillRoots(options.configDirectory, workspacePath);
  const scripts = discovery.skills
    .map((skill) => path.join(skill.baseDir, ...SURFACE_SCRIPT))
    .filter((scriptPath) => existsSync(scriptPath));
  if (!scripts.length) {
    return { ...discovery, surface: null, surfaceNotes: [noSurfaceNote(roots)] };
  }
  // Pi keeps the first skill it found; the surface follows the same rule, and says so rather
  // than quietly using one of however many there are.
  const [scriptPath, ...ignored] = scripts;
  const capabilities = await readCapabilities(scriptPath);
  if (!capabilities) {
    return {
      ...discovery,
      surface: null,
      surfaceNotes: [`脚本命令面不可用：${scriptPath} 没有给出可用的 --capabilities 输出（搜索过的根：${roots.join(' 和 ')}）。`],
    };
  }
  return {
    ...discovery,
    surface: { scriptPath, commands: capabilities },
    surfaceNotes: ignored.map((other) =>
      `发现多个脚本命令面，使用 ${scriptPath}，忽略 ${other}。`),
  };
}

/**
 * One Pi diagnostic as a line an operator can act on.
 *
 * A collision is the one diagnostic whose whole content is a choice — which file is in use
 * and which was left out — so it names both paths; everything else is the loader's own
 * message, which already says what is wrong (`description is required`, a parse failure, an
 * unreadable file).
 */
function skillDiagnosticNote(diagnostic: ResourceDiagnostic): string {
  const collision = diagnostic.collision;
  if (collision) {
    return `技能冲突：${diagnostic.message}（保留 ${collision.winnerPath}，忽略 ${collision.loserPath}）`;
  }
  return diagnostic.path
    ? `技能诊断：${diagnostic.path}（${diagnostic.message}）`
    : `技能诊断：${diagnostic.message}`;
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

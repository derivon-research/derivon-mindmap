import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { Extension, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';

/** How the guard shows up in diagnostics: an application-provided inline extension. */
const GUARD_PATH = '<inline:derivon-workspace-write-guard>';

/**
 * The learning session's fence: a `tool_call` handler that refuses a call which would write
 * inside the workspace.
 *
 * This is a guard, not a boundary (ADR-0011). No inspection of a shell command is complete —
 * an interpreter, an editor writing through a socket, or a form of quoting this does not know
 * are all outside it — and the property that always holds is unchanged: an unmediated write
 * is *unvalidated*, and the reader enforces the artifact. What the guard buys is that the
 * learning session's promise, "learning mode cannot edit", is true in practice while that
 * session still holds `bash` for something like `tavily-cli`.
 *
 * The authoring session gets no guard: it is the session allowed to change the workspace.
 *
 * What it judges is the built-in tools and the shell — whichever shell the platform's session
 * holds, `bash` on POSIX and `powershell` on Windows, each read by its own grammar. A granted
 * command's own arguments are the
 * command surface's contract instead: the surface declares what each command requires, and a
 * command that must not change something does not declare it. That is why this reads `path` and
 * the command text rather than hunting for path-shaped arguments in every call.
 */
export function workspaceWriteGuard(workspacePath: string): Extension {
  const root = canonicalizeNearest(path.resolve(workspacePath));
  // SAFETY: the runner calls every `tool_call` handler with (event, ctx); `Extension.handlers`
  // is typed as a list of `(...args: unknown[]) => Promise<unknown>`, which no typed handler
  // is assignable to, so the event is named here where its type is known.
  const handler = async (...args: unknown[]): Promise<ToolCallEventResult | undefined> => {
    const event = args[0] as ToolCallEvent;
    return guardDecision(event.toolName, event.input, root);
  };
  return {
    path: GUARD_PATH,
    resolvedPath: GUARD_PATH,
    hidden: true,
    sourceInfo: { path: GUARD_PATH, source: 'inline', scope: 'temporary', origin: 'top-level' },
    handlers: new Map<string, never[]>([['tool_call', [handler as never]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}

/**
 * Whether one tool call is refused, and what the model is told when it is.
 *
 * Exported so the rule is testable without a session: the interesting part is which calls it
 * catches, and a fence nobody exercises is a fence nobody knows the shape of.
 */
export function guardDecision(toolName: string, input: unknown, root: string): ToolCallEventResult | undefined {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  if (toolName === 'write' || toolName === 'edit') {
    // Both built-in tools name their target `path` (see the write and edit schemas).
    const target = fields.path;
    if (typeof target !== 'string' || !target) return undefined;
    if (!isInside(root, canonicalizeNearest(path.resolve(root, target)))) return undefined;
    return refusal(`writing ${target} would change the workspace`);
  }
  if (toolName === 'bash') {
    const command = fields.command;
    if (typeof command !== 'string' || !command) return undefined;
    if (!bashWritesWorkspace(command, root)) return undefined;
    return refusal('that shell command would write inside the workspace');
  }
  if (toolName === 'powershell') {
    const command = fields.command;
    if (typeof command !== 'string' || !command) return undefined;
    if (!powershellWritesWorkspace(command, root)) return undefined;
    return refusal('that PowerShell command would write inside the workspace');
  }
  return undefined;
}

function refusal(what: string): ToolCallEventResult {
  return {
    block: true,
    reason: `Refused: ${what}, and this is the learning session. It reads the workspace but never changes it. Workspace content changes only in the authoring session, through the command tools. Say what you want changed and let the user make that change there.`,
  };
}

/**
 * Whether a shell command writes inside the workspace.
 *
 * Judged from the command text, so it is deliberately narrow: only the arguments a write form
 * actually lands on are inspected, because the working directory is the workspace and every
 * relative path in them resolves inside it. Reads of the workspace are the point of this
 * session and must stay allowed — `ls`, `find` and `rg` name the workspace without being
 * refused.
 */
export function bashWritesWorkspace(command: string, root: string): boolean {
  return writeTargets(command).some((target) => writeLandsInsideWorkspace(target, root));
}

/**
 * Whether a write target lands inside the workspace.
 *
 * Checked per entry against the resolved root, never as a bare string prefix; `~` and `$HOME`
 * are outside because the shell expands them, not us; and a path with no root on it is
 * relative to the session's working directory, which *is* the workspace.
 */
function writeLandsInsideWorkspace(target: string, root: string): boolean {
  if (target.startsWith('/dev/')) return false;
  if (/^(?:~|\$(?:HOME|\{HOME\}))(?:\/|$)/.test(target)) return false;
  if (path.isAbsolute(target)) return isInside(root, canonicalizeNearest(target));
  return true;
}

/** Shell forms that write a file, and which of their arguments the write lands on. */
const WRITE_FORMS: readonly { readonly form: RegExp; readonly targets: 'all' | 'last' }[] = [
  { form: /^(?:rm|rmdir|mkdir|touch|truncate|tee)$/, targets: 'all' },
  { form: /^(?:cp|mv|ln|install)$/, targets: 'last' },
];

const WORD = /"([^"]*)"|'([^']*)'|(\S+)/g;

/** Every path-like argument a write form in this command would land on. */
export function writeTargets(command: string): string[] {
  const targets: string[] = [...redirectionTargets(command)];
  for (const match of command.matchAll(/\bdd\b[^;&|]*?\bof=("([^"]*)"|'([^']*)'|[^\s;&|<>()]+)/g)) {
    collectTarget(targets, match[2] ?? match[3] ?? match[1]);
  }
  for (const segment of command.split(/[;&|]+/)) {
    const words = [...segment.matchAll(WORD)].map((match) => match[1] ?? match[2] ?? match[3]);
    const write = writeForm(words);
    if (!write) continue;
    const values = words.slice(write.at + 1).filter((word) => !word.startsWith('-'));
    if (write.targets === 'all') values.forEach((value) => collectTarget(targets, value));
    else {
      const last = values.at(-1);
      if (last !== undefined) collectTarget(targets, last);
    }
  }
  return targets;
}

/**
 * Redirections: `> f`, `>> f`, `2> f`, `&> f`, in any segment of a shell command.
 *
 * One rule for both shells: PowerShell's `>` and `>>` mean what the POSIX one's do, and a
 * separator inside quotes is not a separator in either.
 */
function redirectionTargets(command: string): string[] {
  const targets: string[] = [];
  for (const match of command.matchAll(/(?:^|[^<>])>>?(?![>&])\s*("([^"]*)"|'([^']*)'|[^\s;&|<>()]+)/g)) {
    collectTarget(targets, match[2] ?? match[3] ?? match[1]);
  }
  return targets;
}

/** One target, unless what was captured is a lone quote rather than a path. */
function collectTarget(targets: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed && !/^['"]+$/.test(trimmed)) targets.push(trimmed);
}

/** The write form one command segment uses, and where its arguments start. */
function writeForm(words: readonly string[]): { readonly targets: 'all' | 'last'; readonly at: number } | undefined {
  for (const [at, word] of words.entries()) {
    const form = WRITE_FORMS.find((candidate) => candidate.form.test(word));
    if (form) return { targets: form.targets, at };
    // `sed` writes in place only with `-i`; without it, it only prints.
    if (word === 'sed' && words.includes('-i')) return { targets: 'last', at };
  }
  return undefined;
}

/**
 * A PowerShell write cmdlet, and which of its arguments the write lands on.
 *
 * `positionals` names the plain arguments that are targets, and acts as a *fallback*:
 * `Set-Content -Path x y` writes `x`, and tells the cmdlet's `y` is the value it writes
 * rather than a path. `pathParameters` says whether `-Path`/`-LiteralPath`/`-FilePath` are
 * targets too — they are not for `Copy-Item`, whose source is a read — and `destination` says
 * whether `-Destination` is.
 */
type PowershellWriteForm = {
  readonly name: string;
  readonly positionals: 'all' | 'first' | 'last';
  readonly pathParameters: boolean;
  readonly destination: boolean;
};

const POWERSHELL_WRITE_FORMS: readonly PowershellWriteForm[] = [
  { name: 'set-content', positionals: 'first', pathParameters: true, destination: false },
  { name: 'add-content', positionals: 'first', pathParameters: true, destination: false },
  { name: 'out-file', positionals: 'first', pathParameters: true, destination: false },
  { name: 'new-item', positionals: 'first', pathParameters: true, destination: false },
  { name: 'remove-item', positionals: 'all', pathParameters: true, destination: false },
  // A move removes its source as well, so both ends are writes on the workspace.
  { name: 'move-item', positionals: 'all', pathParameters: true, destination: true },
  // A copy reads its source; only the destination lands.
  { name: 'copy-item', positionals: 'last', pathParameters: false, destination: true },
  { name: 'rename-item', positionals: 'first', pathParameters: true, destination: false },
];

const POWERSHELL_PATH_PARAMETERS = new Set(['path', 'literalpath', 'filepath']);

/**
 * Parameters that take a value, so the word after them is that value and not an argument.
 *
 * Everything else is treated as a switch. That is the safe direction: a switch whose value we
 * fail to consume becomes an extra positional, which can only make the guard refuse more, while
 * mistaking a value-taking parameter for a switch would lose a path.
 */
const POWERSHELL_VALUE_PARAMETERS = new Set([
  ...POWERSHELL_PATH_PARAMETERS, 'destination', 'value', 'name', 'newname', 'itemtype',
  'inputobject', 'encoding', 'filter', 'include', 'exclude', 'stream', 'delimiter', 'totalcount',
  'erroraction', 'errorvariable', 'warningaction', 'warningvariable',
  'informationaction', 'informationvariable', 'outvariable', 'outbuffer', 'pipelinevariable',
]);

/**
 * Whether a PowerShell command writes inside the workspace.
 *
 * The POSIX rule's counterpart and the same shape: only the arguments a write form actually
 * lands on are inspected, judged on the resolved real path. Everything this does not know — an
 * alias, a parameter spelled some third way, a form that is not listed — reads as a relative
 * path and is refused, which is the safe side of a fence. It is a fence all the same: a script
 * run by an interpreter, a provider that is not the filesystem, or an encoding this does not
 * know is outside it (ADR-0011).
 */
export function powershellWritesWorkspace(command: string, root: string): boolean {
  const targets = [...redirectionTargets(command), ...powershellWriteTargets(command)];
  return targets.some((target) => writeLandsInsideWorkspace(target, root));
}

/** Every path a write form in this command would land on. */
export function powershellWriteTargets(command: string): string[] {
  const targets: string[] = [];
  for (const words of powershellSegments(command)) targets.push(...segmentWriteTargets(words));
  return targets;
}

/**
 * The words of each statement, with quoted spans kept whole.
 *
 * A separator inside quotes is not a separator: `Set-Content -Path 'a;b.txt'` is one statement
 * with one target. Escapes this does not know (a backtick, a doubled quote) leave the quoted
 * span unterminated, which only makes the words longer, never a path shorter.
 */
function powershellSegments(command: string): string[][] {
  const segments: string[][] = [];
  let words: string[] = [];
  let word = '';
  let quote: '"' | "'" | undefined;
  const endWord = () => { if (word) { words.push(word); word = ''; } };
  const endSegment = () => { endWord(); if (words.length) segments.push(words); words = []; };
  for (const character of command) {
    if (quote) {
      if (character === quote) quote = undefined;
      else word += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ';' || character === '|' || character === '\n' || character === '\r') {
      endSegment();
    } else if (character === ' ' || character === '\t') {
      endWord();
    } else {
      word += character;
    }
  }
  endSegment();
  return segments;
}

/** The targets one statement writes, or none when it holds no write form. */
function segmentWriteTargets(words: readonly string[]): string[] {
  const form = POWERSHELL_WRITE_FORMS.find((candidate) =>
    words.some((word) => word.toLowerCase() === candidate.name));
  const at = form ? words.findIndex((word) => word.toLowerCase() === form.name) : -1;
  if (!form || at < 0) return [];
  const targets: string[] = [];
  const positionals: string[] = [];
  for (let index = at + 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word.startsWith('-')) {
      positionals.push(word);
      continue;
    }
    const parameter = splitParameter(word);
    if (!parameter) continue;
    const takesNext = parameter.value === undefined
      && POWERSHELL_VALUE_PARAMETERS.has(parameter.name)
      && words[index + 1] !== undefined && !words[index + 1].startsWith('-');
    const value = takesNext ? words[index + 1] : parameter.value;
    if (takesNext) index += 1;
    if (value === undefined) continue;
    if ((form.pathParameters && POWERSHELL_PATH_PARAMETERS.has(parameter.name))
      || (form.destination && parameter.name === 'destination')) {
      targets.push(value);
    }
  }
  // A named path already answered "which argument is the path", so the plain arguments are the
  // values the cmdlet writes rather than a second path.
  if (targets.length) return form.positionals === 'all' ? [...targets, ...positionals] : targets;
  if (form.positionals === 'all') return positionals;
  const positional = form.positionals === 'first' ? positionals[0] : positionals.at(-1);
  return positional === undefined ? [] : [positional];
}

/** `-Path` or `-Path:value`; the name is lower-cased, the value present only when inline. */
function splitParameter(word: string): { readonly name: string; readonly value?: string } | null {
  const match = /^-{1,2}([A-Za-z][A-Za-z0-9]*)(?::(.*))?$/.exec(word);
  if (!match) return null;
  return { name: match[1].toLowerCase(), ...(match[2] !== undefined ? { value: match[2] } : {}) };
}

/**
 * Whether the path is the workspace or something inside it.
 *
 * Checked per entry against the resolved root, never as a bare string prefix: a prefix
 * comparison is what lets `/mnt/finance/data-archived` pass an allowance of
 * `/mnt/finance/data`.
 */
export function isInside(root: string, target: string): boolean {
  if (target === root) return true;
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target.startsWith(prefix);
}

/**
 * The real path, resolving the deepest part that exists.
 *
 * A write target usually does not exist yet, so `realpath` cannot resolve it as a whole;
 * resolving the nearest existing ancestor and appending the rest is what keeps a symlinked
 * parent directory from hiding where the write would land.
 */
export function canonicalizeNearest(target: string): string {
  // `tail` is accumulated front-first as the walk climbs, so nothing has to be reversed.
  let tail = '';
  let current = path.resolve(target);
  for (;;) {
    try {
      return path.join(realpathSync(current), tail);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      tail = path.join(path.basename(current), tail);
      current = parent;
    }
  }
}

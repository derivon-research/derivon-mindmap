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
 * What it judges is the built-in tools and the shell. A granted command's own arguments are the
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
  for (const target of writeTargets(command)) {
    if (target.startsWith('/dev/')) continue;
    // `~` and `$HOME` are outside the workspace; the shell expands them, not us.
    if (/^(?:~|\$(?:HOME|\{HOME\}))(?:\/|$)/.test(target)) continue;
    if (path.isAbsolute(target)) {
      if (isInside(root, canonicalizeNearest(target))) return true;
      continue;
    }
    // Relative to the session's working directory, which is the workspace.
    return true;
  }
  return false;
}

/** Shell forms that write a file, and which of their arguments the write lands on. */
const WRITE_FORMS: readonly { readonly form: RegExp; readonly targets: 'all' | 'last' }[] = [
  { form: /^(?:rm|rmdir|mkdir|touch|truncate|tee)$/, targets: 'all' },
  { form: /^(?:cp|mv|ln|install)$/, targets: 'last' },
];

const WORD = /"([^"]*)"|'([^']*)'|(\S+)/g;

/** Every path-like argument a write form in this command would land on. */
export function writeTargets(command: string): string[] {
  const targets: string[] = [];
  const collect = (value: string) => {
    const trimmed = value.trim();
    // A lone quote is what a `>` inside a quoted string leaves behind, not a path.
    if (trimmed && !/^['"]+$/.test(trimmed)) targets.push(trimmed);
  };
  // Redirections: `> f`, `>> f`, `2> f`, `&> f` in any segment of the command.
  for (const match of command.matchAll(/(?:^|[^<>])>>?(?![>&])\s*("([^"]*)"|'([^']*)'|[^\s;&|<>()]+)/g)) {
    collect(match[2] ?? match[3] ?? match[1]);
  }
  for (const match of command.matchAll(/\bdd\b[^;&|]*?\bof=("([^"]*)"|'([^']*)'|[^\s;&|<>()]+)/g)) {
    collect(match[2] ?? match[3] ?? match[1]);
  }
  for (const segment of command.split(/[;&|]+/)) {
    const words = [...segment.matchAll(WORD)].map((match) => match[1] ?? match[2] ?? match[3]);
    const write = writeForm(words);
    if (!write) continue;
    const values = words.slice(write.at + 1).filter((word) => !word.startsWith('-'));
    if (write.targets === 'all') values.forEach(collect);
    else {
      const last = values.at(-1);
      if (last !== undefined) collect(last);
    }
  }
  return targets;
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

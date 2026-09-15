import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { runProcess, type ProcessResult } from './childProcess';

/**
 * The tool that answers the graph reads and queries the skills carry.
 *
 * `point list`, `query closure`, `query route`, `query diagnose`, `subgraph …` all go through
 * `derivon`, and without this the session has no way to ask them: the command surface beside it
 * audits and changes the workspace, and answers nothing about reachability. This is a thin shell
 * around the CLI, not a family of tools and not a structured operation table.
 *
 * - Its whole input is the CLI's own words. The command set and its flags stay the skill's and the
 *   installed contract's — `derivon <command> --help` — so there is no second command list here to
 *   drift away from them.
 * - The graph is the open workspace's. The manifest's `graph` is sent on stdin and the file form
 *   (`--input`) is refused, so no call can answer about a graph that is not this workspace's.
 * - It changes nothing. `derivon` is a stateless processor that writes its result to stdout even
 *   for `point add` and `apply`, so the tool needs no capability and both modes can hold it;
 *   changing workspace content still goes through the command surface.
 *
 * The CLI is the operator's own installation, never a copy shipped beside the companion: its
 * version policy belongs to the skill, which checks it, and updating it is the user's decision.
 */

/** The tool's name is the CLI's: what the model passes is the CLI's own words. */
export const DERIVON_TOOL_NAME = 'derivon';

/**
 * Where the graph lives inside a workspace.
 *
 * Spelled here because the companion is its own build: it does not import the webview's legacy
 * workspace module, and the workspace boundary above it takes manifest text rather than naming a
 * file. The same path is spelled in `src-tauri/src/workspace.rs` and in the command surface.
 */
const MANIFEST = ['.derivon', 'workspace.json'] as const;

/**
 * The one global option that would move the graph off stdin.
 *
 * The CLI reads one complete graph from stdin or `--input`; the graph this tool answers about is
 * the open workspace's, so the file form is refused rather than passed through. It is the only
 * word inspected at all — every other one reaches the CLI as it was written.
 */
const INPUT_FLAG = '--input';

/**
 * What the model reads: the CLI's own output, and the two things a shell would show beside it.
 *
 * A clean run is the stdout text and nothing added to it, so a query's JSON arrives as printed.
 * Anything else is appended after it, because a target that cannot be reached and an argument the
 * CLI refused are different answers, and the model has to be able to tell them apart.
 */
function resultText(run: ProcessResult): string {
  const parts: string[] = [];
  const stdout = run.stdout.replace(/\n+$/, '');
  const stderr = run.stderr.replace(/\n+$/, '');
  if (stdout) parts.push(stdout);
  if (stderr) parts.push(`[stderr]\n${stderr}`);
  if (run.code !== 0) {
    parts.push(run.code === null ? '[terminated before it exited]' : `[exit code ${run.code}]`);
  }
  return parts.length ? parts.join('\n\n') : '(derivon printed nothing and exited 0)';
}

/**
 * The workspace's graph, and only that.
 *
 * `.graph` is the CLI-owned `derivon.graph/v1` document inside the workspace manifest; the rest of
 * the manifest — the id, the tag declarations, the document references in `data` — is the
 * application's and has no part in these queries. The CLI validates whatever it is given, so this
 * reads and hands over instead of auditing.
 */
function graphOf(workspacePath: string): string {
  const manifestPath = path.join(workspacePath, ...MANIFEST);
  let text: string;
  try {
    text = readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`The workspace graph could not be read at ${manifestPath}: ${message(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`The workspace manifest at ${manifestPath} is not JSON: ${message(error)}`);
  }
  const graph = (parsed as { graph?: unknown } | null)?.graph;
  if (graph === undefined || graph === null) {
    throw new Error(`The workspace manifest at ${manifestPath} carries no graph.`);
  }
  return JSON.stringify(graph);
}

/**
 * The CLI is not installed, in the words the model needs to act on.
 *
 * What to install and how to keep it current is the skill's business, so this points at it rather
 * than repeating an install command here; the companion does not check versions, and a version
 * behind is not this tool's to report.
 */
function notStartedMessage(reason: string): string {
  return `\`${DERIVON_TOOL_NAME}\` could not be started (${reason}), so this workspace's graph cannot be queried. `
    + 'How to install and update the CLI is in the `derivon-cli` skill: read its SKILL.md and follow those steps. '
    + 'Installing or updating is the user\'s decision — say what is missing, ask, and only then run the install with the shell, and call this tool again.';
}

/**
 * Why the process could not be started, in one line.
 *
 * `ENOENT` is the ordinary case — the operator has not installed the CLI — and it is worth naming
 * plainly, because an install fixes it rather than a diagnosis. Anything else is the OS message;
 * a stack trace is not something the model should have to read either way.
 */
function startFailure(error: Error): string {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return 'it is not on the PATH this application was started with';
  }
  return error.message;
}

/** Everything one call does, in the order the refusals have to come in. */
async function queryWorkspaceGraph(options: {
  readonly workspacePath: string | null;
  readonly argv: readonly string[];
  readonly signal?: AbortSignal;
}): Promise<string> {
  const { workspacePath, argv, signal } = options;
  if (!workspacePath) {
    throw new Error(`No workspace is open, so there is no graph for \`${DERIVON_TOOL_NAME}\` to read. Open one and call this tool again.`);
  }
  const redirected = argv.find((word) => word === INPUT_FLAG || word.startsWith(`${INPUT_FLAG}=`));
  if (redirected !== undefined) {
    throw new Error(`${INPUT_FLAG} is refused: the graph this tool answers about is the open workspace's, and it is sent to the CLI on stdin. Drop ${redirected} and call again.`);
  }
  const result = await runProcess({
    command: DERIVON_TOOL_NAME,
    args: argv,
    stdin: graphOf(workspacePath),
    // The session's own working directory, so a relative path in `apply --operations` means what
    // it means in the skill's shell recipes.
    cwd: workspacePath,
    signal,
  });
  if (result.failure) throw new Error(notStartedMessage(startFailure(result.failure)));
  return resultText(result);
}

/**
 * The tool, in the session's tool set.
 *
 * The workspace is the session's and is closed over here rather than asked for, the same as every
 * command tool: a call cannot retarget it. The session ends when the workspace changes, so the
 * path cannot outlive the workspace it was built for.
 */
export function derivonTool(options: { workspacePath: string | null }): ToolDefinition {
  return {
    name: DERIVON_TOOL_NAME,
    label: DERIVON_TOOL_NAME,
    description: [
      `Run the ${DERIVON_TOOL_NAME} CLI against this workspace's graph.`,
      '',
      'One argument, `argv`: the CLI\'s command and its arguments, without the program name — for example ["query","route","--start","A","--target","Z","--pretty"]. Every word reaches the CLI unchanged, so the syntax is the CLI\'s own: `derivon <command> --help`, and the recipes in the `derivon-cli` skill\'s SKILL.md and its reference.',
      '',
      'The graph is this workspace\'s: the tool sends the manifest\'s `graph` on stdin, so `--input` is refused and no other graph can be read. The CLI\'s stdout comes back as printed; anything on stderr and a non-zero exit are reported beside it rather than hidden. The CLI never writes a file, so this changes nothing.',
    ].join('\n'),
    // SAFETY: Pi accepts a plain JSON Schema in this field — `validateToolArguments` compiles it
    // as JSON Schema whenever the object carries no TypeBox kind symbol — while the type admits
    // only TypeBox's branded `TSchema`, a package this application does not depend on.
    parameters: {
      type: 'object',
      properties: {
        argv: {
          type: 'array',
          items: { type: 'string' },
          description: 'The derivon command and its arguments, without the program name. Repeat a repeatable flag to repeat it: ["query","route","--start","A","--start","B","--target","Z","--pretty"].',
        },
      },
      required: ['argv'],
      additionalProperties: false,
    } as unknown as ToolDefinition['parameters'],
    execute: async (_toolCallId, parameters, signal) => {
      const argv = (parameters as { argv?: unknown } | null)?.argv;
      if (!Array.isArray(argv)) {
        throw new Error(`\`${DERIVON_TOOL_NAME}\` takes one \`argv\` array: the command and its arguments, without the program name.`);
      }
      const text = await queryWorkspaceGraph({
        workspacePath: options.workspacePath,
        argv: argv.map((word) => String(word)),
        signal,
      });
      return { content: [{ type: 'text', text }], details: undefined };
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

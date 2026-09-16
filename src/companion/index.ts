import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { readFileSync, writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { ConversationMode, Notice, NoticeScope } from '../ports/ConversationProvider';
import {
  commandTools,
  grantedCommands,
  openCommandSurface,
  sessionToolNames,
  type Command,
  type CommandSurfaceState,
  type SkillDiscovery,
} from './commandSurface';
import { derivonTool } from './cliTool';
import { extensionToolNames, openExtensions, type ExtensionState } from './extensions';
import { workspaceWriteGuard } from './guard';
import { openModelConfiguration, type CatalogModel } from './modelConfiguration';
import { prepareSessionEnvironment } from './sessionEnvironment';
import { systemPrompt } from './systemPrompt';
import { classifyToolEnd, summarizeToolInput } from './toolActivity';
import type {
  ConversationNotification,
  ConversationRequest,
  ConversationResponse,
  Envelope,
} from './protocol';

type Mode = ConversationMode;
type Request = ConversationRequest & Envelope;
type Response = ConversationResponse & Envelope;
type Event = ConversationNotification['event'];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** One argument the companion cannot start without. */
function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`companion 需要 ${name}`);
  return value;
}

/**
 * The user-level root (`~/.derivon`), which Rust resolves and passes in. The companion never
 * reads `HOME` itself, and does not know where the directory came from (ADR-0010).
 */
const configDirectory = requiredArgument('--config-dir');
/**
 * The session's environment, arranged once for the process: Pi's agent directory — which is
 * what puts `<root>/bin` first on a session's PATH instead of `~/.pi/agent/bin` — and the
 * `node` shim in it. Both are diagnostics when they cannot be arranged, never a failure: a
 * session without either is still a usable session.
 */
const environment = prepareSessionEnvironment({ configDirectory });
for (const note of environment.notes) process.stderr.write(`[session environment] ${note}\n`);
const configurationPromise = openModelConfiguration(configDirectory);
const sessions = new Map<Mode, AgentSession>();
/**
 * The extensions a mode's session holds, one load per (mode, workspace) pair.
 *
 * The pair is the unit because the loaded extensions belong to one session: their runtime is
 * bound when the session is built, and two sessions sharing one would have one session's own
 * calls arrive in the other. What the cache buys is that the two things that need the answer —
 * the panel's configuration read, which reports what loading said, and the session itself, which
 * holds the tools — share one load, so an extension factory runs once and the tools are the ones
 * the diagnosis was made from.
 */
const extensionStates = new Map<Mode, { readonly workspace: string | null; readonly state: Promise<ExtensionState> }>();
/**
 * The command surface one workspace resolved to, and which workspace it was read for. The read
 * is shared between the panel's configuration read and the session, and dropped when either a
 * session ends or another workspace is opened — see `commandSurfaceFor`.
 */
let surfaceState: { readonly workspace: string | null; readonly state: Promise<CommandSurfaceState> } | undefined;

/** The operator's reason, said the same way everywhere. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/**
 * The workspace the conversation is about. Pi fixes a session's working directory when
 * the session is created, so changing workspaces ends the sessions rooted at the old one
 * rather than leaving them pointed somewhere the user has closed.
 */
let workspacePath: string | null = null;
/**
 * Which model each mode is on, remembered next to the configuration it names. The panel
 * used to keep this in the webview's localStorage, which meant two answers to one
 * question and a selection that could not survive being read by anything but that panel.
 */
const selectionPath = path.join(configDirectory, 'selected-models.json');
const selectedModels = new Map<Mode, CatalogModel>(readSelection());

function readSelection(): [Mode, CatalogModel][] {
  try {
    const stored = JSON.parse(readFileSync(selectionPath, 'utf8')) as Record<string, CatalogModel>;
    return Object.entries(stored).filter(([mode]) => mode === 'learning' || mode === 'authoring')
      .map(([mode, model]) => [mode as Mode, model]);
  } catch {
    return [];
  }
}

function rememberSelection() {
  try {
    writeFileSync(selectionPath, `${JSON.stringify(Object.fromEntries(selectedModels), null, 2)}\n`);
  } catch {
    // Remembering is a convenience; failing to write it must not fail the request.
  }
}
const modeQueues = new Map<Mode, Promise<void>>();

/**
 * The command surface this workspace offers, read once per workspace and re-read when it changes.
 *
 * The two things that need the answer share one read: the panel's configuration read, which
 * reports what loading said, and the session itself, which holds the tools derived from it. An
 * operator installs and edits skills while the application runs, so the read is dropped when a
 * session ends rather than kept for the lifetime of the process.
 *
 * A missing command surface is a configuration state, not an error, so its notes travel on both
 * channels — the panel's notices, where the operator sees them, and stderr, where the process log
 * keeps them. An unexpected failure leaves its line on stderr too, and then fails the request as
 * it always did.
 */
function commandSurfaceFor(target: string | null): Promise<CommandSurfaceState> {
  if (surfaceState && surfaceState.workspace === target) return surfaceState.state;
  const state = openCommandSurface({ configDirectory, workspacePath: target })
    .then((value) => {
      for (const note of value.surfaceNotes) process.stderr.write(`[command surface] ${note}\n`);
      for (const note of value.skillNotes) process.stderr.write(`[skills] ${note}\n`);
      return value;
    })
    .catch((error: unknown) => {
      process.stderr.write(`[command surface] ${message(error)}\n`);
      throw error;
    });
  surfaceState = { workspace: target, state };
  return state;
}

/**
 * The resource loader for one mode's session.
 *
 * Everything a session may draw on is supplied here rather than discovered by Pi: the methods
 * return what the companion already decided, and `reload` does nothing — nothing Pi would
 * discover on its own (a context file, a prompt, a theme, its own skill roots) is a root this
 * application reads. The prompt is the mode's own, the skills are the ones this application's
 * two roots offered, and the extensions are the operator's own — passed in as one load rather
 * than discovered again, so what the panel's diagnosis was made from is what the session holds
 * ([the extensions a session may hold](../../docs/agents/pi-runtime.md#the-extensions-a-session-may-hold)).
 * The write guard is an inline extension an operator cannot remove, and it sits in the same
 * runtime as the loaded ones: Pi turns extension tools, handlers and skills into the session,
 * and the model opens a skill's body itself (#122).
 */
function resourceLoaderFor(options: {
  mode: Mode;
  prompt: string;
  workspacePath: string | null;
  skillDiscovery: SkillDiscovery;
  extensions: ExtensionState;
}): ResourceLoader {
  const guard = options.mode === 'learning' && options.workspacePath
    ? [workspaceWriteGuard(options.workspacePath)]
    : [];
  // The application's own inline guard and the operator's own extensions in one runtime, which is
  // the one the extensions registered into: a session's tools are its grants plus the tools the
  // operator's code put there, and the guard sees both alike.
  const loaded = {
    extensions: [...guard, ...options.extensions.extensions],
    errors: [...options.extensions.errors],
    runtime: options.extensions.runtime,
  };
  return {
    getExtensions: () => loaded,
    getSkills: () => ({
      skills: [...options.skillDiscovery.skills],
      diagnostics: [...options.skillDiscovery.diagnostics],
    }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => options.prompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

const settingsManager = SettingsManager.inMemory({
  retry: { enabled: true, maxRetries: 2 },
  compaction: { enabled: false },
  // Built-in tools start disabled; a mode grants the ones it needs through the session's
  // `tools` allowlist, which is also what keeps extension and custom tools enabled.
  defaultTools: [],
});

function write(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function response(value: Response) {
  write(value);
}

function event(mode: Mode, value: Event) {
  write({ type: 'event', mode, event: value });
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

/**
 * Not cached: the operator edits the two configuration files while the application is
 * running, and re-reading is cheap next to leaving them looking at a stale empty list.
 */
async function listModels(mode: Mode): Promise<{
  readonly models: readonly CatalogModel[];
  readonly selected?: CatalogModel;
  readonly notices: readonly Notice[];
}> {
  // One read carries every reason at once: why the catalog is what it is, whether there is a
  // command surface, what the skills roots offered, and what the session's extensions did on
  // the way in. None of them is an error channel — an empty catalog, a project with no skills
  // installed and an extension that would not load are all configuration states, and each owes
  // the operator its own reason, under its own scope, rather than a line in one paragraph.
  const [catalog, extensions, surface] = await Promise.all([
    (await configurationPromise).listAvailable(),
    extensionsFor(mode, workspacePath),
    commandSurfaceFor(workspacePath).then(
      (value) => ({ surface: value.surfaceNotes, skills: value.skillNotes }),
      // The reason still reaches the panel: a surface that could not be read at all is a
      // configuration state like the others, and the model list is not the thing that failed.
      (error: unknown) => ({ surface: [message(error)], skills: [] }),
    ),
  ]);
  const remembered = selectedModels.get(mode);
  // A remembered model that is no longer offered is not a selection; fall back rather
  // than reporting something the panel could not use.
  const selected = catalog.models.find((model) =>
    model.providerId === remembered?.providerId && model.modelId === remembered?.modelId)
    ?? catalog.models[0];
  if (selected) selectedModels.set(mode, selected);
  const notices: readonly Notice[] = [
    ...noticesFor('models', catalog.diagnosis ? [catalog.diagnosis] : []),
    ...noticesFor('command-surface', surface.surface),
    ...noticesFor('skills', surface.skills),
    ...noticesFor('extensions', extensions.notes),
  ];
  return { models: catalog.models, ...(selected ? { selected } : {}), notices };
}

function noticesFor(scope: NoticeScope, lines: readonly string[]): readonly Notice[] {
  return lines.filter(Boolean).map((text) => ({ scope, text }));
}

/** The one reason that answers "why is there no model": the catalog's own, never another scope's. */
function modelsReason(notices: readonly Notice[]): string | undefined {
  return notices.find((notice) => notice.scope === 'models')?.text;
}

/**
 * The extensions of one mode's session, loaded once per (mode, workspace) and read again when
 * either changes.
 *
 * A root that cannot be read, a load that failed and a project root that was skipped because the
 * project is not trusted all reach the operator on stderr under `[extensions]`, beside the notes
 * the command surface and the skills already write there. They also travel in the load's own
 * notes, which is what the panel's configuration read reports.
 */
function extensionsFor(mode: Mode, workspace: string | null): Promise<ExtensionState> {
  const current = extensionStates.get(mode);
  if (current && current.workspace === workspace) return current.state;
  const state = openExtensions({ configDirectory, workspacePath: workspace });
  extensionStates.set(mode, { workspace, state });
  void state.then((value) => {
    for (const note of value.notes) process.stderr.write(`[extensions] ${note}\n`);
  });
  return state;
}

async function createSession(mode: Mode) {
  const existing = sessions.get(mode);
  if (existing) return existing;
  const configuration = await configurationPromise;
  const catalog = await listModels(mode);
  const selected = catalog.selected;
  if (!selected) throw new Error(modelsReason(catalog.notices) ?? '没有可用模型');
  const model = await configuration.resolve(selected.providerId, selected.modelId);
  const modelRuntime = configuration.runtime;
  // Pi does not check `cwd`; a missing directory surfaces much later as a confusing
  // failure, so refuse here where the workspace can still be named.
  if (workspacePath) {
    try {
      if (!statSync(workspacePath).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error(`工作区目录不可用：${workspacePath}`);
    }
  }
  // The tool set is built per mode: the commands the mode is granted, and nothing else. The
  // learning session holds no write-capability command at all, so "learning mode cannot edit"
  // is structural rather than a switch something else could turn back on.
  const surface = await commandSurfaceFor(workspacePath);
  const commands: readonly Command[] = surface.surface ? grantedCommands(surface.surface, mode) : [];
  // Loaded before the tool set is composed, because the names an extension registered are part of
  // that set: what the operator added to their own session is a grant like any other, and the
  // application is not the thing that decides it.
  const extensions = await extensionsFor(mode, workspacePath);
  // One list, three uses: the session's allowlist, the prompt's account of what the session
  // holds, and — through the two below — the tools themselves.
  const tools = [...sessionToolNames(commands, mode, environment.shellTool), ...extensionToolNames(extensions)];
  const customTools: ToolDefinition[] = [
    // `derivon` is a mode grant rather than a capability: it answers the graph reads and queries
    // against the workspace this session is rooted at and changes nothing.
    derivonTool({ workspacePath }),
    ...(surface.surface && workspacePath ? commandTools({ surface: surface.surface, mode, workspacePath }) : []),
  ];
  const { session } = await createAgentSession({
    model,
    agentDir: configDirectory,
    ...(workspacePath ? { cwd: workspacePath } : {}),
    thinkingLevel: 'off',
    modelRuntime,
    resourceLoader: resourceLoaderFor({
      mode,
      prompt: systemPrompt(mode, commands, tools),
      workspacePath,
      skillDiscovery: surface,
      extensions,
    }),
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    customTools,
    tools,
  });
  session.subscribe((value) => {
    if (value.type === 'message_update' && value.assistantMessageEvent.type === 'text_delta') {
      event(mode, { kind: 'delta', text: value.assistantMessageEvent.delta });
    } else if (value.type === 'tool_execution_start') {
      // Forwarded because the panel has no other way to know a tool ran: the streamed text
      // is not an account of what the turn did. The call's own id is what lets the panel
      // update one row in place instead of stacking a line per event (#127).
      const summary = summarizeToolInput(value.args);
      event(mode, {
        kind: 'tool-start',
        toolCallId: value.toolCallId,
        name: value.toolName,
        ...(summary === undefined ? {} : { summary }),
      });
    } else if (value.type === 'tool_execution_end') {
      const ended = classifyToolEnd(value.result, value.isError);
      event(mode, {
        kind: 'tool-end',
        toolCallId: value.toolCallId,
        name: value.toolName,
        status: ended.status,
        ...(ended.detail === undefined ? {} : { detail: ended.detail }),
      });
    } else if (value.type === 'message_end' && value.message.role === 'assistant') {
      const assistant = value.message as { content?: unknown; stopReason?: string; errorMessage?: string };
      if (assistant.stopReason === 'error') {
        event(mode, { kind: 'error', message: assistant.errorMessage ?? '模型返回错误' });
      } else {
        event(mode, { kind: 'message', text: textOf(assistant.content) });
      }
    } else if (value.type === 'agent_settled') {
      event(mode, { kind: 'settled' });
    }
  });
  sessions.set(mode, session);
  return session;
}

async function endSession(mode: Mode) {
  const session = sessions.get(mode);
  if (!session) return;
  try {
    await session.abort();
  } finally {
    sessions.delete(mode);
    // The next session reads the roots again: the operator installs and edits extensions and
    // skills while the application runs, and a session is the thing that holds them.
    extensionStates.delete(mode);
    surfaceState = undefined;
    session.dispose();
  }
}

async function setWorkspace(path: string | null) {
  if (path === workspacePath) return;
  workspacePath = path;
  for (const mode of [...sessions.keys()]) await endSession(mode);
  extensionStates.clear();
  // The surface belongs to one workspace: the roots and the script path it published are that
  // workspace's, so another one must not inherit them.
  surfaceState = undefined;
}

async function setModel(mode: Mode, providerId: string, modelId: string) {
  const model = await (await configurationPromise).resolve(providerId, modelId);
  const session = sessions.get(mode);
  if (session) await session.setModel(model);
  selectedModels.set(mode, {
    providerId,
    modelId,
    ...(model.name && model.name !== modelId ? { name: model.name } : {}),
  });
  rememberSelection();
}

function serialize<T>(mode: Mode, operation: () => Promise<T>): Promise<T> {
  const previous = modeQueues.get(mode) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  modeQueues.set(mode, result.then(() => undefined, () => undefined));
  return result;
}

/**
 * Stop whatever the mode is doing, now.
 *
 * Deliberately not serialized: a `send` keeps its place in the mode's queue until the
 * turn ends, so an abort queued behind it would arrive only once the turn it was meant
 * to interrupt had already finished. Reaching the session directly is the whole point —
 * the turn's own end still travels through its response, as a settled event and the
 * send's reply.
 */
async function abort(mode: Mode) {
  const session = sessions.get(mode);
  // No session, or an idle one: nothing to interrupt, and nothing to change.
  if (session) await session.abort();
}

async function handle(request: Request): Promise<Response> {
  try {
    if (request.type === 'listModels') {
      const catalog = await listModels(request.mode);
      return {
        id: request.id,
        type: 'models',
        models: catalog.models,
        notices: catalog.notices,
        ...(catalog.selected ? { selected: catalog.selected } : {}),
      };
    }
    if (request.type === 'setModel') {
      await serialize(request.mode, () =>
        setModel(request.mode, request.providerId, request.modelId));
      return { id: request.id, type: 'ok' };
    }
    if (request.type === 'send') {
      await serialize(request.mode, async () => {
        const session = await createSession(request.mode);
        await session.prompt(request.prompt);
      });
      return { id: request.id, type: 'ok' };
    }
    if (request.type === 'abort') {
      await abort(request.mode);
      return { id: request.id, type: 'ok' };
    }
    if (request.type === 'new') {
      await serialize(request.mode, () => endSession(request.mode));
      return { id: request.id, type: 'ok' };
    }
    if (request.type === 'setWorkspace') {
      await setWorkspace(request.path);
      return { id: request.id, type: 'ok' };
    }
    throw new Error(`未知请求：${(request as Request).type}`);
  } catch (error) {
    return {
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index >= 0) {
    const line = buffer.slice(0, index).replace(/\r$/, '');
    buffer = buffer.slice(index + 1);
    if (line.trim()) {
      try {
        void handle(JSON.parse(line) as Request).then(response);
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    index = buffer.indexOf('\n');
  }
});

process.stdin.on('end', () => {
  for (const session of sessions.values()) session.dispose();
  sessions.clear();
});

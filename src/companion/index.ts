import {
  createAgentSession,
  createExtensionRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { readFileSync, writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { ConversationMode } from '../ports/ConversationProvider';
import { openModelConfiguration, type CatalogModel, type ModelCatalog } from './modelConfiguration';
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

const configDirectory = argument('--config-dir');
if (!configDirectory) throw new Error('companion 需要 --config-dir');
const configurationPromise = openModelConfiguration(configDirectory);
const sessions = new Map<Mode, AgentSession>();
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

const resourceLoader: ResourceLoader = {
  getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getSystemPrompt: () => 'You are a helpful assistant inside Derivon Mindmap.',
  getSystemPromptSource: () => undefined,
  getAppendSystemPrompt: () => [],
  getAppendSystemPromptSources: () => [],
  extendResources: () => {},
  reload: async () => {},
};

const settingsManager = SettingsManager.inMemory({
  retry: { enabled: true, maxRetries: 2 },
  compaction: { enabled: false },
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
async function listModels(mode: Mode): Promise<ModelCatalog & { selected?: CatalogModel }> {
  const catalog = await (await configurationPromise).listAvailable();
  const remembered = selectedModels.get(mode);
  // A remembered model that is no longer offered is not a selection; fall back rather
  // than reporting something the panel could not use.
  const selected = catalog.models.find((model) =>
    model.providerId === remembered?.providerId && model.modelId === remembered?.modelId)
    ?? catalog.models[0];
  if (selected) selectedModels.set(mode, selected);
  return { ...catalog, ...(selected ? { selected } : {}) };
}

async function createSession(mode: Mode) {
  const existing = sessions.get(mode);
  if (existing) return existing;
  const configuration = await configurationPromise;
  const catalog = await listModels(mode);
  const selected = catalog.selected;
  if (!selected) throw new Error(catalog.diagnosis ?? '没有可用模型');
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
  const { session } = await createAgentSession({
    model,
    ...(workspacePath ? { cwd: workspacePath } : {}),
    thinkingLevel: 'off',
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    noTools: 'all',
  });
  session.subscribe((value) => {
    if (value.type === 'message_update' && value.assistantMessageEvent.type === 'text_delta') {
      event(mode, { kind: 'delta', text: value.assistantMessageEvent.delta });
    } else if (value.type === 'message_end' && value.message.role === 'assistant') {
      const message = value.message as { content?: unknown; stopReason?: string; errorMessage?: string };
      if (message.stopReason === 'error') {
        event(mode, { kind: 'error', message: message.errorMessage ?? '模型返回错误' });
      } else {
        event(mode, { kind: 'message', text: textOf(message.content) });
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
    session.dispose();
  }
}

async function setWorkspace(path: string | null) {
  if (path === workspacePath) return;
  workspacePath = path;
  for (const mode of [...sessions.keys()]) await endSession(mode);
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
        ...(catalog.diagnosis ? { diagnosis: catalog.diagnosis } : {}),
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

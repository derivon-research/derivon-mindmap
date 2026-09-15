import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { installCommandSurface } from '../testing/commandSurface';
import { shellToolName } from './commandSurface';

type Output =
  | { id: number; type: 'models'; models: { providerId: string; modelId: string; name?: string }[]; selected?: unknown }
  | { id: number; type: 'ok' }
  | { id: number; type: 'error'; message: string }
  | { type: 'event'; mode: string; event: Record<string, unknown> };

const companionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist-companion/companion.mjs',
);

/**
 * The tool call each marker asks the fake model for. A marker in the user's message is the
 * whole request protocol: the turn's second request carries a tool result, which is what
 * tells the server to answer with text instead of asking for the same call again.
 */
const TOOL_CALLS: Record<string, { name: string; arguments: Record<string, unknown> }> = {
  'add-concept': { name: 'add-concept', arguments: { stdin: { id: 'c-fixture', label: 'Fixture concept' } } },
  'write-document': { name: 'write-document', arguments: { stdin: { object: 'c-fixture', markdown: '# changed' } } },
  bash: { name: 'bash', arguments: { command: 'echo written > poc.txt' } },
  'bash-path': { name: 'bash', arguments: { command: 'printf %s "$PATH"' } },
  'bash-node': { name: 'bash', arguments: { command: 'node --version' } },
};

/**
 * The call a marker asks for, computed against the request it is answering.
 *
 * `read-skill` is the one call whose argument is not a fixture constant: the file to read is
 * the location the session prompt published, which is the whole point — a model that only
 * knows a skill's name and description has to be told where its body is.
 */
function toolCallFor(marker: string, body: string): { name: string; arguments: Record<string, unknown> } | null {
  if (marker === 'read-skill') {
    const location = /<location>([^<]+)<\/location>/.exec(body)?.[1];
    return { name: 'read', arguments: { path: location ?? '' } };
  }
  return TOOL_CALLS[marker] ?? null;
}

/** Every request body the fake provider received, in order, for the test to assert on. */
let requestBodies: string[] = [];

/** The messages of one request body. */
function messagesOf(body: string): { role?: string; content?: unknown }[] {
  try {
    return (JSON.parse(body) as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
  } catch {
    return [];
  }
}

/**
 * Whether this request is the follow-up that carries tool results back.
 *
 * The conversation accumulates, so an earlier turn's tool message is still in the body: it is
 * the *last* message that says whether this request is the second leg of the current turn.
 */
function endsWithToolResult(body: string): boolean {
  return messagesOf(body).at(-1)?.role === 'tool';
}

/** The tool result a turn's second request carries: what the tool itself returned. */
function lastToolContent(body: string): string {
  const message = messagesOf(body).at(-1);
  return typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '');
}

/** The tools the provider was offered, which is the session's grant as the model sees it. */
function offeredToolNames(body: string): string[] {
  try {
    const tools = (JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? [];
    return tools.map((tool) => tool.function?.name ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

let server: Server;
let serverUrl: string;
let temporaryDirectory: string;
let companion: Companion;

/**
 * The request's last user message. Matching on the whole body instead would let a marker
 * from an earlier turn answer every later one, because the conversation so far travels
 * with each request.
 */
function lastUserText(body: string): string {
  try {
    const messages = (JSON.parse(body) as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
    const last = [...messages].reverse().find((message) => message.role === 'user');
    if (typeof last?.content === 'string') return last.content;
    if (Array.isArray(last?.content)) {
      return last.content
        .map((part) => part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : '')
        .join('');
    }
  } catch {
    // Not JSON, or not the shape expected: fall back to the raw body.
  }
  return body;
}

/**
 * A companion process and the two things a test does with one: put a request in, wait
 * for a line out. Each test that needs its own process gets one, because the first test
 * deliberately shuts its companion down to prove it exits cleanly.
 */
function startCompanion(configDir: string, environment: NodeJS.ProcessEnv = process.env) {
  // The runtime this test was started with, by absolute path: a controlled PATH is part of what
  // is under test, and resolving `node` through it would make the harness depend on it too.
  const process_ = spawn(process.execPath, [companionPath, '--config-dir', configDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: environment,
  });
  // The two streams stay apart: stdout carries one JSON line per reply, and stderr carries
  // the companion's diagnostics — a missing command surface is one of them — which are not
  // JSON and must not be parsed as if they were.
  let stdout = '';
  let stderr = '';
  process_.stdout!.setEncoding('utf8');
  process_.stderr!.setEncoding('utf8');
  process_.stdout!.on('data', (chunk: string) => { stdout += chunk; });
  process_.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  // A write can land mid-line, so the last segment is dropped until the rest of it
  // arrives. Everything before it is whole and safe to parse.
  const lines = () =>
    stdout.split('\n').slice(0, -1).filter(Boolean).map((value) => JSON.parse(value) as Output);
  return {
    process: process_,
    output: () => `${stdout}${stderr}`,
    diagnostics: () => stderr,
    /** Where the output ends now, so a later read sees only what comes after it. */
    mark: () => lines().length,
    /** Everything written after `mark`, in the order it arrived. */
    linesSince: (mark: number) => lines().slice(mark),
    send: (value: unknown) => process_.stdin!.write(`${JSON.stringify(value)}\n`),
    await: (matcher: (line: Output) => boolean, timeoutMs = 10_000) => new Promise<Output>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const line = lines().find(matcher);
        if (line) return resolve(line);
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Timed out waiting for companion output. Output so far:\n${stdout}${stderr}`));
        }
        setTimeout(check, 20);
      };
      check();
    }),
    stop: () => { process_.stdin!.end(); },
  };
}

type Companion = ReturnType<typeof startCompanion>;

const waitFor = (matcher: (line: Output) => boolean, timeoutMs = 10_000) =>
  companion.await(matcher, timeoutMs);
const request = (value: unknown) => companion.send(value);

beforeEach(() => {
  requestBodies = [];
});

/** A model directory the companion accepts: the fake provider, and nothing else. */
async function configureModelDirectory(directory: string, baseUrl: string) {
  await Promise.all([
    writeFile(path.join(directory, 'models.json'), JSON.stringify({
      providers: {
        test: {
          baseUrl: `${baseUrl}/v1`,
          api: 'openai-completions',
          apiKey: 'test-key',
          models: [{ id: 'stream-model', name: 'Stream Model' }],
        },
      },
    })),
    writeFile(path.join(directory, 'auth.json'), '{}'),
  ]);
}

/** A workspace with the fixture command surface installed as a project-level skill. */
async function workspaceWithCommandSurface(prefix: string): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix));
  await installCommandSurface(path.join(workspace, '.derivon', 'skills', 'derivon-mindmap'));
  return workspace;
}

/**
 * A skill directory as an operator installs one: a `SKILL.md`, and whatever else the skill
 * ships beside it — here, nothing at all, which is the case this ticket exists for.
 */
async function installSkill(
  directory: string,
  name: string,
  options: { description?: string; body: string },
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const description = options.description === undefined ? '' : `description: ${options.description}\n`;
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\n${description}---\n\n${options.body}\n`,
  );
  return directory;
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-pi-companion-'));
  server = createServer((incoming, response) => {
    let body = '';
    incoming.on('data', (chunk: string) => { body += chunk; });
    incoming.on('end', () => {
      const chunk = (text: string, finishReason: string | null) => JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'stream-model',
        choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finishReason }],
      });
      const prompt = lastUserText(body);
      requestBodies.push(body);
      const toolCall = /tool-call:([a-z-]+)/.exec(prompt)?.[1];
      const call = toolCall ? toolCallFor(toolCall, body) : null;
      if (toolCall && call) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        if (endsWithToolResult(body)) {
          // The call has been made and its result travelled back: finish the turn.
          response.write(`data: ${chunk('tool finished', null)}\n\n`);
          response.write(`data: ${chunk('', 'stop')}\n\n`);
        } else {
          response.write(`data: ${JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'stream-model',
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_fixture',
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                }],
              },
              finish_reason: null,
            }],
          })}\n\n`);
          response.write(`data: ${chunk('', 'tool_calls')}\n\n`);
        }
        response.write('data: [DONE]\n\n');
        response.end();
        return;
      }
      if (prompt.includes('error')) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'test provider failure' } }));
        return;
      }
      // A turn that starts and then never finishes. Nothing but an abort can end it, so
      // a test can tell whether the abort reached the turn or merely queued behind it.
      if (prompt.includes('never-ends')) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write(`data: ${chunk('wor', null)}\n\n`);
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(`data: ${chunk('Hel', null)}\n\n`);
      response.write(`data: ${chunk('lo', null)}\n\n`);
      response.write(`data: ${chunk('', 'stop')}\n\n`);
      response.write('data: [DONE]\n\n');
      response.end();
    });
  });
  serverUrl = await new Promise<string>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(`http://127.0.0.1:${address.port}`);
      else reject(new Error('test server did not start'));
    });
  });
  await configureModelDirectory(temporaryDirectory, serverUrl);
  // Deliberately hostile: a machine-wide provider credential in the companion's own
  // environment must not put a single extra model in the catalog (ADR-0010).
  companion = startCompanion(temporaryDirectory, { ...process.env, ANTHROPIC_API_KEY: 'machine-wide-not-ours' });
});

afterAll(async () => {
  if (companion) {
    companion.stop();
    await new Promise<void>((resolve) => {
      if (companion.process.exitCode !== null) resolve();
      else companion.process.once('exit', () => resolve());
    });
  }
  if (server) {
    // A test can leave a deliberately unfinished response open; close it so the server
    // does not wait for a connection nobody is going to end.
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it('streams, completes, reports errors, aborts, and exits cleanly', { timeout: 30_000 }, async () => {
  request({ id: 1, type: 'listModels', mode: 'learning' });
  const models = await waitFor((line) => line.type === 'models' && line.id === 1);
  const streamModel = { providerId: 'test', modelId: 'stream-model', name: 'Stream Model' };
  expect(models).toEqual({
    id: 1,
    type: 'models',
    models: [streamModel],
    // The companion owns the selection and defaults it, so the panel has one to show.
    selected: streamModel,
  });

  request({ id: 2, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
  await waitFor((line) => line.type === 'ok' && line.id === 2);

  request({ id: 3, type: 'send', mode: 'learning', prompt: 'hello' });
  await waitFor((line) => line.type === 'event' && line.event.kind === 'delta' && line.event.text === 'Hel');
  await waitFor((line) => line.type === 'event' && line.event.kind === 'delta' && line.event.text === 'lo');
  await waitFor((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');
  await waitFor((line) => line.type === 'event' && line.event.kind === 'settled');
  await waitFor((line) => line.type === 'ok' && line.id === 3);

  request({ id: 4, type: 'send', mode: 'learning', prompt: 'error' });
  await waitFor((line) => line.type === 'event' && line.event.kind === 'error');
  await waitFor((line) => line.type === 'event' && line.event.kind === 'settled');
  await waitFor((line) => line.type === 'ok' && line.id === 4);

  request({ id: 5, type: 'send', mode: 'learning', prompt: 'never-ends' });
  await waitFor((line) => line.type === 'event' && line.event.kind === 'delta' && line.event.text === 'wor');
  const beforeAbort = companion.mark();
  request({ id: 6, type: 'abort', mode: 'learning' });
  await waitFor((line) => line.type === 'ok' && line.id === 6);
  await waitFor((line) => line.type === 'ok' && line.id === 5);
  // The abort reached the turn instead of queueing behind it. The interrupted turn still
  // reports its own end: it settles first, and both replies follow. Queued behind the
  // send, the abort's reply could not arrive until that turn ended — and a turn that
  // never ends would have held it forever.
  const aroundAbort = companion.linesSince(beforeAbort);
  const settledAt = aroundAbort.findIndex((line) => line.type === 'event' && line.event.kind === 'settled');
  const abortReplyAt = aroundAbort.findIndex((line) => line.type === 'ok' && line.id === 6);
  const sendReplyAt = aroundAbort.findIndex((line) => line.type === 'ok' && line.id === 5);
  expect(settledAt).toBeGreaterThanOrEqual(0);
  expect(settledAt).toBeLessThan(abortReplyAt);
  expect(settledAt).toBeLessThan(sendReplyAt);

  request({ id: 7, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'missing' });
  await waitFor((line) => line.type === 'error' && line.id === 7);

  request({ id: 8, type: 'send', mode: 'authoring', prompt: 'hello' });
  await waitFor((line) => line.type === 'event' && line.mode === 'authoring' && line.event.kind === 'message');
  await waitFor((line) => line.type === 'ok' && line.id === 8);

  companion.stop();
  const code = await new Promise<number | null>((resolve) => {
    if (companion.process.exitCode !== null) resolve(companion.process.exitCode);
    else companion.process.once('exit', resolve);
  });
  expect(code).toBe(0);
});

it('sends again immediately after an abort, with nothing left in the mode\'s queue', { timeout: 30_000 }, async () => {
  const companion = startCompanion(temporaryDirectory);
  try {
    companion.send({ id: 1, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 1);

    companion.send({ id: 2, type: 'send', mode: 'learning', prompt: 'never-ends' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'delta');
    companion.send({ id: 3, type: 'abort', mode: 'learning' });
    await companion.await((line) => line.type === 'ok' && line.id === 3);

    // The aborted send left nothing behind it: the next turn runs on the same session
    // rather than queueing behind a send that never returned.
    const after = companion.mark();
    companion.send({ id: 4, type: 'send', mode: 'learning', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');
    await companion.await((line) => line.type === 'ok' && line.id === 4);
    expect(companion.linesSince(after).some((line) => line.type === 'error')).toBe(false);
  } finally {
    companion.stop();
  }
});

it('aborts a session with nothing running, and leaves it usable', { timeout: 30_000 }, async () => {
  const companion = startCompanion(temporaryDirectory);
  try {
    // No session exists yet: an abort is a no-op, not a failure.
    companion.send({ id: 1, type: 'abort', mode: 'learning' });
    await companion.await((line) => line.type === 'ok' && line.id === 1);

    companion.send({ id: 2, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'learning', prompt: 'hello' });
    await companion.await((line) => line.type === 'ok' && line.id === 3);

    // The session is idle: aborting it neither fails nor disposes it.
    companion.send({ id: 4, type: 'abort', mode: 'learning' });
    await companion.await((line) => line.type === 'ok' && line.id === 4);

    const after = companion.mark();
    companion.send({ id: 5, type: 'send', mode: 'learning', prompt: 'hello' });
    await companion.await((line) => line.type === 'ok' && line.id === 5);
    expect(companion.linesSince(after).some((line) => line.type === 'error')).toBe(false);
  } finally {
    companion.stop();
  }
});

it('roots the session at the workspace it is told to use', { timeout: 30_000 }, async () => {
  const companion = startCompanion(temporaryDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: temporaryDirectory });
    await companion.await((line) => line.type === 'ok' && line.id === 1);

    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'settled');

    // A workspace that is not there is refused by name, not at some later tool call.
    companion.send({ id: 4, type: 'setWorkspace', path: path.join(temporaryDirectory, 'gone') });
    await companion.await((line) => line.type === 'ok' && line.id === 4);
    companion.send({ id: 5, type: 'send', mode: 'authoring', prompt: 'hello' });
    const failure = await companion.await((line) => line.type === 'error' && line.id === 5);
    expect(failure).toMatchObject({ message: expect.stringContaining('工作区目录不可用') });
  } finally {
    companion.stop();
  }
});

it('remembers the chosen model across companion restarts', async () => {
  const first = startCompanion(temporaryDirectory);
  try {
    first.send({ id: 1, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await first.await((line) => line.type === 'ok' && line.id === 1);
  } finally {
    first.stop();
  }

  // The selection is written under the root the host passed as `--config-dir` — in the
  // application that is `~/.derivon/` — and nothing else appears there: the catalog store
  // is in memory, so the root holds what the operator and the application own, no more.
  const remembered = JSON.parse(await readFile(path.join(temporaryDirectory, 'selected-models.json'), 'utf8'));
  expect(remembered.authoring).toEqual({ providerId: 'test', modelId: 'stream-model', name: 'Stream Model' });
  expect(await readdir(temporaryDirectory)).not.toContain('models-store.json');

  // A new process, and the selection is still the companion's to report — it is not
  // held in the webview, so nothing about the panel's storage can lose it.
  const second = startCompanion(temporaryDirectory);
  try {
    second.send({ id: 1, type: 'listModels', mode: 'authoring' });
    const catalog = await second.await((line) => line.type === 'models' && line.id === 1);
    expect(catalog).toMatchObject({ selected: { providerId: 'test', modelId: 'stream-model' } });
  } finally {
    second.stop();
  }
});

/**
 * #104: the authoring session holds the command surface, and one tool call changes the
 * workspace on disk.
 */
it('registers the command surface as tools and changes the workspace through one', { timeout: 30_000 }, async () => {
  const workspace = await workspaceWithCommandSurface('derivon-issue-104-authoring-');
  const companion = startCompanion(temporaryDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);

    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'tool-call:add-concept' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'tool finished');
    await companion.await((line) => line.type === 'ok' && line.id === 3);

    // The workspace really changed, by the command the surface declared.
    const manifest = JSON.parse(await readFile(path.join(workspace, '.derivon/workspace.json'), 'utf8')) as {
      graph: { points: { id: string }[] };
    };
    expect(manifest.graph.points.map((point) => point.id)).toEqual(['c-fixture']);
    expect(await readFile(path.join(workspace, 'objects/c-fixture/document.md'), 'utf8')).toContain('Fixture concept');

    // The tool set is the capability intersection: write-structure commands are offered, and
    // the built-ins a mode grants itself are read and the platform's shell — never a write.
    const offered = offeredToolNames(requestBodies[0]);
    expect(offered).toContain('add-concept');
    expect(offered).toContain('write-document');
    expect(offered).toContain('delete-object');
    expect(offered).toContain('validate');
    expect(offered).not.toContain('read-learner-record');
    expect(offered).toContain('read');
    expect(offered).toContain(shellToolName(process.platform));
    for (const builtin of ['write', 'edit']) expect(offered).not.toContain(builtin);
  } finally {
    companion.stop();
  }
});

/**
 * #104: the learning session is structurally the read-only one, and the guard is what keeps
 * its granted shell from writing the workspace.
 */
it('holds no write command in the learning session, and refuses a shell write', { timeout: 30_000 }, async () => {
  const workspace = await workspaceWithCommandSurface('derivon-issue-104-learning-');
  const companion = startCompanion(temporaryDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);

    // A write-capability command is not registered, so the model cannot call it at all.
    companion.send({ id: 3, type: 'send', mode: 'learning', prompt: 'tool-call:write-document' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'tool finished');
    await companion.await((line) => line.type === 'ok' && line.id === 3);

    const offered = offeredToolNames(requestBodies[0]);
    expect(offered).toEqual(expect.arrayContaining(['validate', 'read-learner-record', 'read', shellToolName(process.platform)]));
    for (const write of ['add-concept', 'write-document', 'delete-object']) expect(offered).not.toContain(write);
    // Pi answered that the tool is unavailable, and the command never ran.
    expect(requestBodies[1]).toContain('not found');
    expect(existsSync(path.join(workspace, 'objects/c-fixture/document.md'))).toBe(false);

    // The shell is granted, and the guard refuses the write it would perform. The send's
    // reply arrives after the turn's second request, so the tool result is recorded by then.
    companion.send({ id: 4, type: 'send', mode: 'learning', prompt: 'tool-call:bash' });
    await companion.await((line) => line.type === 'ok' && line.id === 4);
    expect(existsSync(path.join(workspace, 'poc.txt'))).toBe(false);
    expect(requestBodies[3]).toContain('learning session');
  } finally {
    companion.stop();
  }
});

/**
 * #129: the session's shell starts at the application's own root, and the `node` in it is the
 * runtime the companion was started with. Neither is the operator's: the PATH is empty, so
 * whatever answers is the application's, and the PATH prefix is Pi's agent directory — which
 * this application points at its own root instead of `~/.pi/agent`.
 */
it('gives the session a shell rooted at the application, with a node that works', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-129-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-129-workspace-'));
  // An empty directory as the whole PATH: nothing the operator installed is reachable, so
  // `node` resolving at all is the application's doing.
  const empty = await mkdtemp(path.join(tmpdir(), 'derivon-issue-129-empty-'));
  const companion = startCompanion(configDirectory, { PATH: empty, HOME: workspace });
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);

    companion.send({ id: 3, type: 'send', mode: 'learning', prompt: 'tool-call:bash-path' });
    await companion.await((line) => line.type === 'ok' && line.id === 3);
    const pathValue = lastToolContent(requestBodies.at(-1) ?? '');
    expect(pathValue.split(path.delimiter)[0]).toBe(path.join(configDirectory, 'bin'));
    expect(pathValue).not.toContain(path.join('.pi', 'agent', 'bin'));

    companion.send({ id: 4, type: 'send', mode: 'learning', prompt: 'tool-call:bash-node' });
    await companion.await((line) => line.type === 'ok' && line.id === 4);
    // The shim is a link to the sidecar runtime, so the version is this process's own.
    expect(lastToolContent(requestBodies.at(-1) ?? '').trim()).toBe(process.version);

    // A healthy environment is silent: the notes are for a machine that could not provide one.
    expect(companion.diagnostics()).not.toContain('[session environment]');
  } finally {
    companion.stop();
  }
});

/**
 * #104: the command surface is installed under the user-level root (`<config-dir>/skills`),
 * which the companion reaches through `--config-dir` rather than by reading HOME itself.
 */
it('finds a command surface installed under the user-level root', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-104-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  await installCommandSurface(path.join(configDirectory, 'skills', 'derivon-mindmap'));
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-104-user-root-'));
  const companion = startCompanion(configDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');
    expect(offeredToolNames(requestBodies[0])).toContain('add-concept');
  } finally {
    companion.stop();
  }
});

/**
 * #104: two installs of the same skill are a choice, and the choice is said out loud — Pi keeps
 * the first one it found (the user-level root comes first) and only its diagnostic reports it.
 */
it('names the skill it kept when both roots install one', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-104-collision-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  await installCommandSurface(path.join(configDirectory, 'skills', 'derivon-mindmap'));
  const workspace = await workspaceWithCommandSurface('derivon-issue-104-collision-');
  const companion = startCompanion(configDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');

    expect(companion.diagnostics()).toContain('技能冲突');
    expect(companion.diagnostics()).toContain(path.join(configDirectory, 'skills', 'derivon-mindmap'));
    expect(companion.diagnostics()).toContain(path.join(workspace, '.derivon', 'skills', 'derivon-mindmap'));
  } finally {
    companion.stop();
  }
});

/**
 * #104: no installed skill is a configuration state, not an error. The session stays usable,
 * and the note names both roots it searched so the operator can act on it.
 */
it('stays usable with no command surface installed, and says where it looked', { timeout: 30_000 }, async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-104-none-'));
  const companion = startCompanion(temporaryDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');

    // No command surface, so no command tools — only the built-ins every mode grants itself.
    expect(offeredToolNames(requestBodies[0])).toEqual(['read', shellToolName(process.platform)]);
    expect(companion.diagnostics()).toContain(path.join(temporaryDirectory, 'skills'));
    expect(companion.diagnostics()).toContain(path.join(workspace, '.derivon/skills'));
  } finally {
    companion.stop();
  }
});

/**
 * #122: a skill reaches the session the way Pi's progressive disclosure says it does. The
 * prompt carries its name, description and location — never its body — and the model opens the
 * file itself. A skill that ships nothing but a `SKILL.md` is therefore a usable skill, and Pi's
 * own user-level skill directory is not one this application reads.
 */
it('lists a skill in the prompt, and the model reads the body its location names', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  // A skill that only ever lived in Pi's tree: the application has its own user-level root and
  // must not reach into `~/.pi/`, whatever HOME the process was started with.
  const home = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-home-'));
  await installSkill(path.join(home, '.pi', 'agent', 'skills', 'pi-only'), 'pi-only', {
    description: 'Pi first, never this application.',
    body: '# Pi only',
  });
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-workspace-'));
  const skill = await installSkill(path.join(workspace, '.derivon', 'skills', 'derivon-method'), 'derivon-method', {
    description: 'The method this workspace expects.',
    body: '# Method\n\nThe passphrase is tungsten.',
  });
  const companion = startCompanion(configDirectory, { ...process.env, HOME: home });
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);

    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'tool-call:read-skill' });
    await companion.await((line) => line.type === 'ok' && line.id === 3);

    const prompt = requestBodies[0];
    expect(prompt).toContain('<name>derivon-method</name>');
    expect(prompt).toContain('The method this workspace expects.');
    expect(prompt).toContain(path.join(skill, 'SKILL.md'));
    // The body itself is not injected; the prompt only says how to get it.
    expect(prompt).not.toContain('The passphrase is tungsten.');
    expect(prompt).toContain("Use the read tool to load a skill's file");
    expect(prompt).not.toContain('pi-only');
    expect(offeredToolNames(prompt)).toContain('read');

    // The location the prompt carried was enough: the model opened the file and read the body.
    expect(lastToolContent(requestBodies.at(-1) ?? '')).toContain('The passphrase is tungsten.');
    expect(companion.diagnostics()).not.toContain('[skills]');
  } finally {
    companion.stop();
  }
});

/**
 * #122: a skills root that reports something badly says so where the operator reads it, and the
 * session is still usable — the same shape as a missing command surface.
 */
it('diagnoses a skill with no description, and keeps the session usable', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-nodesc-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-nodesc-'));
  await installSkill(path.join(workspace, '.derivon', 'skills', 'undescribed'), 'undescribed', {
    body: '# No description',
  });
  const companion = startCompanion(configDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'authoring', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'authoring', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');

    expect(companion.diagnostics()).toContain('[skills]');
    expect(companion.diagnostics()).toContain(path.join(workspace, '.derivon', 'skills', 'undescribed', 'SKILL.md'));
    // Nothing to list, so nothing enters the prompt, and no tool changed because of it.
    expect(requestBodies[0]).not.toContain('<available_skills>');
    expect(offeredToolNames(requestBodies[0])).toEqual(['read', shellToolName(process.platform)]);
  } finally {
    companion.stop();
  }
});

/**
 * #122: the user-level root is the application's own, and a skill installed there is usable the
 * same way. The command surface beside it plays no part in that — a `SKILL.md` alone would do.
 */
it('lists a skill installed under the user-level root, without a workspace of its own', { timeout: 30_000 }, async () => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-userroot-config-'));
  await configureModelDirectory(configDirectory, serverUrl);
  await installSkill(path.join(configDirectory, 'skills', 'method'), 'method', {
    description: 'A method that travels with the operator, not the workspace.',
    body: '# Method',
  });
  const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-issue-122-userroot-ws-'));
  const companion = startCompanion(configDirectory);
  try {
    companion.send({ id: 1, type: 'setWorkspace', path: workspace });
    await companion.await((line) => line.type === 'ok' && line.id === 1);
    companion.send({ id: 2, type: 'setModel', mode: 'learning', providerId: 'test', modelId: 'stream-model' });
    await companion.await((line) => line.type === 'ok' && line.id === 2);
    companion.send({ id: 3, type: 'send', mode: 'learning', prompt: 'hello' });
    await companion.await((line) => line.type === 'event' && line.event.kind === 'message' && line.event.text === 'Hello');

    expect(requestBodies[0]).toContain('<name>method</name>');
    expect(requestBodies[0]).toContain('A method that travels with the operator, not the workspace.');
    expect(requestBodies[0]).toContain(path.join(configDirectory, 'skills', 'method', 'SKILL.md'));
  } finally {
    companion.stop();
  }
});

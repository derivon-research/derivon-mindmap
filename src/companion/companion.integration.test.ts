import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

type Output =
  | { id: number; type: 'models'; models: { providerId: string; modelId: string; name?: string }[]; selected?: unknown }
  | { id: number; type: 'ok' }
  | { id: number; type: 'error'; message: string }
  | { type: 'event'; mode: string; event: Record<string, unknown> };

const companionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist-companion/companion.mjs',
);

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
  const process_ = spawn('node', [companionPath, '--config-dir', configDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: environment,
  });
  let text = '';
  for (const stream of [process_.stdout!, process_.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { text += chunk; });
  }
  // A write can land mid-line, so the last segment is dropped until the rest of it
  // arrives. Everything before it is whole and safe to parse.
  const lines = () =>
    text.split('\n').slice(0, -1).filter(Boolean).map((value) => JSON.parse(value) as Output);
  return {
    process: process_,
    output: () => text,
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
          return reject(new Error(`Timed out waiting for companion output. Output so far:\n${text}`));
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

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-pi-companion-'));
  server = createServer((incoming, response) => {
    let body = '';
    incoming.on('data', (chunk: string) => { body += chunk; });
    incoming.on('end', () => {
      const prompt = lastUserText(body);
      if (prompt.includes('error')) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'test provider failure' } }));
        return;
      }
      const chunk = (text: string, finishReason: string | null) => JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'stream-model',
        choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finishReason }],
      });
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
  const modelsPath = path.join(temporaryDirectory, 'models.json');
  const authPath = path.join(temporaryDirectory, 'auth.json');
  await Promise.all([
    writeFile(modelsPath, JSON.stringify({
      providers: {
        test: {
          baseUrl: `${serverUrl}/v1`,
          api: 'openai-completions',
          apiKey: 'test-key',
          models: [{ id: 'stream-model', name: 'Stream Model' }],
        },
      },
    })),
    writeFile(authPath, '{}'),
  ]);
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

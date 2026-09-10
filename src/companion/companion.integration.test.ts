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
  return {
    process: process_,
    output: () => text,
    send: (value: unknown) => process_.stdin!.write(`${JSON.stringify(value)}\n`),
    await: (matcher: (line: Output) => boolean, timeoutMs = 10_000) => new Promise<Output>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const line = text.split('\n').filter(Boolean).map((value) => JSON.parse(value) as Output).find(matcher);
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
      if (body.includes('error')) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'test provider failure' } }));
        return;
      }
      if (body.includes('abort')) return;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (text: string, finishReason: string | null) => JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'stream-model',
        choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finishReason }],
      });
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
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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

  request({ id: 5, type: 'send', mode: 'learning', prompt: 'abort' });
  request({ id: 6, type: 'abort', mode: 'learning' });
  await waitFor((line) => line.type === 'event' && line.event.kind === 'settled');
  await waitFor((line) => line.type === 'ok' && line.id === 6);

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

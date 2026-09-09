import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

type Output =
  | { id: number; type: 'models'; models: { providerId: string; modelId: string; label: string }[] }
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
let child: ReturnType<typeof spawn>;
let output = '';

function waitFor(matcher: (line: Output) => boolean, timeoutMs = 10_000): Promise<Output> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const line = output.split('\n').filter(Boolean).map((value) => JSON.parse(value) as Output).find(matcher);
      if (line) {
        resolve(line);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for companion output. Output so far:\n${output}`));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

function request(value: unknown) {
  child.stdin!.write(`${JSON.stringify(value)}\n`);
}

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
  child = spawn('node', [companionPath, '--models-path', modelsPath, '--auth-path', authPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => { output += chunk; });
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => { output += chunk; });
});

afterAll(async () => {
  if (child) {
    child.stdin?.end();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once('exit', () => resolve());
    });
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

it('streams, completes, reports errors, aborts, and exits cleanly', { timeout: 30_000 }, async () => {
  request({ id: 1, type: 'listModels' });
  const models = await waitFor((line) => line.type === 'models' && line.id === 1);
  expect(models).toEqual({
    id: 1,
    type: 'models',
    models: [{ providerId: 'test', modelId: 'stream-model', label: 'Stream Model' }],
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

  child.stdin!.end();
  const code = await new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('exit', resolve);
  });
  expect(code).toBe(0);
});

import { spawn } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { RECENT_WORKSPACES_KEY } from '../src/hosts/desktop/recentWorkspaces';
import { findCanvasPixel } from '../src/testing/canvasPixels';
import { createOpeningWorkspace } from './fixtures/opening-workspace';
import { distribution, integerEnvironmentValue, READY_THRESHOLD_MS } from './runtime-metrics';

const runCount = integerEnvironmentValue('PERF_RUNS', 5, 3);
const conceptCount = integerEnvironmentValue('PERF_SIZE', 360, 10);

test('desktop workspace open to interactive', async ({ browser }, testInfo) => {
  const generated = !process.env.PERF_WORKSPACE;
  const rootPath = generated ? await createOpeningWorkspace(conceptCount) : path.resolve(process.env.PERF_WORKSPACE!);
  let documentReads = 0;
  const native = spawn('src-tauri/target/debug/examples/workspace-source-bench', [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const nativeExited = once(native, 'exit');
  let id = 0;
  const pending = new Map<number, ServerResponse>();
  let buffer = Buffer.alloc(0);
  let header: { id: number; length: number; kind: 'json' | 'raw' | 'error' } | undefined;
  native.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (!header) {
        const end = buffer.indexOf(10);
        if (end < 0) break;
        header = JSON.parse(buffer.subarray(0, end).toString());
        buffer = buffer.subarray(end + 1);
      }
      if (buffer.length < header!.length) break;
      const response = pending.get(header!.id)!;
      response.setHeader('Content-Type', header!.kind === 'raw' ? 'application/octet-stream' : 'application/json');
      response.statusCode = header!.kind === 'error' ? 500 : 200;
      response.end(buffer.subarray(0, header!.length));
      pending.delete(header!.id);
      buffer = buffer.subarray(header!.length);
      header = undefined;
    }
  });
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!origin || origin !== testInfo.project.use.baseURL) { response.writeHead(403).end(); return; }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Content-Type', 'application/json');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const args = JSON.parse(Buffer.concat(chunks).toString());
    if (args.command.startsWith('plugin:')) { response.end('null'); return; }
    if (args.rootPath !== rootPath) { response.writeHead(403).end(); return; }
    if (args.command === 'read_workspace_source_document') documentReads++;
    const requestId = ++id;
    pending.set(requestId, response);
    native.stdin.write(`${JSON.stringify({ id: requestId, ...args })}\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const samples: number[] = [];
  try {
    for (let run = 0; run < runCount; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(({ key, root, endpoint }) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, workspaces: [{ path: root, name: 'Opening benchmark', openedAtMs: 1 }] }));
        Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', { value: { unregisterListener() {} } });
        Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
          metadata: { currentWindow: { label: 'main' } },
          transformCallback: () => 0,
          async invoke(command: string, args: object) {
            const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ command, ...args }) });
            if (!response.ok) throw new Error(await response.text());
            return response.headers.get('Content-Type') === 'application/octet-stream'
              ? response.arrayBuffer() : response.json();
          },
        } });
      }, { key: RECENT_WORKSPACES_KEY, root: rootPath, endpoint });
      await page.goto('/');
      await page.getByRole('button', { name: /Opening benchmark/ }).waitFor();
      await page.evaluate(() => {
        const state = window as unknown as { openingMs?: number };
        document.addEventListener('click', (event) => {
          const started = event.timeStamp;
          const observer = new MutationObserver(check);
          let painting = false;
          function ready() {
            return document.querySelector('[data-derivon-mode="authoring"] [role="img"][aria-busy="false"]')
              && !document.querySelector('[data-derivon-mode="authoring"] [aria-busy="true"]');
          }
          function check() {
            if (painting || !ready()) return;
            painting = true;
            requestAnimationFrame(() => requestAnimationFrame(() => {
              painting = false;
              if (!ready()) return;
              state.openingMs = performance.now() - started;
              observer.disconnect();
            }));
          }
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          check();
        }, { capture: true, once: true });
      });
      await page.getByRole('button', { name: /Opening benchmark/ }).click();
      const handle = await page.waitForFunction(() => (window as unknown as { openingMs?: number }).openingMs, undefined, { timeout: 90_000 });
      const elapsed = await handle.jsonValue() as number;
      await handle.dispose();
      samples.push(elapsed);
      console.log(`workspace open sample ${run + 1}: ${elapsed.toFixed(1)} ms`);
      expect(documentReads, 'opening must not acquire object bodies').toBe(0);
      expect(await page.evaluate(findCanvasPixel, { clientCoordinates: true }), 'painted graph').toBeDefined();
      await expect(page.getByRole('textbox', { name: '新建概念', exact: true })).toBeEnabled();
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (run === 0) await page.screenshot({ path: testInfo.outputPath('workspace-open.png') });
      await context.close();
    }
  } finally {
    server.closeAllConnections();
    server.close();
    native.kill();
    await nativeExited;
    if (generated) await rm(rootPath, { recursive: true, force: true });
  }
  const summary = distribution(samples);
  const report = { browser: browser.browserType().name(), fixture: generated ? 'generated' : 'local (not published)',
    thresholdMs: READY_THRESHOLD_MS, documentReads, summary, samples };
  console.log(`OPENING_RESULT ${JSON.stringify(report)}`);
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/workspace-opening-${report.browser}.json`, JSON.stringify(report, null, 2));
  await testInfo.attach('workspace-opening.json', { body: JSON.stringify(report), contentType: 'application/json' });
  expect(summary.max, 'workspace open to interactive budget').toBeLessThanOrEqual(READY_THRESHOLD_MS);
});

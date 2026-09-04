import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createGeneratedRuntimeWorkspace } from './fixtures/generated-workspace.ts';
import {
  formatRuntimeSummary,
  integerEnvironmentValue,
  runtimeBudgetFailures,
  summarizeRuntime,
} from './runtime-metrics.ts';
import { TEST_HOOK_BUFFER, TEST_HOOK_VERSION } from '../src/testHooks.ts';

const DRIVER_URL = process.env.TAURI_DRIVER_URL ?? 'http://127.0.0.1:4444';
const APP_PATH = resolve(process.env.DERIVON_DESKTOP_APP ?? 'src-tauri/target/debug/derivon-app');
const WEB_ELEMENT_ID = 'element-6066-11e4-a52e-4f735466cecf';

const conceptCount = integerEnvironmentValue('PERF_SIZE', 1000, 100);
const runCount = integerEnvironmentValue('PERF_RUNS', 5, 3);

async function webdriver(method, path, body) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.value?.error) {
    throw new Error(`WebDriver ${method} ${path} failed: ${JSON.stringify(result.value ?? result)}`);
  }
  return result.value ?? result;
}

async function waitForDriver(driver) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (driver.exitCode !== null) throw new Error(`tauri-driver exited with code ${driver.exitCode}`);
    try {
      await webdriver('GET', '/status');
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error('Timed out waiting for tauri-driver');
}

async function createSession() {
  const value = await webdriver('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        'tauri:options': { application: APP_PATH },
      },
    },
  });
  const sessionId = value.sessionId;
  if (!sessionId) throw new Error(`WebDriver did not return a session id: ${JSON.stringify(value)}`);
  return sessionId;
}

async function execute(sessionId, script, args = []) {
  return webdriver('POST', `/session/${sessionId}/execute/sync`, { script, args });
}

async function closeSession(sessionId) {
  await webdriver('DELETE', `/session/${sessionId}`);
}

async function poll(sessionId, script, args = [], timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await execute(sessionId, script, args);
    if (result) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for desktop application state: ${script}`);
}

async function waitForHook(sessionId, afterSequence, expected) {
  return poll(sessionId, `
    const [bufferName, hookVersion, minimumSequence, match] = arguments;
    const events = window[bufferName] ?? [];
    const unsupported = events.find((event) => event.version !== hookVersion);
    if (unsupported) throw new Error('Unsupported Derivon test-hook version: ' + unsupported.version);
    return events.find((event) => {
      const context = event.context ?? {};
      return event.sequence > minimumSequence
        && event.kind === match.kind
        && event.interaction === match.interaction
        && Object.entries(match.context ?? {}).every(([key, value]) => context[key] === value);
    }) ?? null;
  `, [TEST_HOOK_BUFFER, TEST_HOOK_VERSION, afterSequence, expected]);
}

async function lastSequence(sessionId) {
  return execute(sessionId, `
    const events = window[arguments[0]] ?? [];
    return events.at(-1)?.sequence ?? 0;
  `, [TEST_HOOK_BUFFER]);
}

async function setInput(sessionId, selector, value) {
  await poll(sessionId, 'return document.querySelector(arguments[0]) !== null;', [selector]);
  await execute(sessionId, `
    const [selector, value] = arguments;
    const input = document.querySelector(selector);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    return true;
  `, [selector, value]);
}

async function click(sessionId, selector) {
  await poll(sessionId, 'return document.querySelector(arguments[0]) !== null;', [selector]);
  const element = await webdriver('POST', `/session/${sessionId}/element`, {
    using: 'css selector',
    value: selector,
  });
  const elementId = element[WEB_ELEMENT_ID];
  if (!elementId) throw new Error(`WebDriver did not return an element id for ${selector}`);
  await webdriver('POST', `/session/${sessionId}/element/${elementId}/click`, {});
}

async function measureInteraction(sessionId, expected, trigger) {
  const sequence = await lastSequence(sessionId);
  await trigger();
  const event = await waitForHook(sessionId, sequence, expected);
  return event.completedAtMs - event.startedAtMs;
}

async function installFixture(workspace) {
  const sessionId = await createSession();
  try {
    await execute(sessionId, `
      localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
        version: 2,
        completedTours: [],
        progress: {},
      }));
      localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify(arguments[0]));
      return true;
    `, [workspace]);
  } finally {
    await closeSession(sessionId);
  }
}

async function runSample(fixture, run) {
  const sessionId = await createSession();
  try {
    const interactive = await waitForHook(sessionId, 0, { kind: 'interactive' });
    const selectedId = fixture.interactions.selectedConceptId;
    await setInput(sessionId, 'input[aria-label="搜索概念"]', selectedId);
    const selectConceptMs = await measureInteraction(
      sessionId,
      { kind: 'interaction-complete', interaction: 'select-concept', context: { conceptId: selectedId } },
      () => click(sessionId, '#concept-search-results [role="option"]'),
    );

    const panelExpandMs = await measureInteraction(
      sessionId,
      { kind: 'interaction-complete', interaction: 'toggle-panel', context: { panel: 'route', expanded: true } },
      () => click(sessionId, 'button[aria-label="打开路线模式"]'),
    );

    const targetId = fixture.interactions.targetConceptId;
    await setInput(sessionId, '#route-target-search', targetId);
    const switchTargetMs = await measureInteraction(
      sessionId,
      { kind: 'interaction-complete', interaction: 'switch-target', context: { conceptId: targetId, selected: true } },
      () => click(sessionId, '#route-target-search-results input[type="checkbox"]'),
    );

    const panelCollapseMs = await measureInteraction(
      sessionId,
      { kind: 'interaction-complete', interaction: 'toggle-panel', context: { panel: 'route', expanded: false } },
      () => click(sessionId, 'button[aria-label="关闭路线模式"]'),
    );

    return {
      run,
      readyMs: interactive.completedAtMs,
      selectConceptMs,
      switchTargetMs,
      panelExpandMs,
      panelCollapseMs,
    };
  } finally {
    await closeSession(sessionId);
  }
}

const driver = spawn(process.env.TAURI_DRIVER ?? 'tauri-driver', [], { stdio: 'inherit' });
try {
  await waitForDriver(driver);
  const fixture = createGeneratedRuntimeWorkspace(conceptCount);
  await installFixture(fixture.workspace);
  const samples = [];
  for (let run = 1; run <= runCount; run += 1) {
    samples.push(await runSample(fixture, run));
  }

  const summary = summarizeRuntime(samples);
  const markdown = formatRuntimeSummary('desktop', fixture.name, fixture.conceptCount, summary);
  const result = {
    surface: 'runtime-test-hook-v1',
    host: 'desktop',
    fixture: { name: fixture.name, conceptCount: fixture.conceptCount },
    summary,
    samples,
  };
  console.log(`\n${markdown}`);
  console.log(`PERF_RESULT ${JSON.stringify(result)}`);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/desktop-runtime-performance-summary.md', markdown);
  await writeFile('test-results/desktop-runtime-performance.json', JSON.stringify(result, null, 2));

  const failures = runtimeBudgetFailures(summary);
  if (failures.length) throw new Error(`Desktop runtime budgets exceeded:\n${failures.join('\n')}`);
} finally {
  driver.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (driver.exitCode !== null) resolveExit();
    else driver.once('exit', resolveExit);
  });
}

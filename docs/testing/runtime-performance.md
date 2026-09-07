# Runtime performance contract

The runtime performance benchmark treats the application as a black box. Both the web and desktop hosts must emit the same versioned DOM events and meet the same budgets:

- open to interactive: at most 2500 ms;
- interaction response: at most 200 ms for selecting a concept, switching a target, and expanding or collapsing a panel.

The limits are fixed. Do not raise them to make a rewrite pass.

## Authoring edits

The same 200 ms interaction budget covers the authoring side's edits, measured by
`npm run bench:authoring` rather than through the test-hook transport below. The transport
serves the v0.4.2 application on `legacy.html`, which has no authoring side; the v1 authoring
surface exists only in the desktop module graph and is driven here through the real workbench,
a real `WorkspaceSession` and the real content operations, so a number covers validating the
change, re-deriving effective content and repainting the object page.

Three edits are measured at the same generated scale as the runtime benchmark
(`VITE_PERF_SIZE`, default 1000 concepts and 1000 derivations), each from the input to the
second animation frame after it:

- object metadata: renaming a concept;
- derivation structure: committing premises, result and learning cost as one change;
- deletion: executing a confirmed deletion plan.

The measurement is taken on the object view. A hidden overview is not laid out again per
change (ADR-0006), so including it would measure a cost the product does not pay.

Assembling a deletion plan is reported alongside these but is not held to the budget: it
acquires every owned document body and asks the host for a file inventory, which is a
deliberate action with a progress status rather than a keystroke. Its reported number comes
from an in-memory source and therefore says what the application costs, not what a filesystem
costs.

Measured on an Apple silicon laptop at 1000 concepts, four runs: renaming 42–44 ms, derivation
structure 88–103 ms, deletion 98–99 ms, plan assembly 53–64 ms. Like the rendering benchmark,
`npm test` skips this: a shared runner's timing noise is larger than the headroom.

## Learning interactions

The transport below still serves `legacy.html`, which has no v1 learning side, so switching a
target and moving a route panel are measured through the v1 surface instead, by
`npm run bench:learning`. It renders the real `LearningMode` over a real `WorkspaceSession` at
the same generated scale as the runtime benchmark (`VITE_PERF_SIZE`, default 1000 concepts and
1000 derivations), each interaction timed from the input to the second animation frame after it:

- switching a target on, from the document the learner opened to read, and back off from
  its chip;
- widening the route rail from the step list to the route subgraph, returning it to the list,
  and hiding it to a recall tab.

The route measured is 39 steps. The generated topology is one cycle, so aiming at the far side
of it produces a 499-step route — and widening the rail onto a subgraph that size costs about
1.2 s, nearly all of it drawing the graph. That is graph-opening work under the
[rendering budget](rendering.md), not panel work, and no learner is handed a route of that
length; a benchmark aimed there would measure the renderer through the panel rather than the
panel. The concept count, which is the scale the budgets are stated at, stays at 1000.

Measured on an Apple silicon laptop at 1000 concepts, four runs: adding a target 81–110 ms,
removing one 99–102 ms, widening the rail 136–138 ms, collapsing it 81 ms, hiding it 83 ms.
`npm test` skips this for the same reason as the benchmarks above.

## Event transport

The application dispatches `CustomEvent` instances on `window` with the event name `derivon:test-hook`. A benchmark listener must be installed before application scripts run so that it cannot miss the initial event. The application also appends the same details to the document-local `window.__derivonTestHooksV1` buffer; WebDriver hosts that cannot install a preload listener use this buffer.

Every event has `version`, `sequence`, and `completedAtMs`. Its remaining fields form this discriminated union:

```ts
type DerivonTestHook = TestHookPayload & {
  version: 1;
  sequence: number;
  completedAtMs: number;
};

type TestHookPayload =
  | { kind: 'interactive' }
  | {
      kind: 'interaction-complete';
      interaction: 'select-concept';
      context: { conceptId: string };
      startedAtMs: number;
    }
  | {
      kind: 'interaction-complete';
      interaction: 'switch-target';
      context: { conceptId: string; selected: boolean };
      startedAtMs: number;
    }
  | {
      kind: 'interaction-complete';
      interaction: 'toggle-panel';
      context: { panel: string; expanded: boolean };
      startedAtMs: number;
    };
```

Both timestamps are milliseconds from the document's `performance.now()` clock. `startedAtMs` comes from the browser input event's `timeStamp`, normalized to the same time origin when necessary; this includes delay before the application handler starts. The response duration is `completedAtMs - startedAtMs` and covers input delay, application processing, renderer synchronization, and the completion paint. `sequence` starts at 1 and increases by one for each event in a document. Consumers must reject unsupported versions rather than guessing at payload changes.

## Interactive signal

Emit exactly one event after all of these conditions are true:

- the requested workspace graph has been read;
- the primary controls accept input;
- the initial layout and graph-renderer synchronization have completed;
- the resulting visual state has reached a browser paint.

```ts
{
  version: 1,
  sequence: 1,
  completedAtMs: 1842.6,
  kind: 'interactive'
}
```

A loading placeholder, an empty renderer awaiting layout, or controls whose actions cannot yet complete are not interactive states.

## Interaction completion signals

Emit one `interaction-complete` event for each accepted user action below. Emit it only after application state, affected panels, and the graph renderer are synchronized and the result has reached a browser paint. Do not emit from the input handler before asynchronous work or rendering finishes.

Select a concept:

```ts
{
  kind: 'interaction-complete',
  interaction: 'select-concept',
  context: { conceptId: 'linear-map' },
  startedAtMs: 1900.1
}
```

Switch a target. `selected` describes the target's state after the action:

```ts
{
  kind: 'interaction-complete',
  interaction: 'switch-target',
  context: { conceptId: 'null-range', selected: true },
  startedAtMs: 2050.4
}
```

Expand or collapse a panel. `expanded` describes the panel state after the action:

```ts
{
  kind: 'interaction-complete',
  interaction: 'toggle-panel',
  context: { panel: 'route', expanded: true },
  startedAtMs: 2200.7
}
```

Adding another host or replacing the application implementation does not change these events. Extend the contract with a new version if an incompatible payload is unavoidable.

## Benchmark fixture and output

`benchmarks/fixtures/generated-workspace.ts` is the only source of the performance workspace. Its size is controlled by `PERF_SIZE`; replacing it with the flagship workspace must require changing only the fixture selected by `benchmarks/runtime-performance.spec.ts`. Each browser context installs the fixture on a same-origin static page before the measured application navigation, so fixture serialization and test setup are excluded from open-to-interactive time.

Run the web benchmark with:

```bash
PERF_SIZE=1000 PERF_RUNS=5 npm run bench:runtime
```

The desktop benchmark requires Linux, `tauri-driver`, `WebKitWebDriver`, and a debug Tauri binary:

```bash
npm run tauri:build -- --debug --no-bundle -- --locked
PERF_SIZE=1000 PERF_RUNS=5 npm run bench:runtime:desktop
```

`PERF_RUNS` has a minimum of 3. Both runners import the same thresholds and distribution functions from `benchmarks/runtime-metrics.ts`. Reports include every sample plus min, median, p75, p95, and max distributions. A maximum over either fixed limit fails the benchmark. Human-readable and JSON results are preserved under `test-results`; CI publishes them before enforcing the expected-red budgets.

Non-performance end-to-end coverage of this contract uses the bundled `math-reforged` workspace in `tests/performance-hooks.spec.ts`; synthetic data is reserved for performance measurement.

## Current Workspace Opening

`npm run bench:workspace-opening` measures the current desktop application at `/`, using
a production frontend and the real Rust read commands through a read-only loopback bridge.
This runs on macOS as well as Linux without requiring Tauri WebDriver. It substitutes only
the IPC transport and native close-event registration, not source I/O, revision observation,
content acquisition, modes or rendering. It is not a measurement of the native window launch
or WebView IPC implementation; the Linux WebDriver benchmark remains separate.

The default fixture is generated Markdown with `PERF_SIZE=360` concepts and a 64 MiB
unrequested asset. It makes full-file revision cost observable without redistributing case
content. `PERF_WORKSPACE=/absolute/local/workspace` substitutes a local read-only case;
`PERF_BROWSER=webkit` selects WebKit instead of Chromium. `PERF_RUNS` defaults to 5 and must
be at least 3. No warm-up samples are dropped. The build and fixture creation are outside
the measured interval; each sample uses a fresh browser context.

The interval starts with the workspace-button input timestamp and ends in the page after
the graph reports ready and the result reaches a paint. Browser-side timestamps exclude
Playwright polling delay. The test also asserts a nonblank canvas, enabled authoring controls,
and **zero object-document requests during opening**. The launch-frame `interactive` hook
cannot measure a later workspace open, so this case observes the accessible loading contract
instead of reusing that earlier hook. JSON reports contain every sample, min, median, p75,
p95 and max, under `test-results/workspace-opening-<browser>.json`. The same fixed 2500 ms
maximum is enforced in the manual runtime-performance workflow.

The regression had two contributors: eager acquisition of persisted generated HTML (184 MB
for 241 KB of Markdown in Agent-Harness-101), and unaccelerated debug SHA-256 over those files.
The product correction is Markdown-only persistence and demand-driven body acquisition
(ADR-0008), not faster preloading or relaxed consistency checks. Existing files are not deleted
by the benchmark or application. Native hashing also enables the library's runtime-detected
hardware implementation and an optimized debug fallback without changing revision bytes.
Runtime previews embed the application's KaTeX CSS and fonts; they do not wait for a CDN
stylesheet or write those generated bytes into workspace documents.

## During the v1.0.0 rewrite

The end-to-end benchmarks still navigate to `/legacy.html`, the v0.4.2 application. The new application at `/` renders the bundled graph through the isolated rendering module and emits `interactive` only after visible loading states clear, including the graph's first paint (`tests/web-host.spec.ts`, `tests/desktop-host.desktop.spec.ts`); its target switching and route panels emit `interaction-complete` and are measured by `npm run bench:learning` above, not yet through this transport. The standalone [rendering benchmark](rendering.md) measures generated-graph opening, hover and selection through the module interface without booting the application. Move the end-to-end benchmarks to `/` when all measured workflows and their completion hooks exist, and drop the `legacy` entry with the old form.

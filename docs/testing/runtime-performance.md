# Runtime performance contract

The runtime performance benchmark treats the application as a black box. Both the web and desktop hosts must emit the same versioned DOM events and meet the same budgets:

- open to interactive: at most 2500 ms;
- interaction response: at most 200 ms for selecting a concept, switching a target, and expanding or collapsing a panel.

The limits are fixed. Do not raise them to make a rewrite pass.

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

Both timestamps are milliseconds from the document's `performance.now()` clock. `startedAtMs` is captured when the application accepts the input; the response duration is `completedAtMs - startedAtMs`. `sequence` starts at 1 and increases by one for each event in a document. Consumers must reject unsupported versions rather than guessing at payload changes.

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

# Runtime performance contract

The runtime performance benchmark treats the application as a black box. Both the web and desktop hosts must emit the same versioned DOM events and meet the same budgets:

- open to interactive: at most 2500 ms;
- interaction response: at most 200 ms for selecting a point, switching a target, and expanding or collapsing a panel.

The limits are fixed. Do not raise them to make a rewrite pass.

## Event transport

The application dispatches `CustomEvent` instances on `window` with the event name `derivon:test-hook`. A benchmark listener must be installed before application scripts run so that it cannot miss the initial event.

Every event detail has this common shape:

```ts
type DerivonTestHook = {
  version: 1;
  sequence: number;
  at: number;
  kind: 'interactive' | 'interaction-complete';
  interaction?: 'select-point' | 'switch-target' | 'toggle-panel';
  context?: Record<string, string | boolean>;
};
```

`at` is the completion time from the document's `performance.now()` clock. `sequence` starts at 1 and increases by one for each event in a document. Consumers must reject unsupported versions rather than guessing at payload changes.

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
  at: 1842.6,
  kind: 'interactive'
}
```

A loading placeholder, an empty renderer awaiting layout, or controls whose actions cannot yet complete are not interactive states.

## Interaction completion signals

Emit one `interaction-complete` event for each accepted user action below. Emit it only after application state, affected panels, and the graph renderer are synchronized and the result has reached a browser paint. Do not emit from the input handler before asynchronous work or rendering finishes.

Select a point:

```ts
{
  kind: 'interaction-complete',
  interaction: 'select-point',
  context: { pointId: 'linear-map' }
}
```

Switch a target. `selected` describes the target's state after the action:

```ts
{
  kind: 'interaction-complete',
  interaction: 'switch-target',
  context: { pointId: 'null-range', selected: true }
}
```

Expand or collapse a panel. `expanded` describes the panel state after the action:

```ts
{
  kind: 'interaction-complete',
  interaction: 'toggle-panel',
  context: { panel: 'route', expanded: true }
}
```

Adding another host or replacing the application implementation does not change these events. Extend the contract with a new version if an incompatible payload is unavoidable.

## Benchmark fixture and output

`benchmarks/fixtures/generated-workspace.ts` is the only source of the performance workspace. Its size is controlled by `PERF_SIZE`; replacing it with the flagship workspace must require changing only the fixture selected by `benchmarks/runtime-performance.spec.ts`.

Run the benchmark with:

```bash
PERF_SIZE=1000 PERF_RUNS=5 npm run bench:runtime
```

`PERF_RUNS` has a minimum of 3. The report includes every sample plus min, median, p75, p95, and max distributions. A maximum over either fixed limit fails the benchmark. The human-readable report is written to `test-results/runtime-performance-summary.md`, and the complete JSON is attached to the Playwright result.

Non-performance end-to-end coverage of this contract uses the bundled `math-reforged` workspace in `tests/performance-hooks.spec.ts`; synthetic data is reserved for performance measurement.

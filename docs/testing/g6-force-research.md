# Installed G6 Force Research

This investigation informed [ADR-0006](../adr/0006-the-overview-does-not-track-authoring-changes-live.md).
The incremental-simulation experiment was abandoned before integration; this note is
research evidence, not an implemented feature or a plan to add a simulation layer.

Source inspection only; no tests or application changes. Installed manifests identify
`@antv/g6` **5.1.1**, `@antv/layout` **2.0.0**, and `d3-force` **3.0.0**.
These findings concern this pair, not older G6/layout documentation. References
identify installed primary sources and matching version-pinned published/upstream sources.

## Native Simulation and Topology

- **Continuous simulation exists.** `D3ForceLayout` exposes `simulation`, `nodes()`,
  `stop()`, `tick(n)`, `restart(alpha?)`, `reheat()`, `getAlpha()/setAlpha()`,
  `getForce()/force()`, `find()`, and `setFixedPosition()`. A positive
  `simulation.alphaTarget()` above `alphaMin` sustains automatic ticks; restore zero
  to cool. `execute()` resolves on D3's `end`, so an intentionally perpetual run
  does not finish. G6's animated `iterations` becomes `maxIteration`, which this
  D3 implementation does not use as a timer limit. [1][2][4]
- **No native `D3ForceLayout.updateNode`, `addNode`, `addEdge`, or `updateData`.**
  Neither its implementation/types nor its base classes declare these methods.
  G6's graph-data APIs modify its rendering model, not the live simulation. [1][3][4]
- **`Graph.layout()` creates fresh instances.** It calls `postLayout()`;
  `graphLayout()` calls `initGraphLayout()` each pass, constructing a new adapter
  and underlying layout. Existing positions seed from `style.x/y/z`; layout
  results do not export velocities/fixed coordinates. This is not incremental
  simulation continuity. Replacement does not first stop the previous instance. [4][5]
- Reusing a native layout's `execute()` retains its simulation but rebuilds the
  context and D3 node/edge copies. Explicitly supplying surviving nodes'
  `x/y/vx/vy/fx/fy` preserves numeric state, not object identity; reheat/restart
  explicitly after a cooled run. Extraction accepts these top-level fields. [1][3][6]
- Underlying D3 supports `simulation.nodes(nextNodes)` and
  `simulation.force('link').links(nextLinks)`. Retaining surviving node objects
  preserves finite positions/velocities. Links mutate endpoints into object
  references: clear obsolete links before replacing nodes, then provide fresh
  ID-based links. However, direct topology changes bypass AntV's private copies
  and model, so its position synchronization/export/fixing becomes inconsistent.
  This needs an owned integration, not a claimed native incremental layout API. [1][2]

## Drag, Callbacks, and Disposal

- `drag-element-force` accepts only controller-managed `d3-force` or
  `d3-force-3d` instances, not `force` or an external standalone simulation.
  It unwraps the adapter, sets `alphaTarget(0.3).restart()`, and updates fixed
  positions. Link forces transfer movement to neighbours. Release sets target
  zero and unpins unless `fixed: true`. Visible neighbour motion requires a live
  render callback; G6's animated path installs one, its nonanimated path does not
  install that callback automatically. [2][4][5][7]
- `onTick` is a single option callback, **not a layout event subscription**.
  Automatic ticks capture the first execution's options and register only when
  creating the simulation; later `execute(..., {onTick})` does not replace it.
  Constructor-injected `forceSimulation` skips this registration entirely.
  Manual `layout.tick(n)` instead calls the current callback once after all ticks.
  G6's animated controller overrides the caller's `onTick`. [1][4][5]
- Additional D3 listeners should use `simulation.on('tick.owner', fn)` and remove
  with `null`; do not overwrite AntV's unnamed `tick`/`end` handlers. `stop()`
  emits no `end`, leaving `execute()` pending. Re-execution replaces the unnamed
  end resolver. Native inherited `destroy()` clears context/worker but does not
  stop D3: stop and detach owned listeners before disposal. [1][2][3]

## Workers and Cost

- Worker RPC exposes only `execute`/`destroy`, constructs a fresh layout per job,
  and returns the final model: no tick stream, incremental edits, pinning, or
  restart RPC. Main-thread simulation access is unavailable for successful worker
  runs, making native force dragging incompatible. Options are sent through
  Comlink without callback proxies; functions, including G6's injected node/edge
  accessors and animated `onTick`, cannot be structured-cloned. Caught failures
  fall back to the main thread. Worker URL discovery guesses a sibling
  `worker.js`, so bundler deployment also needs scrutiny. [3][5][8]
- Each animated G6 tick exports all nodes/edges, updates model data, and draws;
  it does not await draw completion. Repeated layout calls can leave competing
  timers. Nonanimated `tick(300)` is synchronous. Link work scales with edges
  times link iterations; collision iterations add cost. Batch topology changes,
  bound/throttle rendering, and cool idle simulations. These are source-derived
  risks, not measured performance results. [1][2][4][5]

## Primary Sources

Local paths are relative to this note; published mirrors are version-pinned.

1. Layout [implementation](../../node_modules/@antv/layout/src/algorithm/d3-force/index.ts), [types](../../node_modules/@antv/layout/lib/algorithm/d3-force/index.d.ts), [published 2.0.0](https://unpkg.com/@antv/layout@2.0.0/src/algorithm/d3-force/index.ts).
2. D3 [simulation](../../node_modules/d3-force/src/simulation.js), [links](../../node_modules/d3-force/src/link.js), upstream [v3.0.0 simulation](https://github.com/d3/d3-force/blob/v3.0.0/src/simulation.js) and [links](https://github.com/d3/d3-force/blob/v3.0.0/src/link.js).
3. Layout [base classes](../../node_modules/@antv/layout/src/algorithm/base-layout.ts), [published 2.0.0](https://unpkg.com/@antv/layout@2.0.0/src/algorithm/base-layout.ts).
4. G6 [controller](../../node_modules/@antv/g6/src/runtime/layout.ts), [Graph](../../node_modules/@antv/g6/src/runtime/graph.ts), published 5.1.1 [controller](https://unpkg.com/@antv/g6@5.1.1/src/runtime/layout.ts) and [Graph](https://unpkg.com/@antv/g6@5.1.1/src/runtime/graph.ts).
5. G6 [adapter](../../node_modules/@antv/g6/src/utils/layout.ts), [published 5.1.1](https://unpkg.com/@antv/g6@5.1.1/src/utils/layout.ts).
6. Layout [data extraction](../../node_modules/@antv/layout/src/model/data.ts), [published 2.0.0](https://unpkg.com/@antv/layout@2.0.0/src/model/data.ts).
7. G6 [force drag](../../node_modules/@antv/g6/src/behaviors/drag-element-force.ts), [published 5.1.1](https://unpkg.com/@antv/g6@5.1.1/src/behaviors/drag-element-force.ts).
8. Layout [supervisor](../../node_modules/@antv/layout/src/runtime/supervisor.ts), [worker](../../node_modules/@antv/layout/src/worker.ts), published 2.0.0 [supervisor](https://unpkg.com/@antv/layout@2.0.0/src/runtime/supervisor.ts) and [worker](https://unpkg.com/@antv/layout@2.0.0/src/worker.ts).

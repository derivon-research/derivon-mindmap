# Rendering module

The public entry is `src/rendering/index.ts`. Mount `GraphRenderer` in a container with
nonzero width and height and pass only `view: GraphView` and `onEvent`. The component
fills that container. Each mount owns its own G6 instance; there is no renderer singleton,
workspace port, application state dependency, document content, coordinate input, or
imperative viewport API. Application consumers must import it behind a lazy boundary.

## View and events

Pass a complete immutable model on each change. Concept IDs must be unique among concepts,
hyperedge IDs among hyperedges, and every endpoint must reference a concept in the view.
A concept and a hyperedge may share an ID. The workspace boundary validates workspace
content; the renderer consumes an already valid view, not a workspace manifest.

- `overview`: G6 force layout, concept points, direct structural links, no derivation nodes.
- `neighbourhood`: the caller supplies the one-step subgraph; G6 draws concept cards and
  explicit derivations using hierarchical layout.
- `route`: the caller supplies the solved subgraph; the same explicit hyperedge encoding
  has no learning-mode assumptions. Empty marks are valid for authoring previews.

Hierarchical direction is chosen from the container's aspect ratio at mount. Subsequent
container resizing changes the viewport size without moving objects. A view-kind change
mounts a fresh layout. Within a kind, the renderer diffs complete models by ID. Label,
weight and mark changes use G6 `draw()` only: positions and the user's pan/zoom survive.
A topology replacement (changed node IDs or link endpoints) receives a new native layout
and fit internally, so newly introduced objects are placed and remain selectable. The
caller does not need a remount key. Under
[ADR-0006](../adr/0006-the-overview-does-not-track-authoring-changes-live.md), this is
opening a changed graph or another subgraph, not a promise to animate authoring changes
in a visible overview. The "no layout recomputation" constraint applies to ordinary
updates of the same topology; continuity across authoring topology changes is not a
product requirement.

The renderer does not subscribe to workspace changes and currently lays out a changed
topology whenever a caller supplies one. Deferring hidden updates, invalidating retained
views and refreshing on return belong to the consuming workflows in #47/#52; external
changes while visible need the synchronization policy in #55. Those integration behaviors
are not implemented by this module. Do not feed every accepted edit into a hidden
renderer and assume CSS hiding prevents computation.

`select` carries `{ kind: 'concept' | 'derivation', id }`, or `null` for a canvas click.
`activate` carries a non-null object on double-click. There are no mutation events.
Native G6 pan, zoom, hover and viewport optimization stay inside the component. Loading
is represented by `aria-busy`, and rendering failures by a visible alert.

## Marks and detail

Marks compose by visual channel, not by enumerating pairs:

- Fill: `completed` takes precedence over `known`, then the object's default fill.
- Outline: `selected` takes precedence over `current`, then `target`, then the default.
- Opacity: `muted` reduces opacity independently of fill and outline.

The overview consumes only deliberately set `known` and `target` marks. Selection and
route-progress marks do not drive its appearance (ADR-0003).

Overview hover temporarily highlights structural predecessors and successors in separate
colors and exposes the focused label. These are visual relationships, not solver closure:
a link from one tail does not imply that tail alone satisfies a multi-tail derivation.
For large/cyclic graphs, breadth-first hover detail is bounded to 64 concepts in each
direction and pending pointer changes are coalesced. This is deliberate LOD under
ADR-0003, not a complete reachability result. G6 owns adjacency, force/hierarchical layout,
canvas drawing and viewport-transform simplification. No legacy scene, projection, graph
index, geometry, or layout service is imported. Direct legacy `d3-force` and
`@dagrejs/dagre` dependencies remain only for the old application until #56 removes it.

The abandoned incremental-force investigation is recorded in
[G6 force research](g6-force-research.md). It documents the installed library's capabilities
and limitations, not an additional renderer, simulation or committed animation feature.

## Verification

Run standalone real-G6 Chromium acceptance tests without starting the application:

```sh
npx vitest run --project browser src/rendering/GraphRenderer.browser.test.tsx
npm run bench:rendering
VITE_PERF_SIZE=2000 npm run bench:rendering
```

The benchmark consumes `benchmarks/fixtures/generated-workspace.ts`, not a substitute
renderer or fixture. Three mounts each measure open-to-painted-ready (maximum 2500 ms)
and three native pointer selections through the next paint (maximum 200 ms). Hover-in
and hover-out are measured separately from native pointer movement to highlighted or
restored canvas pixels and the next paint, also with a 200 ms ceiling. Selection samples
can include pending hover work, but are not used as a proxy for hover latency. Samples
are logged by the verbose benchmark command. Module import and test
harness startup are outside this module benchmark; it is not a claim about cold application
startup or a replacement for the end-to-end runtime benchmark. The legacy benchmark stays
on `/legacy.html` while target switching and route panels await their rewrite tickets.

Behavior tests cover real canvas pixels and clicks, activation, separate instances,
StrictMode teardown, ID collisions, empty tails, parallel multi-tail derivations, marks,
topology replacements, endpoint retargeting, abandoned concurrent renders, hover, panning,
zooming and resizing. `src/app/moduleBoundaries.test.ts` guards
isolation and the first-screen lazy boundary. `tests/web-host.spec.ts` checks that the new
application's interactive test hook waits for its lazy graph rather than a placeholder.

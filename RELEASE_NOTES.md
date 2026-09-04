# Next Demo Release

> Historical pre-v1 release record. Replacement-view descriptions below document shipped v0.x behavior, not v1 product capabilities; see [`CONTEXT.md`](CONTEXT.md) for the v1 boundary.

## Agent integration

- Agent Skills now live in the independent `derivon-research/skills` repository and install through `npx skills`; Mindmap no longer embeds, installs, upgrades, detects, or removes Agent files when workspaces are opened or saved.
- The external package provides six focused skills for the CLI/model, Mindmap Unix workflows and route textbook export, chapter-by-chapter book import, read-only understanding assessment, personal knowledge exploration, and expert-led graph creation.
- Existing private-test workspace bundles are left untouched so user modifications cannot be removed. Users may delete old generated `.agents`, `.claude`, `.github/skills`, and `.derivon/agent` content manually after review.
- The in-app Agent tutorial and README now point to the external installer and repository. Historical coding-plan files were removed from the repository.

## G6 Canvas renderer

- G6 Canvas is now the only production graph renderer; the XYFlow runtime and dependency were removed.
- Canvas-native concepts are `136 x 64` cards with labels, IDs, replacement-depth accents, and typed ports. Derivation junctions are cost-only diamonds with silhouette stacking for parallel implementations; premise/conclusion edges are passive cubic curves with cycle-safe backward routing.
- Large graphs retain complete Canvas semantics at every size: global views keep card labels, identities, ports, derivation junctions, and ordinary edges instead of degrading to blank silhouettes above 300 concepts. Focused views keep the same complete background while dimming unrelated cards and edges.
- First open now waits for valid Worker layout coordinates before inserting graph elements, eliminating the transient single-point Force pileup. Large initial overviews keep a readable zoom floor; the explicit fit-view control still frames the complete graph.
- The Markdown editor now rejects transactions whose ProseMirror tree violates the active schema before focus/blur plugins can process them. Block-math input only replaces a complete compatible text block, and changing document identity remounts the editor, preventing Safari blur crashes such as `Called contentMatchAt on a node with invalid content`.
- Standard Markdown images now render from HTTP(S) or document-relative workspace assets without replacing authored paths with runtime URLs. The in-editor image settings replace unreliable WebView prompts, and pasted clipboard images are persisted in each object's `assets/` directory before insertion. The editor also adds nested GFM task lists, code-block controls, and heading levels four through six; missing or unsafe images remain editable as diagnostic placeholders.
- Concept and derivation documents can now be cross-referenced through an IDE-style object picker or the `[[` trigger. References remain portable relative Markdown links to generated `index.html` files, support graph-wide label/ID/relationship search, and open inside the app with Ctrl/Cmd-click. Ordinary links use a validated in-editor form instead of WebView prompts.
- Graph topology, runtime state, selection, focus, route roles, viewport controls, and workspace switching are renderer-neutral or G6-native.
- Layout uses a cancellable Worker with request IDs. The runtime-only toolbar selector controls the global view with Auto, Dagre, and Force: Auto keeps the 400 projected-node threshold, while explicit modes ignore graph size. Focused neighborhood views always use compact Dagre. Structural changes debounce for 120 ms and weight changes for 400 ms; changing global modes relayouts and fits immediately.
- Large Force overviews retain reliable concept selection at low zoom through an interactive-node bounds fallback when Canvas picking misses a rendered card.
- The Canvas fit-view control is context aware: global view fits the complete graph, while a focused neighborhood fits only its active Dagre nodes instead of resetting the camera to global bounds.
- G6 instance setup now resets snapshot, synchronization, readiness, and initial-fit state across React StrictMode remounts. Positive container resize observations can complete a deferred first fit, preventing intermittent blank first opens that recovered only after re-entering the workspace.
- Coordinates exist only in runtime memory. Workspace manifests, browser workspace snapshots, and separate layout-cache JSON never receive positions; obsolete layout-cache storage is removed during startup. Legacy v0.2 positions are validated and discarded during migration.
- Native folder selection now validates referenced documents from file metadata and returns only the manifest and revision. It no longer reads, UTF-8 decodes, retains, serializes, and transfers every document before opening a large project; document sources remain lazy-loaded when opened.
- Opening an external workspace dismisses an active onboarding tour in the same state update that replaces the project, preventing React Joyride from measuring a detached target and raising an unhandled promise rejection.
- Manifest metadata now contains only the shared semantic `title` and `description`. `document.updatedAt` is no longer generated or persisted; v0.1/v0.2 imports discard it so undo and no-op rewrites do not create timestamp-only Git changes.
- Typed-port drag supports concept-to-concept compound creation, premise insertion, and conclusion replacement with source-colored Bezier previews, a temporary `1.0` junction, target halos, cancellation, and edge auto-pan.
- Right-click on a concept remains a graph command: in route mode it toggles the target set, while Ctrl/Cmd-right-click opens the document. The Canvas capture boundary now cancels the WebView's native Reload/Inspect Element menu without stopping G6 event propagation.
- The former two-step toolbar connection was replaced by a right-side derivation form. Premises use route-style fuzzy multi-select, conclusions use fuzzy single-select, and create/edit drafts commit once. Empty tails and self-dependent cycles are supported.
- Shift marquee uses partial overlap, group drag updates every selected node in session memory, and dimmed background nodes/hyperedges are rejected by hit testing, callbacks, drag, connection, and marquee eligibility.
- Element drag and camera pan are mutually exclusive: dragged elements track pointer displacement exactly while unselected elements remain stationary; blank-canvas dragging still pans independently.
- Dimmed background edges remain visible at their existing opacity throughout element drag, edge auto-pan, blank-canvas pan, and zoom; viewport transforms no longer hide edges temporarily.
- Fixed an infinite React effect update when opening concept or derivation focused views. The selection cleanup now preserves its state reference when no IDs are removed, preventing `Maximum update depth exceeded`, sustained WebContent CPU usage, memory growth, and WebKit UI hangs.
- Replacement cards now distinguish source members from aggregate results with permanent Canvas markers. Selected or hovered cards expose one accessible HTML three-state control for `原概念 / 替换概念 / 对照`.
- `对照` is session-only: both canonical sides and all canonical hyperedges with visible endpoints are shown, while passive gray-green dashed arrows fan direct members into one arrowhead at the replacement concept without entering graph topology, route solving, history, autosave, or workspace JSON.
- Replacement is completely excluded from layout input. Entering or leaving compare preserves canonical graph-space coordinates and the exact viewport, emits no Worker request, and only updates projection visibility and the passive Canvas arrow. The earlier Worker-owned detached-cluster experiment was removed.
- Focus and route opacity is now carried as explicit snapshot/base style. This fixes stale G6 dimming after leaving a related view and guarantees that active concept cards remain opaque above dimmed background graphics.
- The graph-model tutorial now has 25 action-first steps: concept drag creation precedes the toolbar form, premise insertion builds `满射, 单射 -> 可逆线性映射`, users create and switch a parallel `线性映射 -> 满射` derivation, and the final premise exercise demonstrates member-specific editing. Completing step 9 waits for its structural relayout to settle and then automatically fits the graph before continuing.
- Completing or exiting the tutorial can replace the entire graph while a Canvas pointer event is still in flight. Snapshot synchronization now plans removals from G6's live model, handles G6's incident-edge cascade deletion, recreates stable edge IDs when endpoints change, and rejects stale pointer targets before reading positions.

## Measured production smoke

The retained three-run 1,000-concept cyclic baseline rendered 1,000 card silhouettes and no overview edges, then materialized three derivation junctions and nine edges for a focused neighborhood. It recorded layout readiness at 3.576 s median, graph readiness at 3.600 s, route-mode opening at 162.7 ms, search plus focus materialization at 385.9 ms, and JavaScript heap at 29.4–31.2 MB, with long tasks at or below 97 ms.

After replacement compare and explicit opacity state landed, a production single-run regression sample recorded graph readiness at 2.901 s, route opening at 130.7 ms, focus at 249.5 ms, heap at 42.1 MB, and maximum long task at 55 ms. After replacement left the layout system, the dedicated 1,000-concept fixture recorded readiness at 2.893 s and four compare materializations at 58.2, 61.5, 65.4, and 69.8 ms, with stable post-GC heap at 35.1 MB and no interaction long task. Every compare asserted an unchanged Worker request count and viewport. The earlier 1.03 s cluster-relayout measurement is retained in the migration plan only as a rejected historical design.

After restoring full global detail, isolated single-run production samples measured 571 concepts as 1,142 visual nodes and 1,713 edges at 4.725 s graph readiness, 964 ms route opening, 1.661 s focus, and 103 MB heap. The 1,682-concept sample rendered 3,364 nodes and 5,046 edges at 8.216 s readiness, 2.065 s route opening, 4.463 s focus, and 269 MB heap. These are intentionally conservative full-detail measurements rather than the earlier concept-only LOD baseline; repeated runs should replace the single-run figures before treating them as stable thresholds. All established functional gates passed.

## Known demo limitations

- Minimap, hover cards, advanced port routing, and long leak-soak coverage are not included.
- Parallel derivations are switched in the inspector rather than through an on-node badge.
- Full keyboard graph traversal and screen-reader graph semantics remain deferred; the toolbar derivation form provides a keyboard-accessible alternative to Canvas port gestures.
- Above 300 concepts, neutral overview labels/IDs/ports and ordinary derivation junctions/edges are hidden to keep Canvas memory and long tasks bounded; search, focus, hover, selection, and route state reveal detail on demand.
- Route solving requires the Tauri application. Browser builds can prepare route selections but do not run the native solver.
- This demo release was built and smoke-tested on macOS; the Windows WebView2 release matrix remains deferred.

## Build artifacts

- `src-tauri/target/release/bundle/macos/Derivon.app`
- `src-tauri/target/release/bundle/dmg/Derivon_0.2.1_aarch64.dmg`

The release process smoke remained alive with an empty error log. The latest production build is approximately 471.04 kB gzip for the initial chunk, 67.51 kB for the layout Worker, and 308.34 kB gzip for the async G6 chunk. Each delta remains below the 15 kB release budget. The post-fix PID-isolated macOS smoke remained alive with empty stderr after twenty seconds; the host sampled at 2.8% CPU and 98.4 MB RSS, and WebContent at 3.2% CPU and 90.3 MB RSS; interactive compare/focus/route acceptance in actual WebKit remains manual because Playwright WebKit is not installed.

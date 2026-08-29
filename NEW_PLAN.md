# Replacement Projection Visual Semantics and Detached View Plan

> Status: implementation updated by the accepted Q1-Q11 renderer-only assist amendment in section 18. Earlier Worker-cluster decisions remain as historical design evidence but are superseded. Actual Tauri WebKit startup/process smoke passed; compare/focus/route interaction remains a manual acceptance step because Playwright WebKit is unavailable. Retain this file until the user confirms overall completion.
>
> This file is additive. `PLAN.md` remains the migration/performance record and must not be deleted.

## 1. Problem statement

Replacement is currently visible primarily through the inspector and a subtle replacement-depth rail on concept cards. That creates two usability failures:

1. A visible concept can participate in replacement without an obvious graph-level signal.
2. A user can mistake a replacement result for an ordinary unrelated concept, or mistake expanded source concepts for the complete unprojected graph.

Replacement must be visible on the graph without restoring persistent card toolbars or making every card visually noisy.

A second requirement extends the existing two-state projection. Users need a temporary detached view that displays both the replacement result and its source concepts. Replacement is not an ontological parent-child relationship: all involved concepts remain peer canonical points. Replacement only provides a convenient view projection for constructing and navigating concepts in layers.

## 2. Current implementation facts

### 2.1 Canonical model

`ViewReplacement` is currently persisted in `derivon.authoring/v0.3.0`:

```ts
type ViewReplacement = {
  points: string[];
  replaceWith: string;
  show: 'points' | 'replacement';
};
```

The canonical graph always retains every point and hyperedge. Replacement changes the visible projection; it does not delete or rewrite canonical graph topology.

### 2.2 Existing two-state projection

- `show: 'points'`: source concepts are visible and the replacement-result concept is hidden.
- `show: 'replacement'`: the replacement-result concept is visible and source concepts are hidden.
- A projected hyperedge is visible only when its head and every tail are visible.
- Replacement relations cannot overlap on the same source point, target themselves, or form cycles.
- Nested replacements are allowed.

### 2.3 Existing graph data

`projectDocument()` already produces `ReplacementControl` records for visible concepts:

- A visible replacement result can expose an action to show its source points.
- A visible source member can expose an action to show its replacement result.
- A visible concept can have both roles in nested replacement structures.

`GraphScene` retains these controls as `replacementControls`, but the current G6 snapshot does not carry enough replacement-role metadata to render role-specific markers or attached controls.

### 2.4 Existing visual cue

Concept cards are fixed `136 x 64` Canvas elements. The left rail currently means replacement projection depth:

- Depth 1: green `#3d725c`.
- Depth greater than 1: red-brown `#9a5647`.

This depth rail does not identify whether the card is a source member or an aggregate replacement result. It must not be overloaded with that second meaning.

## 3. Goals

1. Make replacement participation visible directly on every relevant concept card.
2. Distinguish expanded source members from aggregate replacement results without relying only on color.
3. Keep the normal graph quiet: permanent markers are compact and passive.
4. Provide direct expand/collapse controls only in active context.
5. Support nested replacements without hiding either role.
6. Add a session-only detached view that displays both sides of selected replacement relations.
7. Preserve canonical point and hyperedge semantics.
8. Preserve G6 Canvas as the sole production renderer.
9. Preserve runtime-only coordinates and current Worker layout boundaries.
10. Keep replacement assist graphics out of route solving, derivation hover, history, persistence, and pointer hit testing.

## 4. Non-goals

1. This work does not define cross-layer weight aggregation or cost equivalence.
2. It does not create replacement hyperedges or convert replacement into derivation semantics.
3. It does not add coordinates, detached-view state, or assist geometry to workspace JSON.
4. It does not restore XYFlow, DOM graph nodes, or a renderer fallback.
5. It does not recursively expand all replacement layers by default.
6. It does not create inferred, copied, or migrated canonical derivations when both sides are visible.

## 5. Design tree

```text
Replacement transparency
|
+-- A. What must the graph communicate?
|   +-- A1. Replacement participation
|   +-- A2. Source-member versus aggregate-result role
|   +-- A3. Hidden source count and exact target on demand
|   +-- A4. Nested replacement depth as an independent dimension
|
+-- B. How prominent is the communication?
|   +-- B1. Compact permanent in-card markers
|   +-- B2. Low-detail marker silhouettes at extreme zoom / large overview
|   +-- B3. Active controls only for hovered or selected cards
|   +-- B4. Dimmed cards retain passive cues but no controls
|
+-- C. How does direct manipulation work?
|   +-- C1. Marker remains informational
|   +-- C2. Attached active controls are separate hit targets
|   +-- C3. Control clicks do not also select, drag, focus, or open documents
|   +-- C4. Projection changes preserve viewport and use debounced layout
|
+-- D. How is a detached relation represented?
|   +-- D1. Session-only per-relation override
|   +-- D2. Both canonical concept sides become visible
|   +-- D3. All canonical hyperedges with visible endpoints become visible
|   +-- D4. Passive non-derivation replacement assist graphics identify grouping
|   +-- D5. Nested relations remain independently projected
|   +-- D6. Route and costs remain canonical and unchanged
|
+-- E. Accepted detached-view interaction direction
|   +-- E1. `原概念 / 替换概念 / 对照` vocabulary
|   +-- E2. Attached control opens a compact three-state segmented popover
|   +-- E3. Selecting a persisted side exits compare and commits that side
|   +-- E4. Shared bracket/trunk replacement assist geometry
|   +-- E5. Aggregate result above a horizontally arranged source group
|   +-- E6. Stable selection mapping and visual focus neighborhood
|   +-- E7. Canonical-only route highlighting
|
+-- F. Accepted rendering and layout direction
|   +-- F1. Two fixed top-right marker slots and in-marker aggregate count
|   +-- F2. Canvas trigger with one accessible HTML segmented popover
|   +-- F3. Relation-specific triggers on dual-role cards
|   +-- F4. Orthogonal top/bottom bracket with a retained single-member cap
|   +-- F5. Worker-owned deterministic rigid replacement clusters
|
+-- G. Accepted cluster, interaction, and LOD direction
|   +-- G1. Active trigger and popover use one accessible HTML overlay
|   +-- G2. Nested clusters compose bottom-up as rigid member units
|   +-- G3. Six-card deterministic rows with hierarchical sub-brackets
|   +-- G4. Fixed graph-space gaps and unchanged viewport
|   +-- G5. Manual drag keeps ordinary explicit-selection semantics
|   +-- G6. Control-lock hover precedence and one compound path per relation
|   +-- G7. Runtime compare survives valid undo/redo but clears on workspace load
|   +-- G8. Two replacement-role legend entries and upgraded compare tutorial
|
+-- H. Accepted completion and validation direction
|   +-- H1. Role-grouped inspector with a separate destructive unlink action
|   +-- H2. One eligible active-card overlay and strict mode arbitration
|   +-- H3. Latest-intent Worker cancellation and temporary geometry
|   +-- H4. Pure boundary tests plus Chromium and actual Tauri WebKit validation
|   +-- H5. Incremental 1,000-concept performance gates and three compare fixtures
|   +-- H6. Data/layout/render/interaction/validation implementation order
|
+-- I. Accepted tutorial and rendering-regression closure
    +-- I1. Action-first 25-step graph tutorial with idempotent stages
    +-- I2. Explicit active-member exercises for premise and parallel editing
    +-- I3. Opaque active cards above translucent dimmed cards
    +-- I4. Actual-rendering state cleanup across focus/route transitions
    +-- I5. Regression repair before replacement feature implementation
```

## 6. Accepted decisions: Q1-Q5

### Q1. Required semantic coverage

The graph must prevent all three forms of replacement misreading:

- Not knowing that a card participates in replacement.
- Not knowing whether the visible card is a source member or replacement result.
- Not knowing that concepts are hidden or where the projection can switch.

The information is layered. Permanent markers communicate participation and role. Tooltip and inspector provide exact target IDs, source lists, and counts.

### Q2. Passive marker, active direct control

- Permanent role markers are passive.
- Hovered or selected cards may expose direct replacement controls.
- Inspector controls remain available and are the non-Canvas fallback.

### Q3. Visibility across detail levels

- Replacement state remains visible at normal zoom.
- Extreme zoom and large-graph overview retain low-cost structural marker silhouettes.
- Text, exact IDs, counts, and controls may be limited to active context under LOD.

### Q4. Card boundary

- Permanent markers stay inside the stable `136 x 64` card bounds.
- Active controls may temporarily extend beyond the card.
- External permanent badges are rejected because they complicate ports, marquee bounds, collision geometry, and edge routing.

### Q5. Role and nesting are separate

- Marker shape communicates replacement role.
- The existing left rail continues to communicate projection depth.
- Color must not be the only distinction between source member and aggregate result.

## 7. Accepted decisions: Q6-Q13

### Q6. Role-specific marker grammar

- Expanded source member: an inward/converging bracket or chevron marker.
- Aggregate replacement result: stacked-card silhouette.
- The two roles use different geometry, not one icon with different colors.

Q29-Q35 define the marker and assist geometry contract. Final stroke paths and small optical adjustments are implementation calibration, not an open semantic decision.

### Q7. Aggregate count

- Aggregate results display the number of represented source concepts.
- Counts up to 99 display directly; larger counts may display `99+`.
- Tooltip and inspector retain the exact count.
- Under large-graph LOD, the number may be active-context-only while the stacked silhouette remains permanent.

### Q8. Dual-role nested cards

A visible concept may simultaneously be:

- The aggregate result of its own replacement relation.
- A source member in a parent replacement relation.

Both markers are shown in stable reserved slots. Neither role may silently replace the other.

### Q9. Active control placement

- Hovered or selected cards expose compact attached icon controls above the card near the right side.
- Controls avoid the red left and blue right typed ports.
- Dual-role cards may expose two controls.
- The introduction of a third detached state requires the exact control grammar to be revisited; the placement principle remains accepted.

### Q10. Gesture arbitration

Clicking an attached replacement control performs only the replacement command. It must suppress:

- Card selection.
- Node drag.
- Focus toggling.
- Document opening.
- Connection gesture start.
- Pane click.

### Q11. Tooltip content

- Source member: `可折叠为 X`.
- Aggregate result: `展开为 N 个概念`.
- Exact expression such as `A + B -> X` remains in the inspector.
- Detached-state tooltip wording remains unresolved.

### Q12. Focus, route, dimming, and LOD

- Dimmed cards retain their dimmed passive replacement markers.
- Dimmed cards never expose replacement controls or receive replacement interactions.
- Active context retains full markers, count, tooltip, and controls.
- Above 300 concepts, neutral concept silhouettes retain role marker geometry; detail is materialized for selected, hovered, focus, or route context.

### Q13. Projection transition

- Projection commands preserve viewport.
- Existing selection mapping rules continue to select a visible semantic counterpart when one side becomes hidden.
- Structural projection changes use the existing approximately 120 ms debounced Worker relayout.
- Previous valid geometry remains visible until the new layout result arrives.
- Projection toggles do not auto-fit.

## 8. Accepted decisions: Q14-Q20

### Q14. Detached state is runtime-only

The third state is a personal temporary observation mode:

- It is not written to `workspace.json`.
- It is not written to localStorage or a sidecar file.
- It does not enter canonical history or autosave.
- It is cleared by workspace open/reload.
- The persisted two-state `ViewReplacement.show` remains unchanged and acts as the return state.

The expected runtime representation is conceptually a set of detached replacement target IDs. Exact type and ownership remain an implementation detail to confirm later.

### Q15. Visible canonical topology in detached mode

For each detached replacement relation:

- The replacement-result concept is visible.
- Its source concepts are visible, subject to each nested relation's independent projection state.
- Canonical hyperedges are visible when all their canonical endpoints are visible.
- No derivation is copied, redirected, merged, or synthesized.
- Replacement does not alter hyperedge tails, heads, costs, or documents.

### Q16. Passive replacement assist graphics

Detached mode renders a distinct replacement relation graphic because markers alone are insufficient when both sides are present.

Assist graphics:

- Are renderer/runtime scene data, not canonical graph edges.
- Use a neutral green/gray visual family, separate from blue premises and red conclusions.
- Explicitly use `pointerEvents: 'none'`.
- Never participate in hover hyperedge emphasis, selection, marquee, drag, connection, context menu, or pane hit testing.
- Are not serialized.

### Q17. No derivation-like arrow

Replacement assist graphics use an unarrowed converging bracket/group connector:

- They indicate that the visible concepts belong to one replacement projection group.
- They do not imply derivation, causality, inheritance, containment, or ontology.
- The aggregate card marker and tooltip communicate which card acts as the replacement result.

### Q18. Per-relation detached control

- Each replacement relation independently enters or exits detached mode.
- Opening one relation does not automatically detach all replacements.
- Multiple relations may be detached simultaneously.
- A global `show all layers` command is deferred.

### Q19. Nested projection boundary

Detaching one relation pauses only that relation's visibility projection.

- A source member's own replacement continues to follow its persisted `show` state unless independently detached.
- Parent and child relations do not recursively detach each other.
- Each relation remains a composable projection boundary.

### Q20. Weights and route semantics remain unchanged

Until the weight design branch is opened:

- Canonical hyperedge weights remain authoritative.
- The native route solver receives the same canonical graph and weights.
- Replacement assist graphics have no weight.
- Detached mode changes presentation, runtime scene topology, and layout only.
- It does not merge routes or calculate equivalence between source and replacement concepts.

## 8.1 Accepted decisions: Q21-Q28

### Q21. User-facing three-state vocabulary

The UI labels are:

- `原概念`: show the source-concept projection.
- `替换概念`: show the aggregate replacement result.
- `对照`: temporarily display both sides.

`断开` is rejected as user-facing language because the relation remains valid. `detached` may remain an internal implementation term only.

### Q22. Three-state control

- Activating the attached replacement control opens a compact three-state segmented popover.
- The inspector exposes the same three states as a permanently visible segmented control.
- Cycling an unlabeled icon through three modes is rejected.
- The earlier attached-control placement remains valid, but its behavior is now mode selection rather than a single binary toggle.

### Q23. Leaving compare mode

- Selecting `对照` changes runtime state only.
- Selecting `原概念` or `替换概念` exits compare mode and commits the chosen persisted `show` value through canonical history/autosave.
- The transition is one user command; a separate close-compare step is not required.

### Q24. Shared replacement connector

- Visible source members use short passive branches that converge into one shared bracket/trunk.
- The trunk connects the group to the aggregate-result card without an arrow.
- Independent member-to-result lines and a large enclosing hull are rejected.
- Exact path, dash pattern, junction position, and nested overlap behavior remain unresolved.

### Q25. Detached layout orientation

- The aggregate result is positioned above the visible source group.
- Source concepts are arranged horizontally beneath it around the aggregate's center.
- The vertical arrangement communicates a temporary view layer without imitating the graph's left-to-right derivation flow.
- This is runtime geometry only and does not establish canonical rank, containment, or ontology.

### Q26. Canonical relation edits while detached

- Source membership edits update the detached view immediately.
- If a relation is deleted or becomes invalid, its runtime detached ID is removed automatically.
- No stale relation snapshot is retained.
- Runtime cleanup does not create a history entry.

### Q27. Selection mapping

- Entering compare mode preserves current selection and does not auto-select newly revealed cards.
- Leaving compare mode preserves selected cards that remain visible.
- If a selected card becomes hidden, selection maps to the visible corresponding side using the existing projection-selection rules.
- Projection transitions do not clear unrelated visible selection.

### Q28. Focus and route semantics

- A detached relation acts as a visual neighborhood for focus, keeping its visible source and aggregate cards in active context.
- Replacement assist graphics still do not become canonical graph adjacency.
- Route highlighting remains strictly canonical: only concepts and derivations belonging to the solved route are highlighted.
- A visible replacement counterpart is not inferred to be a route member and may remain dimmed under route precedence.

## 8.2 Accepted decisions: Q29-Q36

### Q29. Fixed marker slots

- Concept cards reserve two fixed `14 x 14` marker slots in the top-right corner.
- Slots are inset approximately 8 px from the top and right card edges.
- Dual-role cards use the slots side by side rather than dynamically recentering them.
- Marker presence must not move labels, identity text, ports, or card bounds.

### Q30. Aggregate count inside the marker

- The aggregate count is rendered inside the front mini-card of the stacked-card marker.
- Count text uses approximately 9 px monospace type.
- Counts above 99 may render as `99+` using the adjacent reserved space.
- The exact source count remains available through tooltip and inspector.

### Q31. Canvas marker and accessible HTML overlay (revised by Q37)

- Permanent role markers remain Canvas graphics.
- The active attached trigger and its three-state segmented popover use one HTML overlay anchored through graph-to-client coordinates.
- At most two relation-specific trigger buttons on one active card and one replacement popover exist at a time.
- The HTML control is a transient interface overlay, not a DOM graph node or renderer fallback.
- Inspector controls remain the stable accessible alternative.

### Q32. Popover lifecycle and keyboard behavior

The popover closes on:

- `Escape`.
- Outside click.
- Canvas pan or zoom start.
- Selection or focus change.
- Relation invalidation.
- Successful state selection.

Closing restores focus to the originating trigger when it still exists. Arrow keys and Home/End move between segments; Enter/Space confirms the current segment. The popover does not remain open and track viewport transforms.

### Q33. Independent controls for dual-role cards

- Each role marker opens the selector for its own replacement relation.
- Parent-member and child-aggregate relations are never merged into one ambiguous menu.
- Each popover identifies the relation target in its accessible name and tooltip.

### Q34. Orthogonal bracket geometry

- The aggregate card connects from bottom center.
- A vertical trunk reaches a shared horizontal bracket.
- Each source member connects from top center through a vertical branch.
- Replacement assist geometry never uses the red left or blue right typed ports.
- Bezier and shortest-line alternatives are rejected.

### Q35. Passive style and one-member relation

- Assist stroke is approximately 1 px neutral gray-green at approximately 55% opacity.
- The baseline dash pattern is `4 4` with no arrow.
- A one-member relation retains a short horizontal bracket cap instead of degenerating into an ordinary straight edge.
- Final color and opacity must be checked against normal, dimmed, selected, and route screenshots.

### Q36. Worker-owned rigid cluster

- Base layout still uses canonical derivation topology.
- Each detached relation becomes a runtime-only rigid layout cluster after base layout.
- The cluster is centered near the side that was visible when compare mode was triggered.
- Its aggregate sits above a horizontal source-member row.
- Cluster-aware rectangle separation runs before the Worker returns positions.
- G6 must not patch node positions after the Worker response.
- Replacement assist records are not passed to Dagre or force as canonical links.
- Layout task input must carry detached-cluster descriptors separately from the canonical document.

## 8.3 Accepted decisions: Q37-Q47

### Q37. Accessible active overlay revises Q31

G6 Canvas shapes are not native DOM focus targets. Therefore:

- Permanent markers remain Canvas-native.
- Hovered or selected card triggers are real HTML icon buttons in a single active overlay.
- Trigger buttons use Lucide icons and expose relation-specific accessible names.
- The segmented popover is HTML and can return focus to its originating button.
- No inactive card receives a DOM control.

### Q38. Bottom-up nested cluster composition

- Detached clusters are composed from deepest replacement depth upward.
- A detached child cluster acts as one rigid member unit inside its parent cluster.
- Parent layout moves the complete child bounding box rather than separating its descendants.
- Independent layout followed by overlap repair is rejected.

### Q39. Deterministic member-row wrapping

- A member row contains at most six concept cards or nested member units.
- Members retain canonical `replacement.points` order.
- Additional rows each receive a local horizontal sub-bracket.
- Row sub-brackets converge into the relation's main trunk.
- Wrapping is based on member count and cluster geometry, not viewport width.

### Q40. Fixed graph-space gaps

Initial geometry targets are:

- Approximately 20 px between source members in one row.
- Approximately 52 px from the aggregate card to the first member row.
- Approximately 44 px between member rows.
- At least 24 px between the detached cluster bounding box and unrelated graph nodes.

Values remain graph-space constants across zoom levels. Screenshot calibration may make small optical adjustments without changing these semantics.

### Q41. Stable viewport and visible-side anchor

- Entering compare mode does not fit or pan the camera.
- The side visible before compare mode remains anchored as closely as collision resolution permits.
- Newly revealed geometry expands above or below that anchor.
- A cluster may initially extend beyond the viewport; layout must not become viewport-dependent to force it onscreen.

### Q42. Ordinary manual drag semantics inside compare mode

- Dragging a replacement member does not implicitly move its relation cluster.
- Existing explicit selection/group-drag rules remain authoritative.
- Assist geometry recomputes from current runtime positions during drag.
- Manual geometry may temporarily stop looking rigid.
- The next full relayout restores deterministic rigid-cluster geometry.

### Q43. Hover and control precedence

State precedence is:

```text
route > focus > replacement control lock > card hover
```

- An open replacement control keeps its origin card visually active.
- Control lock does not expand route/focus active sets or brighten dimmed canonical objects.
- Trigger and popover consume their own pointer events.
- Ordinary eligible card hover continues whole-hyperedge emphasis.
- Replacement assist graphics never receive hover or pointer events.

### Q44. Compound-path LOD

- Each detached relation materializes as one compound assist path, regardless of member count.
- Member branches are path commands, not individual G6 edge elements.
- Permanent card role silhouettes remain visible in large overview.
- Aggregate count, tooltip, attached trigger, and popover are active-context detail.
- Assist semantics are not completely hidden above the 300-concept LOD threshold.

### Q45. Undo, redo, and workspace lifecycle

- Runtime compare state survives undo/redo while the same target-keyed relation remains valid.
- Persisted `show` may change underneath compare mode; leaving compare uses its current value.
- Relation deletion or invalidation removes the runtime target ID.
- A target change is treated as deletion plus creation and is not automatically migrated.
- Workspace open/reload clears all runtime compare state.

### Q46. Replacement legend

The ambiguous `可替换` legend entry is replaced by two entries:

- `替换成员` with the converging member marker.
- `替换结果` with the stacked aggregate marker.

The temporary assist connector does not receive a permanent third legend entry.

### Q47. Replacement tutorial

- The existing graph-tour replacement toggle step becomes a three-state control step.
- The step requires selecting `对照` once and emits a new `replacement-compared` tour action.
- Tutorial text states that compare mode changes visibility without deleting or merging canonical concepts.
- A separate replacement tour is not added.

## 8.4 Accepted decisions: Q48-Q56

### Q48. Role-grouped inspector

- Relations are grouped as `作为替换结果` first and `作为替换成员` second.
- Each relation shows its expression and `原概念 / 替换概念 / 对照` segmented control.
- `解除替换关系` remains a separate icon command and never appears as a fourth view segment.

### Q49. One active-card overlay

- The eligible hovered card owns the overlay first.
- Without eligible hover, the primary `selectedId` owns it.
- Multiple selected cards do not create multiple overlays.
- Drag start closes the popover and hides the overlay; drag end reevaluates eligibility.
- Dimmed cards never receive an overlay.

### Q50. Mode arbitration

- Existing compare state remains visible when route or authoring modes open.
- Route mode, derivation form, and replacement-target creation disable opening or committing replacement view controls.
- Ordinary edit relayout permits a newer replacement request and cancels stale Worker work.
- Cold layout exposes no attached trigger before meaningful geometry exists.

### Q51. Latest-intent cancellation

- A new projection intent applies immediately while an older Worker request is pending.
- The old Worker is terminated and its result rejected by request ID.
- Previous valid geometry remains visible.
- Newly revealed nodes receive temporary positions near the trigger side.
- Requests are not queued serially.

### Q52. Pure test matrix

Pure tests cover:

- All four persisted/runtime projection combinations.
- Independent nested detach and dual-role metadata.
- Invalid runtime ID cleanup.
- Canonical hyperedge visibility with no synthetic topology or weights.
- Deterministic six-column nested clusters, one-member cap, and rectangle non-overlap.
- Focus/route passivity.
- One compound assist path per relation and large-graph LOD.
- Workspace output with no runtime compare fields.

### Q53. Browser and WebKit validation

- Chromium E2E covers Canvas trigger to popover to compare, inspector controls, nested dual roles, undo/redo, reload cleanup, route/focus, drag-updated assist geometry, pan/zoom dismissal, dimmed passivity, and desktop/mobile pixels.
- Actual Tauri WebKit repeats compare/focus/route workflows and monitors console, CPU, and RSS.
- Missing Playwright WebKit does not waive actual Tauri validation.

### Q54. Incremental performance gates

The retained long-term focus target remains 300 ms, but the current 385.9 ms residual is not attributed to this feature.

Feature gates are:

- 1,000-concept graph-ready median at or below 4.1 s.
- Heap at or below 45 MB.
- No new interaction long task above 100 ms.
- Initial gzip delta at or below 15 kB.
- Compare-control feedback at or below 100 ms.
- Compare scene materialization at or below 200 ms before asynchronous full relayout completion.
- Focus no worse than 110% of the retained 385.9 ms baseline, while the 300 ms target remains documented.

### Q55. Performance fixtures

Benchmarks include:

- One six-member detached cluster.
- One wrapped cluster with more than six members.
- Multiple nested and simultaneously detached clusters.
- The unchanged 1,000-concept production baseline.

### Q56. Replacement-workstream internal order

Within the replacement implementation workstream, after the state repair and tutorial work prioritized by Q66:

1. Extend projection/runtime types and pure tests.
2. Extend Worker cluster input, deterministic layout, and layout tests.
3. Extend scene/snapshot, Canvas markers, and passive assist graphics.
4. Add the active HTML overlay and inspector controls.
5. Update the replacement legend and tutorial step.
6. Run replacement E2E, Tauri WebKit checks, and benchmarks.
7. Record evidence in `NEW_PLAN.md`, `PLAN.md`, and `RELEASE_NOTES.md`.
8. Rebuild macOS application and DMG artifacts after all workstreams pass.

## 8.5 Reopened branch: graph tutorial sequence

The current graph tutorial has 21 steps. Confirmed current ordering problems:

- Step 9 immediately points to the toolbar `新建推导` form without first teaching concept-to-concept drag creation.
- Prebuilt parallel derivations are explained before the user creates one.
- Current step 16 adds `子空间` to a prebuilt `线性映射 -> 零空间` parallel group.
- Every `open-graph-example*` preparation currently reloads the same fixture, so user-created staged topology cannot reliably carry into the next step.

Requested action-first sequence:

1. Before the current toolbar-form step, the user creates a derivation by dragging one concept to another.
2. The former step 16 becomes adding `满射` to `单射 -> 可逆线性映射`, producing `满射, 单射 -> 可逆线性映射`.
3. Only after learning premise addition does the user create a second `线性映射 -> 满射` derivation.
4. The tutorial then explains the resulting overlapping/parallel derivation group and where to switch its active member.
5. After understanding active-member selection, the user adds `子空间` to the currently top-ranked member of the prebuilt `线性映射 -> 零空间` group.
6. That final action demonstrates that a premise edit applies only to the active/top member, not every parallel member.

Q57 accepts the coherent fixture change: omit the prebuilt `invertible-bijection` edge initially, use the early concept drag to create `单射 -> 可逆线性映射`, and later add `满射`.

## 8.6 Reopened branch: G6 opacity and state cleanup regressions

User-reported regressions:

1. In a focused/related view, a currently displayed concept card may remain translucent enough to reveal a background card through it.
2. After leaving the related view, previously dimmed cards may remain visually dimmed.

Confirmed source contract:

- Active concepts receive `emphasized: { opacity: 1 }`.
- Dimmed concepts receive `opacity: 0.16`; dimmed edges receive `opacity: 0.08`.
- Concept fill is otherwise opaque `#fafbf9`.
- Runtime state makes `emphasized` and `dimmed` mutually exclusive.

Confirmed reproduction:

- Chromium E2E still passes because it only checks `data-dimmed-nodes`.
- After focus exit, `data-dimmed-nodes` becomes empty while actual Canvas cards and derivations remain visibly dimmed.
- The stale visual state persists after fitting the viewport and waiting.
- Diagnostic screenshots are `/tmp/derivon-focus-opacity.png`, `/tmp/derivon-focus-exited-opacity.png`, and `/tmp/derivon-focus-exit-fit.png`.

The repair contract must validate actual G6 rendering or composed pixels, not only React snapshot attributes. Every non-dimmed concept card must render with fully opaque fill and must occlude graphics behind its card body. Clearing focus/route must restore every previously dimmed node and edge without requiring a remount, workspace reload, or unrelated interaction.

## 8.7 Accepted decisions: Q57-Q66

### Q57. Early concept-to-concept derivation

- The new action step before the toolbar-form introduction asks the user to drag from `单射` to `可逆线性映射`.
- The initial tutorial fixture omits the prebuilt `invertible-bijection` edge.
- The gesture creates the user's own `单射 -> 可逆线性映射` derivation.
- The later premise exercise extends this same relation instead of modifying unrelated fixture data.

### Q58. Idempotent tutorial stages

- Tutorial preparations become stage-aware rather than unconditionally reloading one fixture.
- If the current tutorial workspace satisfies the next stage's prerequisites, the user's real mutations and generated IDs are retained.
- Direct entry, recovery, or invalid state reconstructs the required deterministic stage.
- Recovery helpers identify relations by canonical tails/head and role, not by assuming a generated `h-*` ID.

### Q59. Exact-action auto-advance

Structural action steps auto-advance only after validating their exact canonical result:

- `单射 -> 可逆线性映射` was created.
- `满射` was added to that derivation.
- A second `线性映射 -> 满射` member was created.
- The requested parallel member was selected.
- `子空间` was added to the active zero-space member only.

Generic `derivation-created` or `derivation-updated` events alone are insufficient. Explanatory steps remain manually advanced.

### Q60. User-created surjection parallel group

- The fixture retains the original `surjective-def` relation.
- The user creates a second `线性映射 -> 满射` derivation.
- The newly created member remains active immediately after creation.
- The next step explains the stacked/parallel group.
- The following action requires switching to the original `surjective-def` member in the inspector.
- The learning-cost step then operates on the explicitly active member.

### Q61. Active zero-space member premise edit

- The zero-space stage contains `null-space-def` at lower cost and `null-space-equations` at higher cost.
- `null-space-def` is explicitly active/top-ranked when the exercise begins.
- The user drags `子空间` into that derivation's premise port.
- Only `null-space-def` becomes `线性映射, 子空间 -> 零空间`.
- `null-space-equations` remains `线性映射 -> 零空间`.
- The edit may naturally split the modified member from its former parallel endpoint group.

### Q62. Passive result-confirmation step

- A passive step follows the zero-space premise edit.
- It selects the modified derivation and explains that the other zero-space implementation was not modified.
- Replacement teaching begins only after this active-member boundary is visible.
- With the early drag, user-created parallel exercise, second premise exercise, and confirmation step, the graph tutorial target is 25 steps.

### Q63. Opaque active-card contract

- Every non-dimmed/active concept card body renders with alpha 1.
- Active cards draw above overlapping dimmed cards.
- An active card must fully occlude cards, edges, and labels behind its body.
- Background/dimmed cards may retain the existing approximately 0.16 overall opacity and remain passive.

### Q64. Measured G6 state repair

The implementation must compare two bounded repair strategies:

1. Explicit draw/reconciliation after state batches.
2. Moving opacity into complete snapshot/base style so each update carries an explicit value.

The chosen approach must:

- Recover under rapid and queued transitions.
- Preserve the G6 instance and viewport.
- Avoid graph remount as the normal reset path.
- Record measurements, rejected behavior, and residual risk in the plan documents.

Waiting longer is rejected because stale dimming was reproduced after four seconds.

### Q65. Actual-rendering regression matrix

Regression coverage includes:

- Concept focus enter/exit.
- Derivation focus enter/exit.
- Route enter/exit.
- Switching focus from a previously dimmed card.
- Rapid enter/exit before queued synchronization settles.
- State changes while snapshot updates are queued.
- Active and dimmed cards with overlapping geometry.

Each relevant test checks semantic snapshot state and actual G6/rendered output. Pixel or screenshot assertions confirm opaque occlusion; data attributes alone are insufficient.

### Q66. Implementation priority

After explicit implementation confirmation, work proceeds in this order:

1. Reproduce, measure, repair, and lock G6 opacity/state cleanup.
2. Implement staged action-first tutorial fixtures, actions, sequence, and tests.
3. Implement replacement projection roles, runtime compare mode, Worker clusters, Canvas markers/assist graphics, HTML controls, and inspector changes.
4. Run complete browser, Tauri WebKit, performance, release, and documentation validation.

## 9. Projection-state matrix

The accepted semantics can be summarized as follows:

| Persisted `show` | Runtime detached | Visible relation side | Return state after detach ends |
| --- | --- | --- | --- |
| `points` | no | Source projection only | `points` |
| `replacement` | no | Aggregate result only | `replacement` |
| `points` | yes | Source projection plus aggregate result | `points` |
| `replacement` | yes | Aggregate result plus source projection | `replacement` |

`Runtime detached` is an override of visibility only. It is not a third serialized value in `ViewReplacement.show`.

## 10. Visual state matrix

| Visible card role | Permanent cue | Active-context detail | Direct capability |
| --- | --- | --- | --- |
| Ordinary concept | None | Existing label, ID, ports | Existing card actions |
| Expanded source member | Converging member marker | Tooltip names replacement target | Open three-state relation selector |
| Aggregate result | Stacked-card marker | Represented source count and tooltip | Open three-state relation selector |
| Dual-role nested concept | Both markers in fixed slots | Both tooltips/actions | Open an independent selector for either relation |
| Dimmed replacement concept | Marker dimmed with card | No tooltip/control | None; area behaves as blank canvas |
| Large neutral overview | Marker silhouette | Full details only in active context | Only active context is interactive |

## 11. Renderer-neutral architecture implications

These are consequences of accepted decisions, not permission to implement before explicit user confirmation.

### 11.1 Projection input

Projection needs a runtime override input, conceptually:

```ts
type ProjectionRuntimeView = {
  detachedReplacementIds: ReadonlySet<string>;
};
```

The runtime set must be owned above the renderer. G6 must report typed intents and must not mutate canonical replacement data directly.

### 11.2 Projected concepts

Projected concept metadata must distinguish:

- Replacement source-member roles.
- Aggregate-result roles.
- Represented source count.
- Parent replacement target ID.
- Independent nested depth.
- Whether the corresponding relation is detached.
- Available replacement intents.

A concept can carry multiple roles.

### 11.3 Scene assist elements

GraphScene requires renderer-neutral replacement assist records separate from `SceneEdge` derivation records, or a tagged scene-assist union that cannot be consumed as a canonical edge.

Required properties include:

- Stable runtime ID derived from the replacement target.
- Replacement target ID.
- Visible member IDs.
- Passive interaction eligibility.
- Geometry/layout metadata after the remaining layout branch is resolved.

### 11.4 G6 snapshot

The snapshot must carry:

- Marker roles and aggregate counts into concept-node style/data.
- Active replacement controls only for eligible nodes.
- Detached assist graphics as explicitly passive G6 elements.
- LOD state that can preserve marker silhouettes without materializing all detail.

### 11.5 Command boundary

Two command classes remain separate:

- Persisted projection commands change `ViewReplacement.show` through canonical history/autosave.
- Detached-view commands update session runtime only and produce no workspace mutation.

## 12. Invariants

1. Replacement source and target concepts remain canonical peers.
2. Replacement is not represented as a derivation hyperedge.
3. Replacement assist graphics are never blue/red typed edges.
4. No replacement assist element reaches the route solver.
5. No detached-view state is serialized.
6. No coordinate is serialized.
7. Dimmed passivity remains absolute.
8. Static and assist graphics use `pointerEvents: 'none'`.
9. Opening detached view does not infer or migrate documents, costs, or graph edges.
10. Ending detached view returns to the unchanged persisted `show` state.
11. Workspace reload clears detached relations and manual runtime positions.
12. G6 Canvas remains the only production renderer.

## 13. Explicitly deferred weight branch

The following questions are acknowledged but intentionally unresolved:

- Whether a replacement result cost should summarize source-concept acquisition costs.
- Whether source and result routes are alternatives, refinements, or incomparable paths.
- Whether cross-layer route projection requires admissible cost mappings.
- Whether replacement should carry its own author-provided transformation cost.
- Whether nested replacement costs compose additively, by maximum, or by another algebra.
- How route optimality claims should be stated when multiple replacement layers are visible.

No implementation may silently choose answers to these questions. Until this branch is designed, detached view is presentation-only.

## 14. Shared-understanding contract

The design frontier is empty. The user explicitly confirmed implementation, and the accepted workstreams have been implemented.

The accepted delivery contains three ordered workstreams:

1. **G6 rendering correctness:** non-dimmed cards are opaque and above dimmed cards; focus/route state clearing restores actual Canvas rendering under normal, rapid, and queued transitions without remounting the graph.
2. **Action-first graph tutorial:** a recoverable 25-step staged tutorial teaches concept drag, compound premise addition, user-created parallel derivations, active-member selection, member-specific premise editing, cost, and replacement compare in experiential order.
3. **Replacement compare architecture:** role-specific permanent markers, one accessible active overlay, three view states with runtime-only compare, passive bracket graphics, deterministic nested Worker clusters, strict passivity, LOD, and no weight inference.

Implementation follows the Q66 order, then the full test/performance/release process in Q52-Q56. `NEW_PLAN.md`, `PLAN.md`, and `RELEASE_NOTES.md` retain evidence and rejected experiments. Neither plan file is deleted without explicit completion confirmation.

## 15. Validation direction

The accepted validation contract must cover:

- Pure projection tests for all four persisted/runtime combinations.
- Nested independent detached relations.
- Dual-role concept marker metadata.
- Canonical hyperedges appearing only when all endpoints are visible.
- No synthetic derivations and no weight changes.
- Assist elements excluded from canonical scene edges and route inputs.
- Runtime detached state absent from workspace JSON/localStorage/history.
- Marker and control passivity under focus/route dimming.
- Viewport preservation and cancellable debounced relayout.
- Actual Canvas opacity restoration after concept focus, derivation focus, and route exit, independent of snapshot data attributes.
- Opaque active-card occlusion when active and background cards overlap.
- Rapid focus/route enter-exit and focus-switch sequences while snapshot synchronization is queued.
- Exact 25-step tutorial order, idempotent stage recovery, and endpoint-specific action completion.
- User-created surjection parallel group, explicit member switch, and member-specific zero-space premise edit.
- Canvas screenshots for normal, detached, nested, dual-role, dimmed, and large-LOD states.
- WebKit/Tauri interaction smoke.
- Large-graph memory and long-task checks before accepting assist materialization rules.

## 16. Relevant source boundaries

- `src/domain.ts`: canonical two-state `ViewReplacement` schema.
- `src/replacements.ts`: relation validation and creation.
- `src/projection.ts`: visible point/hyperedge projection and current controls.
- `src/graphScene.ts`: renderer-neutral concepts, derivations, and replacement controls.
- `src/graphSceneRuntime.ts`: selection/focus/route/passivity state.
- `src/g6SceneSnapshot.ts`: G6 materialization and LOD boundary.
- `src/g6Elements.ts`: Canvas concept-card rendering and depth rail.
- `src/G6GraphSurface.tsx`: imperative G6 adapter and custom gestures.
- `src/App.tsx`: canonical commands/history and session runtime ownership.
- `PLAN.md`: renderer migration, performance evidence, and previously accepted interaction contracts.

## 17. Implementation evidence

### 17.1 G6 opacity repair

Baseline reproduction showed `data-dimmed-nodes=""` while actual G6 cards and derivations remained at dimmed opacity after focus exit, including after four seconds and an explicit fit. Screenshots are retained at:

- `/tmp/derivon-focus-opacity.png`
- `/tmp/derivon-focus-exited-opacity.png`
- `/tmp/derivon-focus-exit-fit.png`

A post-state-batch explicit `graph.draw()` was measured first and rejected because the rendered result remained stale. The retained fix carries final node/edge opacity in complete snapshot/base style and reserves G6 states for non-opacity decoration. Actual `graph.getElementRenderStyle()` samples now back E2E assertions. Concept focus, derivation focus, route clear, and dimmed-pane exit restore actual opacity without remounting the graph. Active cards receive opacity 1 and a higher deterministic z-index.

### 17.2 Action-first tutorial

The graph tutorial now contains 25 steps. Its initial fixture omits the prebuilt invertible edge. Endpoint-specific actions validate:

- User-created `单射 -> 可逆线性映射`.
- Added `满射` premise.
- User-created second `线性映射 -> 满射` member.
- Explicit switch to `surjective-def`.
- Added `子空间` only to active `null-space-def`.

Five idempotent fixture stages support direct entry and recovery while preserving real user-generated IDs during normal progression. Unit tests lock the exact sequence and stage topology; browser E2E performs the first concept drag and observes auto-advance to the toolbar-form step.

### 17.3 Replacement compare implementation

Implemented boundaries:

- Canonical `ViewReplacement.show` remains `points | replacement`.
- Session state stores detached target IDs and is omitted from history, autosave, JSON, and reload.
- Projection emits member/aggregate roles and passive replacement-assist descriptors.
- GraphScene and GraphSceneRuntime keep assists separate from canonical derivation edges.
- Concept cards render role markers and aggregate counts in fixed Canvas slots.
- One active HTML overlay provides relation-specific, keyboard-operable three-state controls.
- Each relation renders one passive compound dashed arrow with `pointerEvents: none`; direct members fan into a collector and the sole arrowhead terminates at the replacement card.
- Superseded by section 18: replacement no longer sends runtime cluster descriptors to layout and never changes graph-space positions or viewport.
- Focus may retain a detached relation as visual context; route membership remains strictly canonical.

### 17.4 Validation and performance

Current automated results before final Tauri packaging:

- Frontend unit: 95/95.
- Browser E2E: 25/25 (serial release run).
- App and performance TypeScript checks: passed.
- Production build and `git diff --check`: passed after cleanup.
- Cargo fmt/clippy: passed.
- Desktop and 390 px production compare screenshots: no console/page errors and no horizontal overflow.
- Production bundle: initial 471.04 kB gzip, Worker 67.51 kB, async G6 308.34 kB gzip; all deltas are below 15 kB.
- 1,000-concept production regression sample: ready 2901 ms, route 130.7 ms, focus 249.5 ms, heap 42.1 MB, max long task 55 ms.
- Current 1,000-concept replacement sample: ready 2893.3 ms; compare materialization 58.2/61.5/65.4/69.8 ms; stable heap 35.1 MB; no interaction long task; every compare preserves Worker request count and viewport.
- Historical superseded cluster sample: ready 2866.4 ms; materialization 56.4–66.4 ms; Worker relayout about 1.03 s; stable heap 37.3 MB.

The first two replacement benchmark attempts were invalid fixture runs and are not performance evidence: one used an ID-anchored option locator, and one omitted required workspace files. Both failed before compare measurement; the corrected fixture is retained.

Final macOS artifacts were rebuilt. The latest post-fix PID-differenced release smoke isolated the new WebContent process: after twenty seconds the host was about 98.4 MB RSS and 2.8% CPU, WebContent about 90.3 MB RSS and 3.2% CPU, and stderr remained empty. This validates release startup/process stability, not the manual compare/focus/route gesture sequence.

## 18. Renderer-only replacement assist amendment

The user reopened the replacement-assist branch and accepted Q1-Q11. This section supersedes every earlier requirement that detached compare create, arrange, wrap, anchor, or separate a Worker-owned replacement cluster.

Current contract:

- Replacement view state is projection-only and is absent from layout structure, layout weights, Worker tasks, and layout service payloads.
- Entering or leaving `原概念 / 替换概念 / 对照` does not request layout, change canonical positions, fit, pan, or zoom.
- `DetachedLayoutCluster`, `applyDetachedClusters`, Worker/service cluster fields, and their dedicated layout tests are removed.
- Compare renders one passive gray-green dashed arrow per direct replacement relation. Every direct member exits from its card boundary into a deterministic orthogonal collector; one trunk ends with a simple arrowhead at the replacement concept boundary.
- Nested relations remain independent: `A + B -> C` and `C + D -> X` are rendered separately and never flattened.
- The assist stays below canonical graph elements, has `pointerEvents: none`, updates from runtime positions during node drag, and never becomes a canonical edge or route member.
- Normal opacity is 0.55. Focus retains 0.55 when any direct endpoint is active and otherwise uses 0.14; route mode always uses 0.14.
- Browser acceptance locks unchanged Worker request count, graph-space positions, and viewport across compare. Geometry/snapshot tests lock card-boundary endpoints, nested direct members, runtime position updates, and focus/route opacity.
- The final tutorial restore is a whole-topology transition. G6 synchronization diffs against its live model so node cascade deletion cannot cause a second edge removal; pointer and connection handlers ignore targets no longer present in that model. A dedicated final-step browser regression moves the pointer during restore and asserts no page error or workspace error dialog.
- The graph Canvas prevents the native WebView context menu at capture time while preserving G6 propagation. Route-mode right-click target toggling and Ctrl/Cmd document semantics therefore remain available without exposing Reload/Inspect Element.

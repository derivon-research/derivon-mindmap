# The overview does not track authoring changes live

The overview is for browsing, not a live surface for authoring changes. Creating or
deleting concepts and changing derivation structure happens in object editing or other
detail views; creating an object takes the author to its editor, not to a search for its
dot in the overview. We therefore do not maintain an incremental force simulation to
animate authoring changes: responsiveness and a small rendering interface matter more
than continuity between the old and new topology.

This complements [ADR-0002](0002-authoring-does-not-connect-by-gesture.md) and
[ADR-0003](0003-the-overview-is-not-meant-to-be-readable.md). The rejected alternative
would keep simulation positions and velocities synchronized with every creation and
deletion, despite those operations happening outside the visible overview.

## Consequences

- Label, weight and mark updates to the same topology do not recompute layout. Opening
  an overview with changed topology may compute a new native layout; a continuous visual
  transition from the old graph is not required. Opening another neighbourhood or route
  subgraph likewise does not require incremental layout continuity.
- Changes made while the overview is hidden invalidate the old layout rather than
  triggering a succession of hidden layouts. On return, render the latest accepted graph
  once. An unchanged overview may retain its existing instance, layout and viewport;
  this does not require a separate layout cache or snapshot synchronization layer.
- Hiding a view does not automatically stop its work. Modes own when views are retained,
  invalidated and refreshed; hidden views must not keep computing layouts or animation
  solely to track content changes. Obsolete work must be stopped or its result discarded.
- Deferring visualization does not defer accepting or saving workspace changes and does
  not alter workspace synchronization or its conflict protections.
- Continuous force animation and dragging a node to move its neighbours are optional
  visual enhancements, not requirements of #45. They cannot produce editing events or
  expose coordinates to application state, and must justify their runtime cost before
  being added. No persistent simulation is introduced by this decision.

## Integration Follow-Through

These are constraints for the remaining rewrite tickets, not a claim that their
workflows already exist in the #45 renderer implementation:

- [#47](https://github.com/derivon-research/derivon-mindmap/issues/47): browsing-view
  retention, invalidation and refresh on return, preserving unchanged views without
  doing hidden layout work.
- [#52](https://github.com/derivon-research/derivon-mindmap/issues/52): creation and deletion
  outside the overview, with navigation to the created object's editor rather than
  locating it in the whole graph.
- [#55](https://github.com/derivon-research/derivon-mindmap/issues/55): external file or
  Agent changes can occur while the overview is visible. Specify refresh behavior when
  accepting such changes through workspace synchronization; this case does not justify
  assuming every change is hidden or requiring a live incremental force simulation.

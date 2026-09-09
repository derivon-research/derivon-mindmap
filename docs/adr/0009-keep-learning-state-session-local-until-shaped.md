# Keep learning state session-local until its persisted shape is known

## Status

Accepted.

## Context

Derivon Mindmap will eventually synchronize learner state across devices and personalize
learning content. The exact state shape should be informed by real use before a persistence
schema is chosen. Inventing one now would freeze an untested model or leave a compatibility
burden before the product has learners.

Workspace content and learner state also change on different axes. A graph edit can make a
route obsolete; an object document edit can make an earlier comprehension task stale; a
deleted target must not be silently replaced. Those rules are learning semantics and must
not disappear when a persistence store is added later.

## Decision

For the current local application, learning state stays in the application session. It is
owned by the learning module, not written to the workspace or a companion file, and it is
not mixed into workspace synchronization. The state records the accepted route, cursor,
revealed definitions, task submissions, and the content versions those submissions were
made against. Target and known-concept intent remains application state and is likewise
not persisted in this phase.

Content-aware invalidation is implemented as pure learning-state rules:

- a route is invalidated when its order, cost, route topology, or reachability changes;
- a submitted task is stale when the concept or derivation document it was verified against
  changes, while unrelated submissions remain valid;
- a missing target is reported explicitly and is never removed or replaced automatically;
- an invalidated route blocks the current route view and offers a new preview rather than
  silently continuing the old walk.

The learning module keeps these rules behind a small state boundary so a future cloud store
can serialize and synchronize the same semantics without moving them into workspace content
or the synchronization session.

## Consequences

- Closing or crashing the application still does not recover learning progress; that remains
  an explicit non-goal until the persisted shape is chosen.
- The future store may add cross-device identity, conflict handling, and personalization, but
  it must preserve the content-version semantics above.
- The workspace protocol remains a shared authoring artifact and does not describe a learner.
- Schema upgrade consent is not applicable to `derivon.workspace/v1`: it has no released
  predecessor, and an unknown schema remains a broken workspace rather than an upgrade
  candidate.

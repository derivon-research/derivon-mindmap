# Persist learner records outside the workspace

## Status

Accepted. Supersedes the session-local phase of this ADR's original decision; the shape is
now known ([#92](https://github.com/derivon-research/derivon-mindmap/issues/92), see
[ADR-0012](0012-learning-state-is-mastery.md) for what the state is).

## Context

This ADR originally kept all learning state in the application session until its persisted
shape was informed by real use. That deferral has ended: the shape is worked out, and the
protocols are specified in [learner records](../learner-records.md). What remains is where the
records live and what key identifies them.

Workspace content and learner records change on different axes and have different owners. The
workspace is an artifact several people read and one person edits; a learner record is one
person's judgements about a workspace. A graph edit can make a route obsolete; a document edit
can make an earlier judgement stale. Those rules survive a persistence store, so the store
must not be the workspace.

The obvious key is the filesystem path, and it is the wrong one. Renaming or moving a folder
would lose the record; two folders could carry different graphs but one identity; a copy would
silently split one learner's history in two. Identity has to be stated by the workspace itself.

## Decision

**Learner records persist outside the workspace, in the application data directory, keyed by
the learner and the workspace.** The specification owns the layout text
([learner records](../learner-records.md)); the shape this decision fixes is:

```text
<application data directory>/learner-records/<workspace id>/
├── state.json
└── routes.json
```

- **The purpose-built workspace `id` from `derivon.workspace/v1` is the key.** It is a
  user-chosen, immutable, filesystem-safe path segment, and nothing derives it: a host whose
  only naming step is a directory picker takes the folder's own name and refuses a name the
  rule rejects, rather than folding, truncating or generating one. Its equality is identity:
  the same id in two manifests is the same workspace and the same record, and copying a
  workspace keeps the record rather than forking it.
- **A manifest without an `id` is a broken workspace.** There is no generated fallback, no
  path-derived key and no input dialect. v1 has no released predecessor, so nothing needs
  migrating to the new field.
- **v1 has one local learner.** The record is conceptually keyed by learner *and* workspace;
  with a single learner the workspace id is the whole key on disk. Future multi-learner support
  inserts a segment above the workspace id and changes nothing else.
- **The index from `id` to the last path it was seen at is not part of the records.** It is
  startup state beside the recent-workspaces list; it exists to notice a hand-edited id or the
  same id appearing at a new path and to offer migration, never to drop a record silently. It
  lands with the application-side store ([#99](https://github.com/derivon-research/derivon-mindmap/issues/99)).

**Learner records are application data, not workspace content.** They are not in
`WorkspaceSource`, not referenced from `.derivon/workspace.json` or any companion document, not
part of workspace synchronization, and not part of the workspace `revision`. No workspace commit
can carry one, and no workspace write changes one.

**The artifact is enforced; the writer is not.** The application's own learning actions write
records, and so does the script command surface, which computes the same path and runs with no
client. That is the shape [ADR-0011](0011-change-workspace-content-through-the-script-command-surface.md)
gives workspace content — two write paths, one specification — applied to a second artifact
outside the workspace. Conflicts use the same discipline: a write carries the revision or
`basis` it read and replaces the file atomically, and a losing precondition refuses. This is
compare-and-swap on a file, not a lock and not a cross-file transaction.

**These are decisions about what will exist, not a description of the code as it stands.** The
application-side store, the path computation, the index and the command-surface commands land in
[#99](https://github.com/derivon-research/derivon-mindmap/issues/99) and the tickets that follow
it; until they do, the application still keeps learning state in the session and no learner
record is written anywhere. What is settled here is the key, the placement and the write
discipline, so that the two writers cannot each invent one.

## Consequences

- Closing or crashing the application still does not recover anything that was not written.
  What differs from the session-local phase is the decision that a write path exists, not its
  presence: [#99](https://github.com/derivon-research/derivon-mindmap/issues/99) builds it, and
  until then every learner action still lives and dies with the session.
- Workspace identity is now load-bearing for persistence, so the id validation in
  `src/workspace/manifest.ts` is a protocol rule, not a naming convention. Cross-repository
  content workspaces still owe their manifests an `id`
  ([#98](https://github.com/derivon-research/derivon-mindmap/issues/98)).
- The future store may add cross-device identity, conflict handling and personalization, but
  it must keep the key, the placement outside the workspace, and the content-basis semantics.
- The workspace protocol remains a shared authoring artifact and does not describe a learner.
- Schema upgrade consent is not applicable to `derivon.workspace/v1` or to the record
  protocols: none of them has a released predecessor, and an unknown schema string is a broken
  artifact rather than an upgrade candidate.

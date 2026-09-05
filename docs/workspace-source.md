# WorkspaceSource

`WorkspaceSource` is the application port for workspace content. It reads the authoring graph manifest as exact UTF-8 text, object documents as text, assets as bytes, and optional workspace-level companion metadata as text. Parsing and validating the authoring protocol happen on the application side of the port.

Write access is a separate capability. `WritableWorkspaceSource` adds one operation, `commit`, whose change set has graph, document, asset, and companion-metadata categories. The desktop binding validates and snapshots the whole change set before writing, then attempts to restore touched files if a write fails and reports rollback failures. Keeping the graph as source text lets an unchanged read/commit round trip preserve every byte instead of normalizing JSON formatting.

A commit with `createOnly: true` initializes a workspace: it requires a graph, forbids
removals, and uses exclusive creation for every target. On an observed failure it attempts
to remove only files created by that attempt and reports cleanup failures. A text change
with `createOnly: true` instead requires that individual target to be absent during commit
preparation, protecting new concept documents from overwriting pre-existing orphan files.
That per-file preflight is not protection against an external writer racing the commit.
Neither operation promises cross-process transactions or crash atomicity.

## Host bindings

| Host | Binding | Capability |
| --- | --- | --- |
| web, built-in example | `src/hosts/web/index.ts` | Read only; its data comes only from Vite bundle imports. |
| web, remote | `src/hosts/web/remoteWorkspaceSource.ts` | Type boundary only. No transport, endpoint, account, or credentials are implemented in this phase. |
| desktop, local filesystem | `src/hosts/desktop/index.ts` plus Tauri workspace commands | Read and commit. Filesystem paths exist only in this binding. |

The port lives at `src/ports/WorkspaceSource.ts`, following the v1 module map in `CONTEXT.md`. The web binding implements `WorkspaceSource`, not `WritableWorkspaceSource`, and does not import the desktop binding or browser filesystem APIs. Desktop code must be imported only from its desktop host entry point. The legacy workspace path remains unchanged during this expand phase; later tickets move its callers behind this port.

## Content And Synchronization

The first-concept path in #51 implements the shared boundary from the
[workspace content and synchronization design](workspace-content-sync.md).
`src/workspace/` prepares complete workspace/concept creation changes without host I/O;
`src/synchronization/` owns one effective snapshot, its last persisted snapshot, protected
drafts and the authorized save queue. `WorkspaceSurface` composes that session above both
modes. Learning receives effective content and learner-state callbacks, not a source or
an authoring command capability. Desktop folder selection carries only path/name; content
creation and subsequent saves use this port.

Object text and `.derivon/orientation.json` are acquired together before publishing an
in-memory snapshot. Document read failures remain explicit localized diagnostics; a bad
manifest fails opening. This is an in-memory publication boundary, not an externally atomic
filesystem read. Assets, external observation and revision-aware acquisition remain follow-up
work. Companion configuration is preserved as opaque text here; #58 owns its semantics.

Only changes accepted through desktop authoring write authority may be persisted. A queued
save can finish after switching to learning; learning actions still cannot create workspace
writes. Unfinished drafts are neither previewed nor saved, but they protect their editing
basis from automatic replacement. Automatic saving cannot authorize a schema upgrade that
has not been confirmed by the user.

The current port does not enumerate owned files, observe revisions, or accept a revision
precondition on commit. `WorkspaceSession.reload()` is an explicit, draft-protected reload
entry point; no external watcher invokes it yet. Owned-file deletion and external-update safety require further host
capability design and tests. The existing rollback is not a promise of concurrency safety
or crash atomicity; its precise guarantees must be verified rather than inferred.

## State boundary

Workspace content belongs behind this port. A learner's targets, known concepts, current route position, and progress are application state and must not be added to `WorkspaceSource`, companion metadata, or a workspace commit.

Returning learning records is a separate outbound boundary beside `WorkspaceSource`, not a workspace write. Its payload, lifetime, privacy rules, and local or remote destination are still undecided, so this phase intentionally defines no `LearningRecordSink` interface and no no-op implementation. The boundary should be specified when those decisions are made, without changing `WorkspaceSource`.

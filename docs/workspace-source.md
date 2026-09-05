# WorkspaceSource

`WorkspaceSource` is the application port for workspace content. It reads the authoring graph manifest as exact UTF-8 text, object documents as text, assets as bytes, and optional workspace-level companion metadata as text. Parsing and validating the authoring protocol happen on the application side of the port.

Write access is a separate capability. `WritableWorkspaceSource` adds one operation, `commit`, whose change set has graph, document, asset, and companion-metadata categories. The desktop binding validates and snapshots the whole change set before writing, then attempts to restore touched files if a write fails and reports rollback failures. Keeping the graph as source text lets an unchanged read/commit round trip preserve every byte instead of normalizing JSON formatting.

## Host bindings

| Host | Binding | Capability |
| --- | --- | --- |
| web, built-in example | `src/hosts/web/index.ts` | Read only; its data comes only from Vite bundle imports. |
| web, remote | `src/hosts/web/remoteWorkspaceSource.ts` | Type boundary only. No transport, endpoint, account, or credentials are implemented in this phase. |
| desktop, local filesystem | `src/hosts/desktop/index.ts` plus Tauri workspace commands | Read and commit. Filesystem paths exist only in this binding. |

The port lives at `src/ports/WorkspaceSource.ts`, following the v1 module map in `CONTEXT.md`. The web binding implements `WorkspaceSource`, not `WritableWorkspaceSource`, and does not import the desktop binding or browser filesystem APIs. Desktop code must be imported only from its desktop host entry point. The legacy workspace path remains unchanged during this expand phase; later tickets move its callers behind this port.

## Accepted design, pending implementation

The [workspace content and synchronization design](workspace-content-sync.md) defines the
next use of this port: complete content operations, a mode-independent synchronization
module and consistent read-only previews of effective in-memory content. It does not claim
these capabilities are already implemented by `WorkspaceSource`.

Only changes accepted through desktop authoring write authority may be persisted. A queued
save can finish after switching to learning; learning actions still cannot create workspace
writes. Unfinished drafts are neither previewed nor saved, but they protect their editing
basis from automatic replacement. Automatic saving cannot authorize a schema upgrade that
has not been confirmed by the user.

The current port does not enumerate owned files, observe revisions, or accept a revision
precondition on commit. Owned-file deletion and external-update safety require further host
capability design and tests. The existing rollback is not a promise of concurrency safety
or crash atomicity; its precise guarantees must be verified rather than inferred.

## State boundary

Workspace content belongs behind this port. A learner's targets, known concepts, current route position, and progress are application state and must not be added to `WorkspaceSource`, companion metadata, or a workspace commit.

Returning learning records is a separate outbound boundary beside `WorkspaceSource`, not a workspace write. Its payload, lifetime, privacy rules, and local or remote destination are still undecided, so this phase intentionally defines no `LearningRecordSink` interface and no no-op implementation. The boundary should be specified when those decisions are made, without changing `WorkspaceSource`.

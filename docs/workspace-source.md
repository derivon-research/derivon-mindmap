# WorkspaceSource

`WorkspaceSource` is the application port for workspace content. It reads the authoring graph manifest as exact UTF-8 text, object documents as text, assets as bytes, and optional workspace-level companion metadata as text. Parsing and validating the authoring protocol happen on the application side of the port.

Write access is a separate capability. `WritableWorkspaceSource` adds one operation, `commit`, whose change set has graph, document, asset, and companion-metadata categories. A desktop source also exposes a revision over workspace files, excluding root `.git` metadata. This includes valid document and image paths outside conventional `docs` and `assets` directories. Sorted, length-framed paths and fixed-size file digests make the token deterministic and unambiguous; empty directories do not change it. Unreadable files or directories contribute an access-error/metadata fingerprint so a damaged object document can remain a localized diagnostic, not a workspace-open failure. Such a fingerprint does not claim to verify unreadable bytes. Symlinks are not supported by revision acquisition.

A commit may carry the last accepted revision; the desktop binding validates it after preparation, immediately before writing. Revision-capable hosts return the version predicted from that inspected basis and the complete requested changes, not a post-write observation that could already contain an external update. The binding attempts to restore touched files if a write fails and reports rollback failures. Keeping the graph as source text lets an unchanged read/commit round trip preserve every byte instead of normalizing JSON formatting.

A commit with `createOnly: true` initializes a workspace: it requires a graph, forbids
removals, and uses exclusive creation for every target. On an observed failure it attempts
to remove only files created by that attempt and reports cleanup failures. A text change
with `createOnly: true` instead requires that individual target to be absent during commit
preparation, protecting new concept documents from overwriting pre-existing orphan files.
That per-file preflight and revision comparison are not protection against an uncooperative external writer racing after the final comparison. Neither operation promises cross-process transactions, filesystem CAS, or crash atomicity.

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
manifest fails opening. Revision checks bracket acquisition, with at most three attempts.
This is an in-memory publication boundary, not an externally atomic filesystem read.
Lazy asset reads are checked against that same basis and fail if it changes, rather than
retrying indefinitely or returning new bytes into an old preview. Asset-only external updates
also invalidate preview readers. Companion configuration is preserved as opaque text here;
#58 owns its semantics.

Only changes accepted through desktop authoring write authority may be persisted. A queued
save can finish after switching to learning; learning actions still cannot create workspace
writes. Unfinished drafts are neither previewed nor saved, but they protect their editing
basis from automatic replacement. Automatic saving cannot authorize a schema upgrade that
has not been confirmed by the user.

`WorkspaceSession` polls revisions at application scope. Without protected local work it accepts a stable external content read; with a draft or queued save it retains effective local content and buffers a valid external version. Observation is suspended during local writes, and acquisitions that overlap a write are discarded. A conflict pauses the save queue; if the external writer restores the accepted disk version, automatic saving resumes. Keeping local work means leaving the conflict unresolved; the GUI can explicitly confirm discarding drafts and queued changes to adopt the complete buffered external version. This resets only authoring drafts and rejects delayed commands from discarded editors. There is no automatic merge or partial local overwrite under an external revision.

Immutable web sources do not implement revision observation. Owned-file deletion still requires further host capability design. Real temporary-filesystem tests cover preparation, revision rejection, writes after the final check, partial deletion/write failure and rollback failure. An uncooperative writer can still change files after comparison, during multi-file acquisition, or during rollback; repeated matching hashes are not a filesystem snapshot or CAS. Full-file polling also has cost proportional to workspace size. No crash atomicity or recovery is promised.

## State boundary

Workspace content belongs behind this port. A learner's targets, known concepts, current route position, and progress are application state and must not be added to `WorkspaceSource`, companion metadata, or a workspace commit.

Returning learning records is a separate outbound boundary beside `WorkspaceSource`, not a workspace write. Its payload, lifetime, privacy rules, and local or remote destination are still undecided, so this phase intentionally defines no `LearningRecordSink` interface and no no-op implementation. The boundary should be specified when those decisions are made, without changing `WorkspaceSource`.

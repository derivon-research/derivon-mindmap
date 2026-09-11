# WorkspaceSource

`WorkspaceSource` is the application port for workspace content. It reads the authoring graph manifest as exact UTF-8 text, object documents as text, assets as bytes, and optional workspace-level companion metadata as text. Parsing and validating the authoring protocol happen on the application side of the port.

Write access is a separate capability. `WritableWorkspaceSource` adds `commit`, whose change set has graph, document, asset, and companion-metadata categories, and `listOwnedFiles`, which reports every file stored under one object's owned directory as workspace-relative paths. The inventory exists because deleting an object has to take assets no document mentions with it, which a scan of document text can never find. Ownership is decided by the manifest, not by the shape of the path: the directory must be one some point or hyperedge claims as its own, so `.derivon`, the workspace root, a loose file and an unclaimed directory holding a plausible `document.md` are all refused. It reports nothing outside that directory, refuses a symlink under it rather than following one, and reports an already-absent directory as an empty inventory rather than a failure. Containment of what comes back is verified again on the application side, so a wrong answer refuses a deletion instead of widening it. Deleting an object's files does not remove the directories they were in; an empty directory is not workspace content, contributes nothing to the revision, and is not what ADR-0005 means by a file left behind. A desktop source also exposes a revision over workspace files, excluding root `.git` metadata. This includes valid document and image paths outside conventional `docs` and `assets` directories. Sorted, length-framed paths and fixed-size file digests make the token deterministic and unambiguous; empty directories do not change it. Unreadable files or directories contribute an access-error/metadata fingerprint so a damaged object document can remain a localized diagnostic, not a workspace-open failure. Such a fingerprint does not claim to verify unreadable bytes. Symlinks are not supported by revision acquisition.

A commit may carry the last accepted revision; the desktop binding validates it after preparation, immediately before writing. Revision-capable hosts return the version predicted from that inspected basis and the complete requested changes, not a post-write observation that could already contain an external update. Keeping the graph as source text lets an unchanged read/commit round trip preserve every byte instead of normalizing JSON formatting.

A reader sees a file replacement as one step: the binding writes a temporary sibling in
the target's own directory and renames it over the target, so the manifest — and every document,
asset and companion-metadata file committed with it — is observed either whole and old or whole
and new, never truncated. The temporary file's name carries its target's name plus the process's
own token (its process id and start time) and a counter, so two live writers cannot choose the
same name, and a temporary file a crash left behind cannot block a later replacement. The file is
removed on every failure path and is gone before the commit returns; its survival is reported as
a second failure rather than silently ignored. Nothing temporary outlives the commit for change
detection to read as a sustained external change. Because the target becomes a new file, its
permission bits are carried over while another name hard-linked to the old one keeps the old
contents. On Windows a replacement can be refused where an in-place write would have succeeded,
when another process holds the target open without allowing it to be replaced; the refusal is
reported and the target is left as it was.

The manifest is replaced last, after the documents and other files a commit carries. It is the
manifest that references those documents, so a reader that finds the new graph already finds what
it names, and files a failed commit leaves unreferenced are inert; a manifest published before
its documents would point at files that are not there yet.

Replacement renames a whole file into place rather than streaming into the target, so a failure
while preparing a target leaves that target as it was, and the restoration the binding attempts
covers only the targets the attempt reached. It restores them in reverse order through the same
temporary-file-and-rename replacement, and reports rollback failures. This is not a crash
guarantee: a process that dies mid-commit leaves whatever the filesystem holds, which can include
an executed subset of the changes and an unfinished temporary file. It is not a transaction
against an uncooperative external writer either.

A commit with `createOnly: true` initializes a workspace: it requires a graph, forbids
removals, and creates every target exclusively. Initialization does not replace a previous
version, so there is no previous manifest for a reader to observe; its files are created and
written directly, which means a reader arriving while a workspace is being created can see a
partially written file, and there is no whole version to preserve there. On an observed failure it
attempts to remove only files created by that attempt and reports cleanup failures. A text change
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

Opening acquires only the graph and `.derivon/orientation.json`, with revision checks
bracketing acquisition and at most three attempts. It does not read any object documents.
A bad manifest fails opening; unread document bodies are not silently diagnosed as missing.

Objects persist only `document.md` and assets (ADR-0008). `WorkspaceReader.readDocuments`
acquires explicitly requested Markdown through the source, bracketing the whole batch with
revision checks. Viewing requests one document; a user-triggered full-text search requests
the bodies it needs. There is no startup body prefetch. Loaded resources and local read
failures are cached outside subscribed content, so browsing does not republish graph state.
Accepted edits take precedence over cached disk text; an edit requires a readable acquired
basis. Reloading or adopting an external version invalidates the cache.

Both lazy document and asset reads reject external-version changes rather than mixing new
bytes into a protected preview. Known overlapping local saves may be retried, at most three
times. Cached old text can still serve its accepted basis; unseen old text cannot be recovered
from an externally overwritten file and must fail explicitly. These checks are not an atomic
filesystem snapshot. Asset-only external updates also invalidate preview readers.

Only changes accepted through desktop authoring write authority may be persisted. A queued
save can finish after switching to learning; learning actions still cannot create workspace
writes. Unfinished drafts are neither previewed nor saved, but they protect their editing
basis from automatic replacement. Automatic saving cannot authorize a schema upgrade that
has not been confirmed by the user.

`WorkspaceSession` polls revisions at application scope. Without protected local work it accepts a stable external content read; with a draft or queued save it retains effective local content and buffers a valid external version. Observation is suspended during local writes, and acquisitions that overlap a write are discarded. A conflict pauses the save queue; if the external writer restores the accepted disk version, automatic saving resumes. Keeping local work means leaving the conflict unresolved; the GUI can explicitly confirm discarding drafts and queued changes to adopt the complete buffered external version. This resets only authoring drafts and rejects delayed commands from discarded editors. There is no automatic merge or partial local overwrite under an external revision.

Immutable web sources implement neither revision observation nor the owned-file inventory, and therefore cannot delete. Real temporary-filesystem tests cover preparation, revision rejection, writes after the final check, partial deletion/write failure and rollback failure, including a multi-file object deletion whose rollback also fails: both failures are reported and no revision is returned. They also cover the replacement itself against real files: a reader polling the manifest during a replacement observes only whole versions, a reader arriving between the completed temporary file and the rename still sees the previous manifest, a failure before the rename keeps the previous manifest and removes its temporary file, a commit replaces its documents before the manifest, permission bits survive the replacement, and a commit — successful or failed — leaves no temporary file behind. An uncooperative writer can still change files after comparison, during multi-file acquisition, or during rollback; repeated matching hashes are not a filesystem snapshot or CAS. Full-file polling also has cost proportional to workspace size. No crash atomicity or recovery is promised.

## State boundary

Workspace content belongs behind this port. A learner's targets and solve results are
application state and must not be added to `WorkspaceSource`, companion metadata, or a
workspace commit.

Learner records — mastery (`derivon.learning/v1`) and confirmed routes (`derivon.routes/v1`) —
are neither workspace content nor a separate outbound interface. They are files in the
application data directory, keyed by the workspace `id`, written by the application and by the
script command surface from one shared specification. Because they are not workspace content,
`WorkspaceSource` exposes no storage location for them, a workspace commit can never carry one,
and they are absent from workspace synchronization and from the workspace `revision`. See
[learner records](learner-records.md),
[ADR-0009](adr/0009-persist-learner-records-outside-the-workspace.md) and
[ADR-0012](adr/0012-learning-state-is-mastery.md).

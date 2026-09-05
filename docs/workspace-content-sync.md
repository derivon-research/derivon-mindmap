# Workspace content and synchronization

Status: accepted design from the C3 architecture discussion; #51 implements the first-concept
content operation and shared session boundary described below. The remaining cases and port
capabilities are still planned unless explicitly identified as delivered. This design introduces
no on-disk protocol change.

Domain terms are defined in [CONTEXT.md](../CONTEXT.md). The load-bearing decisions are
[mode-independent synchronization](adr/0004-synchronize-workspace-content-independently-of-modes.md)
and [deletion with owned documents](adr/0005-delete-owned-documents-with-their-objects.md).
The [current WorkspaceSource contract](workspace-source.md) remains the description of
implemented port behaviour.

## Delivered In #51

- `src/workspace/index.ts`: complete empty-workspace and first-concept creation, ID and owned
  directory allocation, blank Markdown/HTML documents, reference validation and local diagnostics.
  Legacy replacement fields stay in source text at the boundary and survive graph updates.
- `src/synchronization/index.ts`: a workspace session with separate effective/persisted snapshots,
  a read-only subscription, desktop-authoring commands, serialized automatic saves, draft
  protection and explicit protected reload. Saving is independent of subscriber/mode visibility.
- The desktop launch frame selects a folder and initializes through `WorkspaceSource.commit`.
  Existing manifests and files are not overwritten by initialization. New document changes
  require absent targets during commit preparation. Existing-workspace creation collisions are
  reported without advancing persisted content.
- Both modes consume the same effective graph and object text. Optional orientation configuration
  remains opaque text in that snapshot, with interpretation/editing owned by #58. No preview reads
  newer disk files independently. External consistency during acquisition still belongs to #55.
- The GUI offers metadata-only concept creation and the approved prototype C workbench:
  relations on the left, object/graph views in the centre, and an independent Agent pane.
  A follow-up restores the existing v0.4 Tiptap editor through `updateObjectDocument` and the
  shared session. Markdown source/rendered HTML and newly staged images form one accepted
  change set; HTML documents edit their existing entry. Missing sources remain explicit errors.
  Graph editing and real Agent integration remain separate. The Agent pane is explicitly
  simulated and never executes a plan. The throwaway prototype remains separate.
- Search uses a MiniSearch index in a dedicated Worker. It indexes source documents, not
  generated HTML duplicates, and keeps query state below the workbench. Document drafts and
  staged images stay in the authoring mode until applied; changing views is not an acceptance.
- Both modes resolve accepted image bytes through the session reader before reading an existing
  source asset. Lazy source assets are cached separately from subscribed content; reading an image
  does not publish a new graph/document snapshot. Sandboxed previews embed image data, because
  an opaque-origin frame cannot read a parent-origin blob URL.

The session retains failures and supports an explicit retry; the GUI shows save/draft status,
warns before its close-workspace command or browser unload, and offers retry. Native window-close
protection, external watching/conflict resolution, schema-upgrade consent and complete failure
integration remain #55 work. Older schemas open read-only until upgrade consent is implemented.
No atomic read/CAS/crash-recovery guarantee is implied by the current port.

The restored editor is not completion of #53. Document updates validate the owning source
and supplied managed-image names/bytes, but do not prove existence of every manually typed
Markdown/HTML link or image path. Renderers show unavailable images locally. Complete body
reference integrity, inventory and repair remain #53/#55 work; no complete reference index
or arbitrary-file existence guarantee is claimed.

## Module responsibilities

| Module | Interface responsibility | Does not own |
| --- | --- | --- |
| Content module, under `src/workspace/` | Accept a complete editing intent; validate it and return effective content, a complete change set and affected references or diagnostics | Host I/O, timers, UI state, save scheduling |
| Workspace synchronization module, composed at application scope | Coordinate effective in-memory content, consistent read-only preview, automatic save/load, draft protection, conflicts and failures | Form rules, route solving, learning progress |
| Authoring mode | Present editing controls, protect unfinished drafts, submit content intents through the shared workflow and resolve user decisions | Its own file-writing queue or external-change detector |
| Learning mode | Read effective content, retain learner intent and records, invalidate affected routes after content changes | Workspace writes or synchronization policy |
| Host adapter behind `WorkspaceSource` | Carry out the authorized reads and writes using host capabilities | Product editing intent or mode-specific state |

The content module hides ID and document-directory allocation, templates, graph changes,
reference impact and validation behind complete operations. Callers do not build a concept
by independently creating its manifest entry and its document files. This depth provides
leverage across #51, #52, #53 and #58, and locality for content invariants.

The synchronization module has its own testable interface; it is not a collection of effects
copied into each mode or a larger `App.tsx`. Its exact file placement and method shapes are
implementation design work, not settled by this document. The application owns its lifecycle,
not its implementation details. Direct host I/O stays behind the host adapter, and the pure
content module must not acquire host imports.

## Three content states

1. **Editing draft:** unfinished or not yet accepted form/editor input. Not automatically
   saved and not visible in a learning preview. Still local work requiring protection.
2. **Effective in-memory content:** accepted changes and loaded content available consistently
   to both modes. May contain accepted authoring changes that have not yet reached disk.
3. **Persisted content:** the last content known to have been saved or loaded successfully.
   A failed save must not be reported as this state advancing.

A valid graph can be unfinished as teaching material or have an unreachable target. Empty
premises, cycles and parallel derivations are not draft errors. A derivation without a head
or with nonexistent graph references cannot become an accepted content change.

"Effective" does not mean every object document is healthy. A structurally valid graph may
remain available with explicit, localized document diagnostics. The editor must not silently
replace a missing document with an empty one or reinterpret invalid manifest structure as a
valid partial graph.

## Accepted behaviour and test surface

Each row is an observable behaviour to test through the owning module's interface. These
are acceptance cases to implement, not claims about existing test coverage.

| Case | Required result | Main owners |
| --- | --- | --- |
| C3-01: create concept or derivation | One complete accepted operation prepares graph content, owned document files and valid references; the caller does not assemble pieces | #51, #52 |
| C3-02: incomplete edit | Keep it in the form/editor draft; it cannot reach effective content, preview or automatic save | #51, #52, #53, #58 |
| C3-03: missing/damaged object document | Permit browsing of valid graph structure; report the affected document failure and allow repair without an implicit empty-file replacement | #51, #53 |
| C3-04: edit unrelated to existing damage | Allow a change that does not introduce or worsen damage; retain existing diagnostics and validate the operation's affected references | #51, #52, #53 |
| C3-05: delete object | Include its owned documents and assets in the deletion, including documents owned by derivations removed with a concept; preserve unrelated files | #52, #53 |
| C3-06: deletion has incoming references | Block direct deletion; allow GUI repair or an explicitly confirmed complete repair/deletion plan; never silently strip links or images | #52, #53, #58 |
| C3-07: authoring to learning | Preview one consistent effective version of graph, documents and orientation configuration without waiting for or triggering a save | #51, #53, #58 |
| C3-08: switch modes with a queued save | Continue an already authorized authoring save; learning navigation, targets, known concepts and progress produce no workspace writes | #51, #55 |
| C3-09: external update | Automatically load valid updates when no local edits require protection; otherwise preserve local work and external content and require resolution, without automatic merging | #55 |
| C3-10: save failure | Retain effective content; allow editing and preview, show unsaved/error status, offer retry and warn before closing the workspace | #55 |
| C3-11: update affects learning | Publish content changes; learning retains intent/records but invalidates affected routes, stops unlocking through stale results and reports deleted targets rather than replacing them | #55 integration with #47, #48, #49 |
| C3-12: document changed after completion | Report the change; do not treat earlier completion as verification of the new content or clear unrelated progress | #53, #55 integration with #48 |
| C3-13: external update with draft but no queued save | Protect the draft's editing basis instead of automatically replacing it; draft remains unsaved until accepted | #51, #53, #55, #58 |

A content change must not mix the new graph with documents or configuration from an older
preview. This is a consistency requirement, not an instruction to eagerly load every asset
on startup. Acquisition, caching and version checks remain implementation work.

Deletion must fail safely if required reference analysis cannot be completed. C3-04 permits
unrelated changes; it does not permit treating unreadable documents as having no references.
Owned directories are not necessarily reference-isolated. No recursive delete of arbitrary
workspace paths, external linked resources, or another object's assets is authorized.

Automatic save and load are shared workspace behaviour, not responsibilities that restart
on a mode switch. Write authority follows accepted desktop authoring changes. Read-only web
and learning usage cannot create writes. Schema upgrades still need explicit desktop-authoring
confirmation under #55; automatic saving does not bypass that consent.

## Capability gaps to resolve

The current TypeScript port reads individual paths and submits path-based changes. It has no
file inventory, revision precondition on commit, or change observation operation. The desktop
implementation prepares previous file contents and attempts rollback on a write failure;
that is not a concurrency or crash-atomicity guarantee.

| Gap | Required investigation and verification | Delivery responsibility |
| --- | --- | --- |
| Owned-file inventory | Enumerate documents and assets, including unused files; validate ownership, path containment and shared references before deletion | #52 with #53; host capability needed before C3-05 can pass |
| Consistent reads | Establish how graph, documents and configuration refer to one accepted content version, including externally changing files and lazy reads | #51 establishes the shared content model; #55 verifies external-update handling |
| External-write protection | Define observation and commit-time validation, then test a change occurring between inspection and write; a UI preflight check alone is insufficient | #55, using the same synchronization interface introduced by #51 |
| Failure guarantees | Test partial write failures and rollback failures without claiming success; state the limit for process crashes and uncooperative external writers | #55 with host-adapter tests; #52 exercises multi-file deletion |

Do not promise a compare-and-swap property for arbitrary filesystem writers merely by adding
a revision parameter. The achievable guarantee, interaction with external tools, and remaining
race windows need evidence before these acceptance cases can be marked complete. Native
filesystem capabilities remain a host concern, not a dependency of the content module.

## Delivery map

- **#51:** introduce the complete first-concept operation and the shared synchronization
  lifecycle, including effective read-only preview and the distinction between drafts and
  accepted content. It owns the common interface that later tickets extend, not a temporary
  mode-local save loop.
- **#52:** reuse complete operations for graph edits and implement deletion as a managed
  content operation. File inventory is a prerequisite for its deletion acceptance, not an
  optional cleanup after graph deletion.
- **#53:** route document, image and cross-document-reference changes through the same content
  and synchronization model; provide local document diagnostics and the GUI reference-repair
  path required by deletion.
- **#55:** complete and test external observation, conflict handling, write validation, failures
  and retry through that common synchronization interface. Preserve its separate crash-log
  and schema-confirmation requirements.
- **#58:** use complete configuration operations and the same effective content for previews;
  include configuration references in deletion impact and draft protection.

The existing ticket graph is not reordered by this document. Capability and integration
requirements above must be accounted for when scheduling these tickets; a prerequisite not
yet available is not grounds to mark its dependent acceptance case complete. Learning-state
reconciliation is owned by learning under #47/#48/#49, with #55 carrying the integration
acceptance so it is not silently assigned to the synchronization implementation.

## Verification strategy

- Test complete content operations through the content interface using graph/document/asset
  fixtures, including partial damage and incoming references. This computation needs no host
  adapter. Keep compatibility fixtures and protocol invariants; replace superseded helper
  tests only after their observable behaviour is covered at the new interface.
- Test synchronization through the same interface used by modes, with controlled time and
  an in-memory adapter capable of changing externally and injecting failures. Test no-op
  learning activity as well as authoring updates, mode switches, drafts and failures.
- Test the desktop adapter against temporary filesystem fixtures for actual containment,
  enumeration, deletion and failure behaviour. An in-memory adapter does not prove filesystem
  concurrency properties.
- Add focused mode-level tests for consistent preview, reference repair and stale learning
  results. Do not use a full application test as the sole verification of content invariants.

Implementation choices remain open where evidence is needed. No method list, generic
transaction framework, reference-index implementation, new on-disk metadata or recovery
journal is mandated here. The interface is the test surface; the agreed behaviour, not the
number or names of internal files, is what must survive refactoring.

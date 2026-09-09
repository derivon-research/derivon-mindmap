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
  directory allocation, blank Markdown documents, reference validation and local diagnostics.
  Legacy replacement fields stay in source text at the boundary and survive graph updates.
- `src/synchronization/index.ts`: a workspace session with separate effective/persisted snapshots,
  a read-only subscription, desktop-authoring commands, serialized automatic saves, draft
  protection and explicit protected reload. Saving is independent of subscriber/mode visibility.
- The desktop launch frame selects a folder and initializes through `WorkspaceSource.commit`.
  Existing manifests and files are not overwritten by initialization. New document changes
  require absent targets during commit preparation. Existing-workspace creation collisions are
  reported without advancing persisted content.
- Both modes consume the same effective graph and request object text from the shared session on demand. Optional orientation configuration
  remains opaque text in that snapshot, with interpretation/editing owned by #58. No preview reads
  newer disk files independently. External consistency during acquisition still belongs to #55.
- The GUI offers metadata-only concept creation and the approved prototype C workbench:
  relations on the left, object/graph views in the centre, and an independent Agent pane.
  It opens directly in the overview; [workbench navigation](authoring-workbench.md) specifies
  overview selection, neighbourhood selection and opening the selected object's editor.
  A follow-up restores the existing v0.4 Tiptap editor through `updateObjectDocument` and the
  shared session. Markdown source and newly staged images form one accepted change set;
  HTML is rendered only for viewing and never saved. Missing sources remain explicit errors.
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
warns before its close-workspace command or browser unload, and offers retry. PR #72 adds native
window-close protection, revision observation and explicit conflict discard, checked lazy assets,
and file-system failure tests through the same session and port. It clears old diagnostic logs
at actual frontend/native startup. Unchanged hidden graphs retain their viewport; hidden topology
changes invalidate the renderer until return. These additions do not complete #55: schema-upgrade
consent and learning-state integration remain open. Older schemas still open read-only.
No atomic read/CAS/crash-recovery guarantee is implied by the current port.

The restored editor is not completion of #53. Document updates validate the owning source
and supplied managed-image names/bytes, but do not prove existence of every manually typed
Markdown/HTML link or image path. Renderers show unavailable images locally. Complete body
reference integrity, inventory and repair remain #53/#55 work; no complete reference index
or arbitrary-file existence guarantee is claimed.

## Delivered In #57 And #58

- `src/workspace/manifest.ts` owns `derivon.workspace/v1`, and owns nothing else. v1.0.0 has
  no released predecessor, so there is no dialect to read, nothing to migrate and no upgrade
  to consent to: an unknown schema string, or a manifest still carrying `view`, is a broken
  workspace that is reported as one.
- `src/workspace/orientation.ts` owns the `derivon.orientation/v1` companion document:
  structure, validation against the graph, canonical text, and the concept-reference
  inventory a deletion plan needs. Configuration carrying an error never becomes effective
  orientation.
- Complete content operations now cover concept tags, the workspace tag registry and the
  orientation configuration, all through the same session and commit path. Writing the
  companion document does not touch the manifest.
- Orientation editing stays in an authoring draft until accepted, so an unfinished question
  enters neither effective content nor the autosave queue while remaining protected against
  external updates. See [orientation](orientation.md).
- Deletion impact for configuration references is available as `orientationConceptImpact`
  plus an executable repair; the unified deletion plan and its GUI remain #52.

## Delivered In #71

- `src/workspace/references.ts` owns the supported reference syntax and what may be claimed
  about it. Markdown inline links and images, Markdown link reference definitions, and
  literal `href`/`src` on `<a>`, `<img>`, `<source>`, `<video>` and `<audio>` are read;
  code spans, fenced code and HTML comments are text. A script element, a templated
  attribute or a destination outside that grammar is reported as an uncertainty, never as
  an absent reference. Existence is only asserted where effective content proves it: an
  object document through the manifest, image bytes through accepted assets. A workspace
  path that is neither is `unknown`, not dangling. Path resolution for links and images is
  now this one function.
- `updateObjectDocument` refuses the broken references a change introduces, and only those.
  Damage already in the body stays reported and does not veto an unrelated legal edit.
- `src/workspace/integrity.ts` owns deletion scope (ADR-0005: the derivations that go with
  a concept), the cross-document link, shared-image and orientation impact of a deletion,
  and the repair operations. `referenceImpact` reports unread, unreadable and uncertain
  sources and marks itself incomplete, so #52 cannot read an unreadable source as proof
  that nothing points at the object being deleted.
- Repairs are named decisions: `retarget`, `unlink` and `remove`. A repair whose reference
  is no longer where the plan says it is is refused rather than applied elsewhere, and an
  image is never silently dropped by a link repair. `restoreObjectDocument` gives a missing
  document a body only on request, and only overwrites an unreadable one as its own
  confirmed decision; opening and saving never fill a document in.
- `AuthoringCommands` gains `repairReferences`, `restoreDocument` and `referenceImpact`.
  Analysis acquires every owned body through the shared reader first; repairs travel the
  same accept/preview/autosave queue as any other content change, with no second writer.
- The authoring GUI carries both entries: a damaged object document keeps the graph
  browsable and offers a confirmed repair, and the object page reports what the document
  points at, what points at it, and what could not be analysed. This is the repair path
  #52's deletion requires; the deletion command and its own dialogue remain #52.
- C3-03 and C3-04 are covered for object documents; C3-06 has its analysis and repair, and
  is completed by #52's deletion. No owned-file inventory is added: the impact reports what
  the manifest owns, so a file no document mentions is still #52's host capability gap.

## Delivered In #52

- `WritableWorkspaceSource.listOwnedFiles` closes the owned-file inventory gap, which was the
  last capability standing between C3-05 and passing: the desktop binding walks one object
  directory and reports every file under it, including assets no document mentions. Ownership
  comes from the manifest, so it is not a recursive listing of arbitrary workspace paths, and
  what it returns is checked for containment again by the content operation.
- `deleteObjects` in `src/workspace/integrity.ts` is the complete deletion: graph entries,
  every owned file, and the reference repairs the author confirmed, as one change on one
  commit. There is no graph-only deletion and no orphan-file cleanup afterwards (ADR-0005).
  It refuses an inventory that reaches outside a removed directory, an inventory that does
  not cover every directory the plan removes, and a plan naming an object the graph does not
  have.
- `deletionBlockers` is the single statement of why a deletion may not proceed: an unread,
  unreadable or uncertain reference source, a remaining incoming reference, or a remaining
  orientation reference. The content operation refuses on it, and the GUI asks the same
  question of the impact its planned repairs would leave behind, so what an author reads and
  what the deletion enforces cannot drift apart. Safety is therefore judged on the content the
  repairs produce, not the content the author started from. `orientationWithoutConcepts` makes
  the configuration repair executable, and it only runs when the plan says so; an action left
  naming no concept goes with it, because a configuration carrying one could not be accepted
  at all. Its option and question stay, and the orientation view is where their emptiness is
  dealt with.
- `AuthoringCommands` replaces `referenceImpact` with `deletionPreview`, which answers what a
  deletion would break *and* what it would take with it, and gains `deleteObjects`. Both
  acquire every owned body through the shared reader and the inventory through the port
  before deciding anything; the deletion re-acquires rather than trusting the preview the
  author has been reading.
- The authoring GUI carries the plan as a dialogue opened from the object's title row, in
  the same frame as creation. Repairs are chosen into the plan rather than applied on the
  spot, and the deletion stays refused until every one of them is decided. See
  [authoring workbench](authoring-workbench.md).
- Desktop tests on a real temporary filesystem cover the inventory, its refusals, a
  multi-file deletion whose rollback succeeds, and one whose rollback also fails; neither is
  reported as success. C3-05 and C3-06 are covered. Deletion still inherits the port's
  limits: no cross-process transaction, no CAS and no crash atomicity.

## Markdown-Only, On-Demand Documents

[ADR-0008](adr/0008-persist-markdown-not-rendered-pages.md) supersedes the dual-file
acquisition and persistence assumed by the early #51 implementation. Opening publishes graph
and companion metadata only. Unread Markdown is absent from `content.documents`, not an
error. The shared reader acquires requested bodies with revision checks, caches them without
publishing a new content snapshot, and supplies an acquired basis to document editing.
Accepted Markdown remains effective before saving; views render it on demand. There is no
startup body prefetch or generated-page requirement. Full-text indexing reads bodies only
when a user submits a nonempty search query. Existing unowned files are not removed.

## Module responsibilities

| Module | Interface responsibility | Does not own |
| --- | --- | --- |
| Content module, under `src/workspace/` | Accept a complete editing intent; validate it and return effective content, a complete change set and affected references or diagnostics | Host I/O, timers, UI state, save scheduling |
| Workspace synchronization module, composed at application scope | Coordinate effective in-memory content, consistent read-only preview, automatic save/load, draft protection, conflicts and failures | Form rules, route solving, learning progress |
| Authoring mode | Present editing controls, protect unfinished drafts, submit content intents through the shared workflow and resolve user decisions | Its own file-writing queue or external-change detector |
| Learning mode | Read effective content, retain learner intent and records, invalidate affected routes after content changes | Workspace writes or synchronization policy |
| Host adapter behind `WorkspaceSource` | Carry out the authorized reads and writes using host capabilities | Product editing intent or mode-specific state |

Learning progress remains application/session state. Route acceptance records the graph text
it was confirmed against; a later effective graph change un-confirms the route and returns a
visible route walk to the preview. Targets, known concepts, revealed definitions and task
records are retained rather than rewritten into workspace content.

A comprehension-task record carries the graph basis, route order, generated task, and the basis
of both the derivation and definition documents it verified. When a document changes, only
that task is treated as unverified; the learner is returned to the earliest stale step, while
unrelated completions remain marked. Unread documents are checked through the shared reader,
so an external body update is not accepted just because the manifest is unchanged.

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

The current TypeScript port reads individual paths and submits path-based changes. PR #72 added
revision observation and commit preconditions; #52 added the owned-file inventory. The desktop
implementation prepares previous file contents and attempts rollback on a write failure;
that is not a concurrency or crash-atomicity guarantee. See the current
[WorkspaceSource contract](workspace-source.md) for observation limits and delivered tests.

| Gap | Required investigation and verification | Delivery responsibility |
| --- | --- | --- |
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

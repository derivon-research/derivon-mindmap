# Learner records

Status: specified by [#92](https://github.com/derivon-research/derivon-mindmap/issues/92).
The application-side storage landed in [#99](https://github.com/derivon-research/derivon-mindmap/issues/99);
confirming a route, showing the confirmed ones and deleting one landed in
[#100](https://github.com/derivon-research/derivon-mindmap/issues/100). Self-report landed in
[#101](https://github.com/derivon-research/derivon-mindmap/issues/101): both entrances write a
`complete` record with `data.selfReported: true`, and the known set is derived from mastery rather
than stored. Judgement records and mastery-derived route progress landed in
[#102](https://github.com/derivon-research/derivon-mindmap/issues/102): handing in a step's
verification writes a `complete` judgement about that step's conclusion concept, and the walk is
placed by reading the records back. **`incomplete` is specified, writable and displayed, and the
application has no action that writes it yet** — how mastery is evidenced is still being
explored, and inventing a button for it now would decide that exploration by accident. The script
command surface landed in `derivon-research/skills#6`: `read-learner-record` and
`write-learner-record` compute the application data directory path themselves from the workspace
`id`, and read or replace one record file with no client running. Personal routes — one file
per route, replacing the single `routes.json` — are specified by
[#153](https://github.com/derivon-research/derivon-mindmap/issues/153).
Domain terms are defined in [GLOSSARY.md](../GLOSSARY.md); the decisions are
[ADR-0009](adr/0009-persist-learner-records-outside-the-workspace.md) (where they live) and
[ADR-0012](adr/0012-learning-state-is-mastery.md) (what they are).

A learner record is everything the application remembers about one learner in one workspace
that is not workspace content. It answers two different questions, in two kinds of file:

- `state.json`, protocol `derivon.learning/v1` — **mastery**: for each concept and each
  derivation, has this learner reached it?
- `routes/<route id>.json`, protocol `derivon.route/v1` — **personal routes**: one file per
  route this learner confirmed, copied or built, each saved against the graph it names.

Every file is written beside the others but read and replaced independently. Deleting one
leaves the rest complete and readable.

Every file is read the same way: a `schema` string that is not the file's own is an unreadable
file, and a key the protocol does not define — at the top level, inside a record, or inside a
route — is reported rather than ignored. Free-form state belongs in a record's `data`,
namespaced by its writer.

## Where they live

```text
<application data directory>/
└── learner-records/
    └── <workspace id>/
        ├── state.json
        └── routes/
            └── <route id>.json
```

`<application data directory>` is the application's data directory — the Tauri app-data
directory, not the user-level config root `~/.derivon/` that holds `models.json` and
`auth.json`. On macOS that is `~/Library/Application Support/<bundle-id>/`; on Linux
`$XDG_DATA_HOME/<bundle-id>/` or `~/.local/share/<bundle-id>/`; on Windows
`%APPDATA%\<bundle-id>\`. This is the one layout the application and the script command
surface both compute; neither derives a second one.

Rules the layout depends on:

1. **The key is the learner and the workspace, never the folder.** The record is identified by
   *who* is learning and *which* workspace they are learning in. v1 has exactly one local
   learner, so the workspace id is the whole key on disk and the learner dimension contributes
   no segment yet; adding a second learner inserts a segment above `<workspace id>` and changes
   no other part of the layout.
2. **The key is the workspace `id` from the manifest.** Copy a workspace folder and the copy
   shares the record — same id, same identity. Two workspaces must not share an id. The id's
   own rule (alphabet, length, immutability) is the workspace protocol's, in the README's
   工作区格式; this document only fixes that it is the key.
3. **A workspace with no `id` is a broken workspace.** It never reaches this directory, so
   there is no fallback branch and no path-derived key.
4. **Any index from `id` to the last path it was seen at is application startup state**, kept
   with the existing recent-workspaces storage. It is not part of this directory and not part
   of any protocol. It exists only to *notice* a hand-edited id or the same id appearing at
   a new path and to offer migration, never to lose a record silently.
5. **Learner records are not workspace content.** They are absent from `WorkspaceSource`, from
   `.derivon/workspace.json`, from workspace synchronization and from the workspace `revision`.
   Nothing in `.derivon/`, no companion document, and no manifest field points at them. A
   workspace commit can never carry one.
6. **Missing directories are missing records, not errors.** `state.json` absent means this
   learner has assessed nothing here; `routes/` absent or empty means they have no personal
   route. A reader reports both as empty, and a writer creates the directory on first write.

## `derivon.learning/v1` — `state.json`

Mastery is a property of the graph object, not of a route. A concept a learner demonstrates on
one route is mastered everywhere it appears.

```json
{
  "schema": "derivon.learning/v1",
  "concepts": {
    "c-k7f3q2": {
      "status": "complete",
      "basis": "<hash>",
      "data": { "selfReported": true }
    }
  },
  "derivations": {
    "h-2m9dxb": {
      "status": "incomplete",
      "basis": "<hash>",
      "data": { "notes": "confused the direction of the map" }
    }
  }
}
```

- `schema` is `derivon.learning/v1`. Any other string is an unreadable record, reported as
  one; there is no input dialect.
- `concepts` and `derivations` are objects keyed by object id. They are the same protocol:
  concept mastery and derivation mastery are **isomorphic**, with the same fields and the same
  rules. A reader that handles one handles the other.
- A key whose object no longer exists in the manifest is an orphaned record. It is reported,
  retained, and never deleted as a side effect of anything else.

### One record

| Field | Required | Meaning |
| --- | --- | --- |
| `status` | yes | `"complete"` or `"incomplete"`. Deliberately not tied to a demonstration: how mastery is evidenced will keep changing, and evidence will not always be a demonstration. |
| `basis` | yes | The content basis this judgement was made against. A hash; see below. |
| `data` | no | A JSON object, optional, written under the boundaries below. |

- **Absence is not `incomplete`.** A record that is not there means *not assessed yet*;
  `"incomplete"` means *asked, and not reached*. The two must stay distinguishable, so a
  reader may never synthesize an `incomplete` record for an object it has not seen.
- **`status: "incomplete"` requires non-empty `data`.** This is a shape constraint, not a
  content constraint: a judgement that the learner did not get there has to say *something*
  about how it was reached. `data` may be an object with any keys; it must not be `{}` and
  must not be absent.
- **`data` has two boundaries.**
  1. It never contains the learner's raw answer. Records are judgements; transcripts and raw
     responses are not persisted here.
  2. It never contains anything recomputable from the graph or from object documents. A reader
     that wants a label, a dependency or a document reads the workspace, not this file.
- **`data` keys are namespaced by writer.** Two tenants exist, both writing a `complete`
  record, and the source is distinguished by `data`, never by a second status axis:
  - `selfReported: true` — the learner said they know it, as opposed to the application
    judging it. Written by both self-report entrances and by the orientation flow's `know` /
    `set-known` intents.
  - `orientationSeed: true` — the workspace's declared default, written once from
    `.derivon/orientation.json`'s `seed.known` when the learner has no record file at all.
    It is a **provenance marker, not copied content**: the default stays a claim rather than
    a judgement, and the interface shows it as a default, not as the learner's own word. A
    learner's own claim over the same concept replaces the marker rather than adding to it.

  A `complete` record with neither marker is a judgement. A record that is `incomplete` is a
  judgement too, whatever its `data` holds; a claim never overwrites one.

  **A judgement records its own provenance the same way**, under the namespace of whoever made
  it: the assessment path outside the client writes `data.teaching` with its verdict, the task
  type it used and the gap it named. That is provenance, never a second status axis: a reader
  takes the judgement's `status` and does not care which writer produced it, and because a claim
  never overwrites a judgement, the record of who judged survives the learner's own word. A
  later judgement replaces the record whole — provenance included, since that judgement is now
  the one that counts. A judgement written by a script-command session is a judgement exactly as
  the application's own verification is.
- **Incomplete does not block anything.** It records that this object is not mastered; the
  next step on a route is derived from mastery, so an `incomplete` record simply leaves that
  step current.

### `basis`: what a judgement was made against

`basis` answers exactly one question — *does this judgement still count?* It never explains
why. It therefore carries no object inventory, no list of files and no reason.

Its coverage is fixed:

- the manifest entry for this object — the point or hyperedge object and its `data`, whose
  **values** are covered (the file's indentation and key order are not; the encoding below fixes
  what the values contribute), and
- every file under that object's document directory, recursively, as workspace-relative paths
  and bytes.

So a change to the object's label, description, tags, endpoints or weight invalidates the
judgement, and so does any change to a document or asset the object owns. A change to some
*other* object does not: prerequisites and dependents are separate objects with separate
records.

`basis` is computed the way the workspace revision is computed — one SHA-256 stream, rendered as
lowercase hexadecimal, over records sorted ascending by name, each record being the name's length
as an unsigned 64-bit little-endian integer, the name's UTF-8 bytes, and a 32-byte digest — but
its records are these, and this is the **only** place they are defined:

- a **document file**: the name is the file's workspace-relative path, and the digest is the
  workspace revision's digest for that file — for a readable file, SHA-256 over the four bytes
  `file` followed by its bytes; for one that cannot be read, the revision's `unreadable:` digest
  over the metadata it looks up — the error kind, length, modification time and permissions of
  the nearest accessible ancestor when the file itself cannot be stat'd;
- the **object's manifest entry**: the name is `.derivon/workspace.json#<object id>`, which no
  document file can claim because an object's document directory is never under `.derivon/`, and
  the digest is SHA-256 over the four bytes `entry` followed by the entry's **canonical JSON**:
  object keys in ascending code-unit order, no insignificant whitespace, arrays in their recorded
  order, numbers in ECMAScript's shortest round-tripping form (`2`, not `2.0` or `2e0`), encoded
  as UTF-8.

The two-domain prefixes are what keeps a file's record from ever colliding with an entry's. Both
writers digest the same bytes, so a manifest rewritten with the same values — different
indentation, different key order — keeps every judgement alive, while any changed value retires
the judgement whose object changed. A personal route's `basis` is a **route basis**: the manifest
entry record alone — no document files — for every object the route names, and nothing else;
which objects those are is fixed in [routes](routes.md#basis).

### Invalidation: mark, keep, never re-decide

A record whose stored `basis` no longer matches the basis recomputed from the current
workspace is **stale**. Staleness is derived on read; it is not written into the file, and
there is no `invalid` status. The rule is:

- **mark it stale, keep it, and do not re-solve and do not delete it.** The record stays as
  evidence of what was once judged and against what.
- A basis this host cannot recompute at all — no inventory of the object's files, an unreadable
  document — leaves the record **unconfirmed**, which is not the same as fresh: like a stale one
  it does not count as complete, and the inability is reported rather than hidden. A reader never
  treats a basis it could not check as a match.
- Staleness on one object never touches another object's record, and never deletes a route.
- A stale record does not silently count as complete. Where it mattered — a route step, a
  known concept — it is reported and the learner decides what to do next.

## Personal routes — `routes/<route id>.json`

A personal route is a `derivon.route/v1` file in the learner record. The protocol — shape,
validation, execution order, `basis` coverage, editing — is specified once, in
[routes](routes.md), for both of its locations; this section fixes only what being a learner
record adds.

- **One file per route**, `routes/<id>.json`, where `<id>` is the route's own `id`. Several
  routes coexist as several files, and writing, replacing or deleting one never reads or
  rewrites another.
- **`basis` is required and `basedOn` is optional** in this location; a workspace route may
  carry neither.

Rules the format depends on:

1. **Only a confirmed or saved route is written.** A preview is not persisted; leaving the
   preview screen leaves no file. Confirming a solve writes a new personal route with
   `ordered: true` and the solve's executable order as `steps`. A route the learner copies from
   the workspace or builds in the editor is written when they save it, and not before.
2. **A route carries no completion marker of any kind.** There is no step state, no cursor, no
   per-derivation flag. Everything about *how far along* a route the learner is comes from
   `state.json` at display time.
3. **A route whose `basis` no longer matches is reported as inconsistent with the current
   graph.** It is not re-solved, not edited, and not deleted automatically. It is also
   validated on load like any route, and an invalid one cannot be started. Deleting a route is
   a separate, explicit learner action and never touches `state.json`.
4. **Editing is the learner's, and saving recomputes `basis`.** An edited route is saved with
   the basis of the graph at save time. A copy of a workspace route records the original's id
   in `basedOn` and never follows later edits of it.
5. **The active route is session state, not a record.** Which route is currently shown —
   personal or workspace — is application state, like the current view; reopening a workspace
   starts with none selected and the learner picks one.

## Two derived values, one stored nothing

These two are computed, never stored, and the distinction is the point of this document:

- **Known = the set of concepts with a `complete` record.** There is no independent
  `knownConceptIds` state and no independent known list anywhere. "Mark this as known" writes
  a `complete` record with `data.selfReported: true`, and the application derives the set on
  read ([#101](https://github.com/derivon-research/derivon-mindmap/issues/101)).
- **The current step of a route = the head concept of the first derivation in that route's
  [display order](routes.md#display-order) whose mastery is not `complete`.** There is no cursor. "Next" means "this step's
  judgement passed", not "add one to a number". A step is identified by the concept its
  derivation concludes, so a concept appearing twice along one route is one position reached
  once, and a concept reached on another route is reached here too. A `complete` record that no
  longer matches the content it was made against is not `complete` for this purpose either: the
  learner returns to it, with the record kept as evidence.

Because of that: **there is no learning-progress store in this repository.** What looks like
progress is `state.json` composed with a route — personal or workspace — at display time. Adding a progress field
anywhere would create a second source of truth for the same fact.

### `known` is an input snapshot, not the live known set

`known` on a route and "the known set" are different things that share a name, and they must
not be collapsed:

- **the live known set** is derived from mastery right now (`complete` records), and it is
  what a *new* solve is given as input;
- **`known` in a route** is that route's own starting point: for a confirmed route, the input
  its solve was given, frozen at confirmation time; for a route an author or learner edited,
  whatever they set it to.

Mastery can change afterwards. A concept can become complete later, or an old judgement can
become stale. The route still states what it starts from, so the route stays
explainable. Re-reading a route must never substitute the current known set for its stored
`known`, and a new solve uses the live set, never a route's stored one.

## Who writes

The **artifact is enforced; the writer is not.** There is one specification — this document,
with [routes](routes.md) for the route files — and two write paths, exactly as workspace content has two write paths and one specification
([ADR-0011](adr/0011-change-workspace-content-through-the-script-command-surface.md)):

- the application's own learning actions ("I know it", handing in a judgement, confirming,
  copying, editing or deleting a personal route), implemented in the client, and
- the script command surface, which computes the same `<application data directory>` path and
  can read and write records with no client running: `state.json` whole, and personal routes one
  by id — list, read, write, delete — under the capabilities `read-learner-record` and
  `write-learner-record`. A route write is validated against [routes](routes.md) and refused if
  it carries an error, and its `basis` is computed by the command, as the application computes
  it.

Both must produce a file the same reader accepts. Neither is the reference implementation for
the other, and neither may carry a second, application-only semantic. The command surface
declares those two capabilities for this artifact alongside the workspace-content ones, which is
what makes the artifact a **category** of the surface rather than a corner of it: every command
declares its category, and a mode's tool set is the intersection of what it grants and what each
command declares (`derivon-research/skills#5`, `#6`).

Write discipline follows ADR-0011: a write carries a precondition — the byte digest of the one
file it read, or that the file is absent when it creates one — and replaces the file atomically
(temporary file adjacent to the target, then rename); a delete carries the same precondition. A
losing precondition refuses cleanly. This is compare-and-swap on one file, not a lock and not a
cross-file transaction: two personal routes are two files and never contend.

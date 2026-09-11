# Learner records

Status: specified by [#92](https://github.com/derivon-research/derivon-mindmap/issues/92);
the storage, the command surface and the routes UI land in #98–#103. Domain terms are defined
in [CONTEXT.md](../CONTEXT.md); the decisions are
[ADR-0009](adr/0009-persist-learner-records-outside-the-workspace.md) (where they live) and
[ADR-0012](adr/0012-learning-state-is-mastery.md) (what they are).

A learner record is everything the application remembers about one learner in one workspace
that is not workspace content. There are two files, and they answer two different questions:

- `state.json`, protocol `derivon.learning/v1` — **mastery**: for each concept and each
  derivation, has this learner reached it?
- `routes.json`, protocol `derivon.routes/v1` — **routes**: which routes did this learner
  confirm, and what graph did each one solve against?

Both are written beside each other but read and replaced independently. Deleting one leaves
the other complete and readable.

## Where they live

```text
<application data directory>/
└── learner-records/
    └── <workspace id>/
        ├── state.json
        └── routes.json
```

`<application data directory>` is the application's data directory — the Tauri app-data
directory, not the config directory that holds `models.json` and `auth.json`. On macOS that
is `~/Library/Application Support/<bundle-id>/`; on Linux `$XDG_DATA_HOME/<bundle-id>/` or
`~/.local/share/<bundle-id>/`; on Windows `%APPDATA%\<bundle-id>\`. This is the one layout the
application and the script command surface both compute; neither derives a second one.

Rules the layout depends on:

1. **The key is the learner and the workspace, never the folder.** The record is identified by
   *who* is learning and *which* workspace they are learning in. v1 has exactly one local
   learner, so the workspace id is the whole key on disk and the learner dimension contributes
   no segment yet; adding a second learner inserts a segment above `<workspace id>` and changes
   no other part of the layout.
2. **The key is the workspace `id` from the manifest.** Copy a workspace folder and the copy
   shares the record — same id, same identity. Two workspaces must not share an id.
3. **A workspace with no `id` is a broken workspace.** It never reaches this directory, so
   there is no fallback branch and no path-derived key.
4. **Any index from `id` to the last path it was seen at is application startup state**, kept
   with the existing recent-workspaces storage. It is not part of this directory and not part
   of either protocol. It exists only to *notice* a hand-edited id or the same id appearing at
   a new path and to offer migration, never to lose a record silently.
5. **Learner records are not workspace content.** They are absent from `WorkspaceSource`, from
   `.derivon/workspace.json`, from workspace synchronization and from the workspace `revision`.
   Nothing in `.derivon/`, no companion document, and no manifest field points at them. A
   workspace commit can never carry one.
6. **Missing directories are missing records, not errors.** `state.json` absent means this
   learner has assessed nothing here; `routes.json` absent means they have confirmed no route.
   A reader reports both as empty, and a writer creates the directory on first write.

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
  one; there is no input dialect. Unknown top-level keys are reported, not ignored.
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
- **`data` keys are namespaced by writer.** The first tenant is `selfReported: true`, the
  marker that separates "the learner said they know it" from "the application judged it". Both
  write `status: "complete"`; the source is distinguished by `data`, never by a second status
  axis.
- **Incomplete does not block anything.** It records that this object is not mastered; the
  next step on a route is derived from mastery, so an `incomplete` record simply leaves that
  step current.

### `basis`: what a judgement was made against

`basis` answers exactly one question — *does this judgement still count?* It never explains
why. It therefore carries no object inventory, no list of files and no reason.

Its coverage is fixed:

- the manifest entry for this object — the point or hyperedge object exactly as it appears in
  `.derivon/workspace.json`, including its `data` — and
- every file under that object's document directory, recursively, as workspace-relative paths
  and bytes.

So a change to the object's label, description, tags, endpoints or weight invalidates the
judgement, and so does any change to a document or asset the object owns. A change to some
*other* object does not: prerequisites and dependents are separate objects with separate
records. The concrete framing is the workspace revision's — sorted, length-framed relative
paths and fixed-size file digests — so the application and the command surface compute the
same value from one shared mechanism rather than two.

### Invalidation: mark, keep, never re-decide

A record whose stored `basis` no longer matches the basis recomputed from the current
workspace is **stale**. Staleness is derived on read; it is not written into the file, and
there is no `invalid` status. The rule is:

- **mark it stale, keep it, and do not re-solve and do not delete it.** The record stays as
  evidence of what was once judged and against what.
- Staleness on one object never touches another object's record, and never deletes a route.
- A stale record does not silently count as complete. Where it mattered — a route step, a
  known concept — it is reported and the learner decides what to do next.

## `derivon.routes/v1` — `routes.json`

A route is a solved subgraph a learner confirmed. Structurally it is a product derivation
subgraph with all `data` stripped; it references the manifest's graph and copies none of it.

```json
{
  "schema": "derivon.routes/v1",
  "routes": [
    {
      "id": "r-k7f3q2",
      "description": "从向量的线性无关走到 SVD",
      "targets": ["c-svd"],
      "known": ["c-span"],
      "basis": "<hash>",
      "conceptIds": ["c-span", "c-rank", "c-svd"],
      "derivationIds": ["h-rank", "h-svd"],
      "order": ["h-rank", "h-svd"],
      "cost": 2
    }
  ]
}
```

- `schema` is `derivon.routes/v1`; any other string is unreadable, and unknown top-level keys
  are reported. `routes` is an array because **several routes coexist**.
- `id` is `r-` plus six characters from the same alphabet and the same generation as an object
  id (`23456789abcdefghjkmnpqrstvwxyz`), unique within the file and never reused.
- `description` is the user-facing name of this route, written when it is confirmed.
- `targets` and `known` are concept ids. `known` is **the input snapshot of that solve** — see
  the distinction below.
- `basis` covers the manifest entries of every concept and derivation the route references
  (the objects named in `conceptIds` and `derivationIds`), and nothing else, so an unrelated
  graph edit does not invalidate the route.
- `conceptIds`, `derivationIds`, `order` and `cost` are the subgraph: the concepts and
  derivations it uses, the executable order of the derivations, and the solved cost. They are
  references into the manifest, never copies of object `data`.

Rules the format depends on:

1. **Only a confirmed route is written.** A preview is not persisted; leaving the preview
   screen leaves no record.
2. **A route carries no completion marker of any kind.** There is no step state, no cursor, no
   per-derivation flag. Everything about *how far along* a route the learner is comes from
   `state.json` at display time.
3. **A route whose `basis` no longer matches is reported as inconsistent with the current
   graph.** It is not re-solved, not edited, and not deleted automatically. Deleting a route is
   a separate, explicit learner action and never touches `state.json`.
4. **The active route is session state, not a record.** Which confirmed route is currently
   shown is application state, like the current view; reopening a workspace starts with none
   selected and the learner picks one.

## Two derived values, one stored nothing

These two are computed, never stored, and the distinction is the point of this document:

- **Known = the set of concepts with a `complete` record.** There is no independent
  `knownConceptIds` state and no independent known list anywhere. "Mark this as known" writes
  a `complete` record with `data.selfReported: true`.
- **The current step of a route = the head concept of the first derivation in that route's
  `order` whose mastery is not `complete`.** There is no cursor. "Next" means "this step's
  judgement passed", not "add one to a number".

Because of that: **there is no learning-progress store in this repository.** What looks like
progress is `state.json` composed with `routes.json` at display time. Adding a progress field
anywhere would create a second source of truth for the same fact.

### `known` is an input snapshot, not the live known set

`known` on a route and "the known set" are different things that share a name, and they must
not be collapsed:

- **the live known set** is derived from mastery right now (`complete` records), and it is
  what a *new* solve is given as input;
- **`known` in a route record** is the input that *that* solve was given, frozen at
  confirmation time.

Mastery can change afterwards. A concept can become complete later, or an old judgement can
become stale. The route record still states what it was solved from, so the route stays
explainable. Re-reading a route must never substitute the current known set for its stored
`known`, and a new solve uses the live set, never a route's stored one.

## Who writes

The **artifact is enforced; the writer is not.** There is one specification — this document —
and two write paths, exactly as workspace content has two write paths and one specification
([ADR-0011](adr/0011-change-workspace-content-through-the-script-command-surface.md)):

- the application's own learning actions ("I know it", handing in a judgement, confirming a
  route), implemented in the client, and
- the script command surface, which computes the same `<application data directory>` path and
  can read and write records with no client running.

Both must produce a file the same reader accepts. Neither is the reference implementation for
the other, and neither may carry a second, application-only semantic. The command surface
declares read and write capabilities for this artifact alongside the workspace-content ones
(`derivon-research/skills#5`, `#6`).

Write discipline follows ADR-0011: a write carries a precondition — the revision, or the
`basis`, of what it read — and replaces the file atomically (temporary file adjacent to the
target, then rename). A losing precondition refuses cleanly. This is compare-and-swap on the
file, not a lock and not a cross-file transaction.

# Routes

Status: specified by [#153](https://github.com/derivon-research/derivon-mindmap/issues/153).
Domain terms are defined in [CONTEXT.md](../CONTEXT.md); the protocol is named after the
artifact per [ADR-0007](adr/0007-name-the-workspace-protocol-after-the-artifact.md).

**This document is the one specification of `derivon.route/v1`.** The application and the
script command surface in `derivon-research/skills` each implement a reader, a validator and a
writer for it, and neither is the reference for the other
([ADR-0011](adr/0011-change-workspace-content-through-the-script-command-surface.md)). Both
must accept and refuse the same files, and report the same diagnostic codes for the same
steps. Diagnostic messages are free text and are not part of the protocol.

A **route** is a derivation subgraph plus an optional written order. It references the
manifest's graph by id and copies none of it: no `data`, no labels, no weights. It carries no
completion marker of any kind; how far along a route a learner is comes from mastery at
display time ([ADR-0012](adr/0012-learning-state-is-mastery.md)).

One file is one route. The same protocol lives in two locations, and the location alone
decides who owns a route and which two fields it may carry:

| | Workspace route | Personal route |
| --- | --- | --- |
| Directory | `.derivon/routes/` in the workspace | `<application data directory>/learner-records/<workspace id>/routes/` |
| Belongs to | workspace content, shared by every learner | the learner record of one learner in one workspace |
| Written by | the authoring side; the command surface's `workspace` category | the learning side; the command surface's `learner-records` category |
| `basis` | forbidden | required |
| `basedOn` | forbidden | optional |

`derivon.route/v1` replaces `derivon.routes/v1`, the single `routes.json` list of confirmed
routes. That protocol was never released; it is gone, with no compatibility reading and no
migration.

## The file

```jsonc
{
  "schema": "derivon.route/v1",
  "id": "r-ax7spq",
  "label": "按线性映射优先的讲法走到谱定理",
  "description": "先讲线性映射，行列式放到最后。",
  "known": ["c-2m9dxb", "c-k7f3q2"],
  "targets": ["c-spq7ax"],
  "steps": ["h-given1", "h-vecsp2", "h-spect3"],
  "ordered": true,
  "basedOn": "r-sv4d2m",   // personal routes only, optional
  "basis": "<64 lowercase hexadecimal characters>"   // personal routes only, required
}
```

| Key | Required | Value |
| --- | --- | --- |
| `schema` | yes | Exactly `"derivon.route/v1"`. |
| `id` | yes | `r-` followed by six characters from the object-id alphabet `23456789abcdefghjkmnpqrstvwxyz`. |
| `label` | yes | A string: the route's user-facing name. |
| `description` | no | A string: one or two sentences on whose account this route follows and why. |
| `known` | yes | An array of strings: concept ids the route starts from. May be empty. |
| `targets` | yes | An array of strings: concept ids the route leads to. |
| `steps` | yes | An array of strings: derivation ids. May be empty. |
| `ordered` | yes | A boolean. `true`: the order of `steps` is the route's order. `false`: `steps` is a set, and the order is computed whenever the route is read. |
| `basedOn` | no | A route id: the workspace route this personal route was copied from. Provenance only, never a link. |
| `basis` | location-dependent | 64 lowercase hexadecimal characters: the content basis the route was saved against. See [basis](#basis). |

- `known` is the route's own starting point, an input like a solve's input. It is **not** the
  learner's live known set and never substitutes for it, in either direction
  ([learner records](learner-records.md#known-is-an-input-snapshot-not-the-live-known-set)).
- `known` and `targets` are read as sets. A repeated id in them is legal and means nothing
  more than one occurrence.
- Concept ids and derivation ids are manifest ids. They are not checked against a pattern;
  an id the graph does not have is a [graph error](#graph-errors), not a shape error.
- Nothing is stored that the graph and `steps` determine: there is no `conceptIds`, no
  `cost` and no computed order in the file.

### Reading a file

Reading a route file is two layers. A file that fails the first layer is **unreadable** and
yields no route at all; a file that passes it yields a route, which the second layer
([validation](#validation)) then diagnoses in full.

A file is unreadable, and reported as one, when:

| Code | Condition |
| --- | --- |
| `unreadable` | Its bytes cannot be read, are not UTF-8 JSON, or the JSON value is not an object. |
| `wrong-schema` | `schema` is absent or is any string other than `derivon.route/v1`. There is no input dialect. |
| `unknown-key` | A top-level key other than the ten above is present. It is reported, never ignored. |
| `missing-field` | `id`, `label`, `known`, `targets`, `steps` or `ordered` is absent. |
| `invalid-field` | A present key has the wrong type or form: `id` or `basedOn` is not a route id, `basis` is not 64 lowercase hexadecimal characters, `label` or `description` is not a string, `known`, `targets` or `steps` is not an array of strings, `ordered` is not a boolean. |

Every condition that holds is reported, not only the first. `basis` and `basedOn` are
decoded wherever they appear; whether they are allowed where they appear is validation.

An unreadable file is still a route file: in either location it is listed as an invalid
route with its diagnosis. It is never dropped, never repaired, and never overwritten as a
side effect of anything else.

### Writing a file

A writer produces JSON with two-space indentation and a trailing newline, keys in the order of
the table above, and `description` and `basedOn` omitted when they have no value — not written
as `""` or `null`. A writer refuses to write any route its own validator reports an error for;
the serializer is the write guard. This byte form is what writers emit; a reader accepts any
JSON text that decodes to the same value.

## Locations

### Workspace routes — `.derivon/routes/`

- Each workspace route is one file, `.derivon/routes/<id>.json`. The manifest gains no field
  for them and its version does not move with them. A workspace with no `routes` directory, or
  an empty one, is valid and has no workspace routes.
- The route files of a workspace are **the direct child files of `.derivon/routes/` whose name
  ends in `.json`**. Subdirectories and their contents are not routes. A file with any other
  name is not a route either; this is what keeps a temporary file a crashed replacement left
  behind inert. A symlink is not followed: listing the directory refuses it, and a workspace
  holding one already fails revision acquisition ([WorkspaceSource](workspace-source.md)).
- Every route file is read, validated against the current graph and becomes either **ready**
  (no errors; warnings kept) or **invalid** (errors, or unreadable), and every invalid route is
  a workspace diagnostic. Nothing is dropped, re-solved or repaired on load.
- Workspace routes are workspace content: read through `WorkspaceSource`, written as
  companion-metadata changes through workspace synchronization, covered by the workspace
  `revision`. Accepting a route that carries an error is refused. Deleting a workspace route
  is removing its file.
- Deleting a concept or derivation never edits a route. The deletion plan lists the workspace
  routes that name a removed object — in `known`, `targets` or `steps`, counting the
  derivations removed with a concept — and says they will become invalid. That neither blocks
  the deletion nor repairs the routes; they are repaired in the routes view, like any route
  that fails validation on load.

### Personal routes — `learner-records/<workspace id>/routes/`

- Each personal route is one file, `routes/<id>.json`, beside `state.json` in the learner
  record ([learner records](learner-records.md#where-they-live)). The same file-name rule as
  above decides which files are routes.
- A personal route is not workspace content: no `WorkspaceSource`, no workspace
  synchronization, no workspace `revision`, and no workspace commit can carry one. The
  learning side writes only here, never into the workspace
  ([ADR-0009](adr/0009-persist-learner-records-outside-the-workspace.md)).
- Confirming a solved route writes a new personal route: `ordered: true`, `steps` in the
  solve's executable order, `label` the name given at confirmation. A preview is never
  written; only a confirmed or explicitly saved route is.
- **Save as mine** copies a workspace route into a new personal route: a new id, `basedOn` set
  to the original's id, `basis` computed. It is a copy. Later edits of the original never
  reach it, and deleting the original leaves it whole.
- Deleting a personal route removes its file and never touches `state.json`.

### Ids

A new route's id is generated the way an object id is (`r` prefix,
`src/workspace/manifest.ts`), excluding every id currently held by a workspace route and by a
personal route of the same workspace, so one id names one route in either location.

## Validation

Validation is a pure function of the graph, the route, its location, and — for a route read
from a file — the file's name. It yields the route's [reading](#reading-a-route-on-the-graph):
the display order, its concepts, its cost, and diagnostics of two severities.

- **Errors** keep the route out of the valid state. A route with any error is invalid: it
  cannot be saved, a workspace route carrying one is not effective content, and neither kind
  can be started on the learning side.
- **Warnings** are shown and do not affect validity or saving.

Every diagnostic carries its code and its subject — the key, the concept or the step it is
about — and the fields listed for it below. The two implementations must report the same
codes for the same subjects.

### Shape errors

| Code | Condition |
| --- | --- |
| `id-mismatch` | Read from a file: the file name is not `<id>.json`. |
| `empty-label` | `label` has no non-whitespace character. |
| `empty-targets` | `targets` is empty. |
| `duplicate-step` | A derivation id occurs in `steps` more than once. Reported once per repeated id. |
| `forbidden-field` | A workspace route carries `basis` or `basedOn`. Reported per key. |
| `missing-basis` | A personal route has no `basis`. A writer computes `basis` before it validates what it writes, so a personal route being edited is never refused for lacking one. |

### Graph errors

| Code | Condition | Carries |
| --- | --- | --- |
| `dangling-concept` | A concept id in `known` or `targets` is not in the graph. | the id and the field |
| `dangling-derivation` | A derivation id in `steps` is not in the graph. | the id |
| `target-unreached` | A target that is in the graph is not in the route's [closure](#execution-order). | the target and its [gaps](#gaps) |
| `order-not-executable` | `ordered` is `true` and a step uses a concept that is neither known nor concluded by an earlier step. See [written order](#written-order). | the step, its position, and per missing concept the position that concludes it |

### Warnings

| Code | Condition | Carries |
| --- | --- | --- |
| `never-fires` | A step's premises are never all available, and it is a root cause: at least one missing premise is concluded by no step of the route, or it is the first step in list order of a cycle of steps that only wait on each other. See [root causes](#root-causes-only). | the step and all its missing premises |
| `idle` | A step that fires is not needed for any target. Not reported at all while the route has a `target-unreached` error. See [needed steps](#needed-steps). | the step |
| `duplicate-head` | An earlier step in the display order already concludes the same concept. | the step, the concept, and the earlier step |

Two derivations concluding the same concept — parallel derivations — are legal in one route:
an author may teach both accounts. That is the `duplicate-head` warning and never an error.

Besides the diagnostics the reading carries one number, the **blocked count**: how many steps
never fire only because a root-cause step of the route never fires. The interface shows it as one
sentence («另有 N 步因此暂时走不了») rather than one diagnostic per step.

## Reading a route on the graph

Throughout, a **step** is an entry of `steps` whose derivation is in the graph, taking only
the first occurrence of a repeated id. Dangling and repeated entries are diagnosed above and
take no further part. A derivation's **premises** are its `tails`; it **concludes** its
`head`.

### Execution order

The execution order is the one the route view uses: go through the steps in list order,
repeatedly firing every step whose premises are all in hand, until a pass fires nothing.

```text
have    := set(known)
pending := steps, in list order
order   := []
repeat
  fired := false
  for s in pending, in list order:
    if every premise of s is in have:
      append s to order; add s's conclusion to have; remove s from pending
      fired := true
until not fired
closure := have;  unfired := pending, in list order
```

A step fired earlier in a pass is in hand for the steps after it in the same pass. The order
is a function of the list order of `steps`, so both implementations must produce exactly this
order — not merely some executable order. It is not necessarily the order
`derivon-core`'s own executable-order function produces for the same set.

### Display order

- `ordered: true` — the steps in written order, including steps that never fire.
- `ordered: false` — the execution order, followed by the unfired steps in list order.

Every position a diagnostic reports is a 1-based position in the display order. The display
order is also the order the learning side walks: a route's current step is the conclusion of
the first step in the display order whose mastery is not `complete`
([learner records](learner-records.md#two-derived-values-one-stored-nothing)).

The route's **concepts** are `known` together with the premises and conclusion of every step,
restricted to concepts in the graph. Its **cost** is the sum of the `weight` of every step,
fired or not, in the unit and precision of a manifest `weight` (one decimal place). The cost
is a set cost: it does not depend on order.

### Gaps

For each target in the graph but not in the closure, the diagnosis names the gaps that keep it
out. A **producer** of a concept is the first step, in list order, that concludes it. Walk
down from the target:

```text
visit(concept, wantedBy):
  if concept is in closure or already visited for this target: stop
  mark concept visited
  if concept has a producer p:  for each premise t of p: visit(t, p)
  else:  report gap { concept, wantedBy, candidates }

visit(target, target)
```

- `wantedBy` is the step that needs the concept, or the target itself when nothing in the
  route concludes the target.
- `candidates` are every derivation in the graph that concludes the concept, in manifest
  order. None of them is a step: a step concluding it would have been its producer. These are
  what «补上» offers.
- Gaps are reported in the order the walk reaches them, which is depth-first in premise order.
- A target can be unreached with no gap at all: the steps leading to it form a cycle nothing
  outside it starts. The error is still reported, with an empty gap list.

### Written order

Only when `ordered` is `true`:

```text
have := set(known)
for each step s at display position p:
  missing := premises of s not in have
  if missing is non-empty and s is not unfired:
    report order-not-executable { s, p,
      for each m in missing: the first display position whose step concludes m, or none }
  add s's conclusion to have
```

A step that never fires is diagnosed by `never-fires` or the blocked count instead, never
here. Adding a step's conclusion even when that step is itself out of order keeps one
misplaced step from reporting every step after it: only the root is reported. Several errors
with one cause — one concept concluded too late — are reported per step; merging them into one
suggestion is out of scope.

### Root causes only

For each unfired step, its missing premises are those not in the closure. A step **waits on**
another unfired step when that step concludes one of its missing premises. Every unfired step
is either a **root**, reported as a `never-fires` warning carrying all of its missing premises,
or **blocked**, counted and not listed:

```text
roots   := unfired steps with a missing premise that no step concludes
blocked := {}
repeat
  add to blocked every unfired step, not a root, that waits on a root or a blocked step,
    until nothing more is added
  if some unfired step is neither a root nor blocked:
    the first such step, in list order, that lies on a cycle of waiting among such steps
      becomes a root
until every unfired step is a root or blocked
```

The first rule is the ordinary case: a premise nothing in the route concludes. The second is
the cycle nothing outside starts — steps that only wait on each other. Each group of steps
waiting on each other this way has exactly one root, its first member on a cycle in list
order, so a route whose unfired steps form a cycle still names a cause instead of reporting
only a blocked count. A step that merely waits on a cycle is not itself on it, and is blocked
rather than a root.

### Needed steps

`idle` is decided from the display order, only when every target is in the closure:

```text
first(c) := the first step in display order that concludes c
needed   := {}
want every target not in known
while some wanted concept c has first(c) not yet in needed:
  add first(c) to needed; want every premise of first(c) not in known
```

A step is `idle` when it fires, is not in `needed`, and is not itself a `duplicate-head`
warning. A parallel derivation is therefore reported once, as `duplicate-head`, and a detour an
author keeps on purpose is reported once, as `idle`.

## Basis

A personal route's `basis` answers exactly one question: *was the route saved against the graph
as it is now?* It is the [route basis](learner-records.md#basis-what-a-judgement-was-made-against)
— the manifest entry of each object the route names, and nothing else — over this set of
objects:

- every concept in `known` and in `targets`,
- every derivation in `steps`,
- every premise and the conclusion of every derivation in `steps` that is in the graph.

An id the graph does not have contributes nothing. A graph edit that touches none of these
entries leaves the basis unchanged; a changed label, weight or endpoint of any of them changes
it. Object documents are not covered.

- `basis` is computed by the writer from the graph at the moment of writing — on confirming, on
  save as mine, on every save of an edit — and is never carried over from an earlier version or
  written by hand. The command surface computes it the same way when it writes one.
- A personal route whose stored `basis` differs from the one recomputed now is **inconsistent
  with the current graph**. It is marked, kept, not re-solved, not rewritten and not deleted.
  That is staleness, derived on read and never written into the file.
- Staleness and validation are independent. A personal route is also validated on load, and an
  invalid one cannot be started whatever its `basis` says.

A workspace route has no `basis`: it travels with the graph it names, so load-time validation
is the whole check.

## Editing

The route editor is one component for both locations; the caller decides where a save goes.
Every edit is a pure function on a route and never refuses its input — refusing is what saving
does, and a route with any error cannot be saved. An unsaved route is an editing draft: not
effective content, not auto-saved, and protected against external updates.

| Edit | Effect |
| --- | --- |
| Swap for a parallel derivation | Replaces the step in place; position and `ordered` unchanged. Swapping in a derivation that is already a step keeps both entries, which is a `duplicate-step` error; the editor therefore offers only parallel derivations not yet in `steps`. |
| Remove a step | Removes it from `steps`. |
| Add a derivation | `ordered: false`: appended to `steps`. `ordered: true`: inserted before the first position at which all its premises are in hand (known, or concluded by an earlier step), so that filling a gap does not itself create an order error. Adding a derivation already among the steps changes nothing. |
| Move a step | Writes the order down: `steps` becomes the current display order with the step moved, followed by the entries that take no part — dangling ids and repeats — in their list order; `ordered` becomes `true`. Nothing is dropped. |
| Return to computed order | `ordered` becomes `false`; `steps` is left as it is. |
| Rename, describe | Sets `label`, `description`. |
| Change targets or known | Sets `targets`, `known`; `steps` is left as it is. |
| Draft again from targets and known | `steps` becomes the solve's derivations, `ordered: false`. When that would discard steps the author wrote or changed, the editor asks for confirmation first. |
| Save as mine | See [personal routes](#personal-routes--learner-recordsworkspace-idroutes). |

A new route starts from targets and known, and its first draft comes from the `RouteSolver`
port. A host without a solver starts from empty `steps` and says so; it does not invent a
route.

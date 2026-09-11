# Learning state is mastery

## Status

Accepted.

## Context

Learning state used to be described as a bag: the learner's targets, known concepts, solve
results, route progress and verification-task submissions. Those are not one kind of thing.
Some are inputs to a solve; some are outputs of one; some belong to one route; and one of them
— progress — is not a stored fact at all. Treating the bag as a single state produced a
`cursor` (route position kept as a number), an independently writable `knownConceptIds` set,
and task-completion markers attached to routes. Each created a second source of truth for a
fact that the graph and an assessment already determined.

The durable fact underneath all of it is: *has this learner reached this object?* That is
mastery, and it is a property of the graph, not of a route or a session.

## Decision

**Learning state is mastery of graph objects.** Two kinds — concept mastery and derivation
mastery — and they are **isomorphic**: the same fields and the same judgement rule. Mastery is
about the whole graph and is not relative to a route.

The protocol is [learner records](../learner-records.md), `derivon.learning/v1`:

- a record is keyed by object id and has `status`, `basis` and an optional `data`;
- `status` is `complete` or `incomplete` — the name is deliberately not bound to a
  demonstration, because how mastery is evidenced will keep changing;
- **absence means *not assessed yet* and must stay distinguishable from `incomplete`, which
  means *asked, and not reached*;**
- `status: "incomplete"` requires non-empty `data`; `data` never holds the learner's raw
  answer and never holds anything recomputable from the graph or documents;
- `basis` covers the object's manifest entry plus every file under its document directory, and
  answers only "does this judgement still count?";
- invalidation **marks a record stale, keeps it, and never re-solves and never deletes it**.
  Staleness is derived on read, not stored.

**Targets and known are not learning state.** They are inputs to one route solve. The known set
is not a stored set either — **known = the set of concepts with a `complete` record**, derived
on demand. "I already know this" writes a `complete` record marked `data.selfReported: true`;
judgement and self-report share the one `status` axis and are told apart by `data`.

**Routes persist, but a route is not learning state.** Several routes coexist in
`derivon.routes/v1`. A route is structurally a product-derivation subgraph with all `data`
stripped, referencing the manifest's graph. **A route carries no completion marker of any
kind** — no step state, no cursor. `known` inside a route record is the *input snapshot of
that solve*, frozen at confirmation, and is a different thing from the live known set derived
from mastery; the two must never be substituted for each other.

**There is no learning-progress store in this repository — 本仓不存在「学习进度」这个存储。
What reads as progress is a display-time composition of `state.json` and `routes.json`: the
current step of a route is the head concept of the first derivation in its order whose mastery
is not `complete`.** Adding a progress field anywhere would recreate the second source of truth
this ADR removes.

**These records are not workspace content.** Mastery and confirmed routes are written outside
the workspace, in the application data directory, keyed by learner and by the workspace `id`;
they never enter `WorkspaceSource`, the manifest, workspace synchronization or the workspace
`revision`. The location, the key and the two-writer discipline are
[ADR-0009](0009-persist-learner-records-outside-the-workspace.md)'s decision, and the field-level
protocol is [learner records](../learner-records.md).

## Consequences

- `cursor`, `learningKnownIds` and route-attached task completions disappear from the
  implementation; "next step" means "this step's judgement passed".
- Mastery is shared across routes: a concept demonstrated on one route is mastered everywhere
  it appears, so two routes through the same concept see the same status.
- Self-report and judgement are distinguishable in the interface because they are
  distinguishable in the data; showing them as the same thing would hide the source marker.
- A content change invalidates the affected judgements and leaves the rest alone. The learner
  returns to the earliest stale step; unrelated records keep counting.
- Because records live outside the workspace ([ADR-0009](0009-persist-learner-records-outside-the-workspace.md)),
  deleting a route never touches mastery, and deleting `state.json` leaves every route complete
  and readable with no completion shown.

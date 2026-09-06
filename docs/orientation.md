# Orientation

Status: implemented by #57 and #58. Domain terms are defined in [CONTEXT.md](../CONTEXT.md);
the protocol naming decision is [ADR-0007](adr/0007-name-the-workspace-protocol-after-the-artifact.md).

Orientation is the entry process: a learner opens a workspace, and leaves this stage with
targets, known concepts and an initial route. It has three parts, and they live in three
different modules on purpose.

## The document — `src/workspace/orientation.ts`

`.derivon/orientation.json`, protocol `derivon.orientation/v1`, optional. The manifest
gains no field for it and its version does not move with the manifest's. A workspace
without one is valid, and the learning side falls back to the generic entry.

```jsonc
{
  "schema": "derivon.orientation/v1",
  "seed": { "targets": ["basis"], "known": ["foundation-fields"] },
  "questions": [
    {
      "id": "why",
      "prompt": "先说你为什么来。",
      "select": "one",                 // one | many
      "options": [
        { "id": "svd-paper", "label": "读一篇用到 SVD 的论文",
          "actions": [{ "op": "set-targets", "points": ["svd", "pseudoinverse"] }],
          "next": "svd-background" },
        { "id": "browse", "label": "先随便逛逛", "actions": [], "next": "finish" }
      ]
    },
    {
      "id": "svd-background", "prompt": "这些你已经会哪些？", "select": "many", "next": "finish",
      "options": [
        { "id": "has-inner", "label": "内积与正交",
          "actions": [{ "op": "add-known", "tags": ["inner-product"] }] }
      ]
    }
  ]
}
```

Four rules the format depends on:

1. `next` absent means fall through to the next question in document order. Questions are
   ordered; branching is the exception, not the shape every author has to think in.
2. `next: "finish"` ends orientation. `finish` is reserved and cannot be a question id.
3. A single-select question branches per option. A multi-select one cannot — a learner can
   choose several options at once and several jumps would conflict — so its jump is on the
   question, and an option-level `next` there is an error.
4. The seed is a snapshot of concepts, never a live tag query. Tagging one more concept
   later must not silently move every learner's starting point. Actions do keep their tags;
   that is what tags are worth there.

The action vocabulary is closed: `set-targets`, `add-targets`, `set-known`, `add-known`,
each naming concepts directly, by tag, or both. No expressions, no conditions, no code.

### What counts as broken

`validateOrientationConfig` produces two severities, and the line between them is whether a
route could come out wrong:

| Errors — keep the configuration out of effective content | Warnings — shown, still usable |
| --- | --- |
| `dangling-concept`, `dangling-next`, `branch-on-multi`, `duplicate-question`, `duplicate-option`, `reserved-id`, `empty-tag`, `empty-action` | `undeclared-tag`, `unreachable`, `empty-prompt`, `no-options`, `empty-label`, `unused-next` |

A tag matching zero concepts is an error because that action would do nothing. A tag that
is merely undeclared is a warning: it still resolves, it only loses its label, so a
hand-written manifest and the editor never fight over the registry.

An on-disk configuration carrying any error is `invalid`, not `ready`. It never reaches a
route; the learning side shows the diagnosis and continues through the generic entry.

## The flow — `src/modes/learning/orientation.ts`

One state machine, one transition function:

```ts
applyOrientationIntent(plan, run, intent)
```

Intents are `answer`, `skip`, `set-targets`, `set-known` and `restart`. The deterministic
screen calls it; a `ConversationProvider` calls it. Neither owns the flow, and a missing
provider cannot change its behaviour — which is what "不维护两套流程" means in practice.

`planOrientation(content)` decides which entry a learner gets: the author's questions when
the configuration is effective content, the generic concept picker otherwise, carrying the
reason and the diagnosis with it.

What comes out is application state — this session's targets, known and trail. None of it
is written back to workspace content.

## The editor — `src/modes/authoring/orientation/`

A third centre view in the authoring workbench, next to 对象 and 图浏览. Not a mode:
orientation is a stage of the learning side, and editing its configuration is an authoring
action inside the authoring mode. Not an object either: there is one configuration and it
is always there, so it is a fixed side of the workspace rather than a search result.

- The **outline** (left pane) is the configuration read top to bottom, with the route each
  option produces next to it. An opening option shows the absolute length of that route; a
  follow-up shows the difference it makes, so an option worth `±0` is visible as a question
  not worth asking.
- The **route column's assumption is stated, not hidden.** A follow-up cannot answer "how
  long is this route" alone — it depends on which opening answer the learner gave. Only the
  seed and the entry are assumed (`context.ts`); answers in between are never guessed.
- Concept references are built with a picker. Nobody types an id, so the editor cannot
  produce a dangling one.
- Editing happens in a **draft**. An unfinished question is not effective content, is not
  auto-saved, and is protected against an external update. Accepting it is one content
  operation through the shared session (`AuthoringCommands.updateOrientation`), which
  refuses anything carrying an error.
- The **learner tab** runs the learner's own flow — the same plan, the same transitions.

## Routes

Solving is a host capability behind `src/ports/RouteSolver.ts`. The desktop host solves
through `derivon-core` over the existing `solve_route` command. A host without a solver
says so; no preview invents a route. Web solving arrives with #49.

## Deletion

`orientationConceptImpact(content, conceptIds)` reports every place the configuration names
a concept, and `repairConceptReferences` is the executable repair. They are the orientation
half of the unified deletion plan in #52; the plan itself, and the GUI that confirms it,
belong to that ticket.

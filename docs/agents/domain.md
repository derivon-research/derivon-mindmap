# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Shared vocabulary across the organisation

Core terms are shared across every `derivon-research` repo. Each repo's `CONTEXT.md`
describes only its own layer; it is never normative for another repo. When you need a
shared term, defer to the artifact that owns it:

| Vocabulary | Normative source |
| --- | --- |
| Mathematical model: point, hyperedge, tail, head, closure, derivation, set cost, tree cost, depth cost, bracket | `derivon-research/paper` |
| Graph protocol `derivon.graph/v1` | `derivon-research/derivon` |
| Authoring protocol `derivon.authoring/v0.3.0`: concept, derivation, object document, replacement view | `derivon-research/derivon-mindmap` |
| Authoring methodology: problem pressure, problem-led derivation | `derivon-research/skills` (`CONTEXT.md`) |

Do not restate a term owned elsewhere. Link to its source instead. If two sources appear to
disagree, that is a real defect: surface it rather than picking one.

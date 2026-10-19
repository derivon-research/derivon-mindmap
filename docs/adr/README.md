# Architecture Decision Records

This directory is a **log**, not a description of the current system. Read this file before
adding or changing an ADR.

| Question | Answered by |
| --- | --- |
| What is true now? | `GLOSSARY.md` |
| Why is it this way, and what was rejected? | this directory |
| How does it work? | `docs/*.md` |
| What is left to do? | GitHub issues |

An ADR that drifts into one of the other three loses the only thing it can carry. This is why
the bodies stay short and the reasoning stays here.

## Rules

### 1. One decision per ADR

If part of an ADR can be reversed without reversing the rest, it is a separate decision and
belongs in a separate file. A file that needs *partial* supersession is the signal that it
should have been split.

### 2. Append. Never rewrite.

A decision that changes gets a **new** ADR. The old one keeps its body and gains one status
line. The decision and its reasoning are never edited again.

The reasoning is the valuable part: it is what stops the next reader from re-litigating a
settled question, or from "fixing" something deliberate. Git preserves the bytes; it does not
preserve the argument, because a replacement rationale is usually written as if it had always
been so.

### 3. A status line may only point at another ADR

If a status paragraph contains an argument, you owe a new ADR. A status line says *what
happened*, never *what we now think*.

### 4. The body is short

One to three sentences of decision, plus only the optional sections that earn their place.
Long ADRs are almost always implementation narrative that belongs in `docs/`.

Rough budget: **under ~120 lines**. Past that, move the mechanics out and leave a link.

### 5. No decaying state

Do not record what the code does today, what has landed, or what a ticket still owes. Such a
sentence is false within a release, and there is then no way to tell a stale ADR from a wrong
one.

## Format

```md
# {Title: the decision, not the topic}

## Status

Accepted. {Only if superseded / deprecated / corrected: one line, no argument.}

{One to three sentences: the context, the decision, and why.}

## Considered options      <!-- optional -->

## Consequences            <!-- optional -->
```

## Status vocabulary

| Situation | Status | Body |
| --- | --- | --- |
| Decision reversed | `Superseded by ADR-NNNN` | freeze |
| Decision void, nothing replaces it | `Deprecated` + one line why | freeze |
| Decision stands, a stated premise was false | `Corrected by ADR-NNNN` | freeze |
| Typo, dead link, renamed file | unchanged | edit |

`Corrected by` is an addition to the upstream format, for the case this repository actually
hits: the conclusion holds but a premise behind it turned out not to. It must not be used to
soften a reversal — that is `Superseded by`.

## When to write one

All three, or skip it:

1. **Hard to reverse** — changing your mind later is expensive.
2. **Surprising without context** — a reader will look at the code and wonder why.
3. **A real trade-off** — there were alternatives, and specific reasons for the choice.

An ADR that fails any of the three is noise that makes the real ones harder to find.

## Numbering

Next is **max + 1**. Numbers are never reused and **never renumbered** — `GLOSSARY.md`,
`docs/`, and other repositories link ADRs by number.

## Index

Read this table, then the one to three ADRs it points at. Never all of them.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-whole-window-mode-switching.md) | Modes are mutually exclusive whole-window subtrees, switched from the top bar | accepted |
| [0002](0002-authoring-does-not-connect-by-gesture.md) | Hyperedges are created from a form; authoring has no drag-to-connect | accepted |
| [0003](0003-the-overview-is-not-meant-to-be-readable.md) | The whole-graph overview is for orientation, not reading; one force layout | accepted |
| [0004](0004-synchronize-workspace-content-independently-of-modes.md) | One synchronization module owns workspace content, independent of the visible mode | accepted |
| [0005](0005-delete-owned-documents-with-their-objects.md) | Deleting an object deletes its owned documents and assets, after reference analysis | accepted |
| [0006](0006-the-overview-does-not-track-authoring-changes-live.md) | The overview does not animate authoring changes; no incremental force simulation | accepted |
| [0007](0007-name-the-workspace-protocol-after-the-artifact.md) | The workspace manifest is `derivon.workspace/v1`, named for the artifact not the writer | accepted |
| [0008](0008-persist-markdown-not-rendered-pages.md) | An object document is `document.md` plus assets; no rendered second source of truth | accepted |
| [0009](0009-persist-learner-records-outside-the-workspace.md) | Learner records live in the application data directory, keyed by workspace `id` | accepted ⚠ |
| [0010](0010-pi-sdk-companion-process.md) | One Node companion owns the Pi SDK; the webview holds no credentials | accepted ⚠ |
| [0011](0011-change-workspace-content-through-the-script-command-surface.md) | Writes go through the script command surface; the boundary is artifact enforcement | accepted ⚠ |
| [0012](0012-learning-state-is-mastery.md) | Learning state is concept and derivation mastery; targets and known are solve inputs | accepted |
| [0013](0013-who-owns-the-user-level-skills-root.md) | The application installs the base skills into `~/.derivon/skills/`, and only seeds them | accepted |

⚠ marks a body that was rewritten in place; its original is in git history. See *Known debt*.

## Baseline

**ADR-0001 through ADR-0013 are the frozen baseline**: the accepted decisions as of the commit
that adds this file. From here the rules above hold — new decisions are appended, existing
bodies are not rewritten.

A frozen baseline does not mean the directory never changes. Editorial repair (a typo, a dead
link, a status line) is always allowed. What is frozen is each ADR's **decision and reasoning**.

## Known debt

Three ADRs carry an in-place rewrite. Each should be split into a superseded original plus one
or more new ADRs, in one deliberate change:

- **ADR-0009** — superseded its own session-local phase (*Status*).
- **ADR-0010** — the configuration and diagnostics sections were rewritten (*Status*).
- **ADR-0011** — rewritten three times; the original ("a mode's tool set is a capability
  limit") is in `18dd4fc`. This is where the lost reasoning matters most.

The baseline is frozen, not correct. Repairing this is a bounded correction, not a new
decision: restore the original body from git, mark it superseded, and give each replacement its
own number. Do not do it opportunistically — a partial repair is another palimpsest.

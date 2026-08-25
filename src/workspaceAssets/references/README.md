---
managed-by: derivon-mindmap-demo
reference-set: provisional-2026-08-25
status: provisional-source-index
---

# Derivon model references

**Reference set:** provisional-2026-08-25
**Status:** temporary documentation bundle pending official Derivon documentation

This directory is the entry point for model questions. The files are bundled into
each directory workspace so an Agent can reason about Derivon without depending
on a repository checkout or network access. The application records generated
content digests in `.derivon/agent/bundle.json`. When the reference set changes,
it upgrades a file only while its current digest still matches the previously
generated version. A locally modified file is added to `protectedFiles` and left
untouched; unrelated user Skills are never part of the bundle. The
`managed-by: derivon-mindmap-demo` marker is used only to recognize generated
files created before digest tracking existed.

## Required reading order

1. Read `model.md` first. It is the operational bridge between the mathematical
   model and `.derivon/workspace.json`.
2. Read `derivon-paper.md` for exact definitions, proofs, cost semantics,
   reachability, cycles, complexity, folding, or algorithmic claims.
3. Read `learning-route-hypergraph.md` for the modeling motivation, intuitive
   examples, application-layer interpretation, and the evolution from the old
   AND/OR DAG model.
4. When network access is available and freshness matters, compare the bundled
   blog snapshot with its canonical URL:
   <https://v3n0.top/post/2026/learning-route-hypergraph/>.

Do not infer the model from the canvas rendering or from generic graph theory.
In particular, an ordinary arrow diagram loses the atomic identity, payload, and
whole-step weight of a hyperedge.

## Source authority

Until official documentation exists, apply this precedence:

1. The workspace schema validator and running application define which persisted
   files and fields are accepted.
2. The bundled working paper defines the current formal core model.
3. `model.md` explains how the authoring workspace maps onto that core.
4. The blog explains motivation and intuition. If its informal wording conflicts
   with the newer working paper, follow the paper and report the discrepancy.

None of these sources authorizes silently inventing a missing definition. If the
sources do not settle a question, state the ambiguity and ask the user which
semantics they intend before making a destructive or structural edit.

## Mandatory consultation triggers

An Agent must open the relevant references, rather than relying on memory, when:

- Point, Hyperedge, State, Query, Closure, Derivation, executable order, tail, or
  head is unclear;
- deciding whether several premises are AND or OR;
- distinguishing an empty-tail hyperedge from an already-known start point;
- editing weights or discussing set, tree, or depth cost;
- deciding whether a cycle is legal or whether a target is reachable;
- adding intermediate points, multi-head encodings, modules, or folding;
- interpreting `view.replacements` as anything more than presentation state;
- a requested edit appears inconsistent with the mathematical model.

## Migration when official documentation ships

This bundle is deliberately centralized so it can be replaced. A documentation
migration is incomplete until all of the following are done:

1. Replace this source index and precedence statement with official URLs and
   version identifiers; advance the generated `reference-set` marker so managed
   workspaces receive the migration.
2. Rewrite or replace `model.md`; remove provisional claims that are no longer
   part of the official model.
3. Update the `Required model references` and ambiguity rules in every generated
   `derivon-workspace/SKILL.md` copy.
4. Replace or retire the paper and blog snapshots. Keep historical material only
   when clearly labeled non-normative.
5. Update the bundled file map in the application and its tests.
6. Search the application README, templates, schema documentation, validator
   messages, and UI wording for stale model descriptions.
7. Test a newly created workspace and an existing workspace missing the new
   official references.

Do not merely add an official link beside the provisional text. Migrate the
source of truth and remove contradictory duplicate definitions.

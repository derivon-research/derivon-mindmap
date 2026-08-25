---
name: derivon-workspace
description: Operate and validate a Derivon knowledge-graph workspace. Use for .derivon/workspace.json, object document storage, HTML publication, hyperedge relations, prerequisites, conclusions, weights, graph consistency, and workspace validation. Do not use this skill to choose a subject-specific teaching voice or lesson design.
metadata:
  managed-by: derivon-mindmap-demo
  reference-set: provisional-2026-08-26-skill-scripts
---

# Derivon Workspace

Treat the Derivon workspace as a knowledge graph whose points and hyperedges own
documents. Help the user edit both the graph and its written reasoning. Do not
reduce a hyperedge to a collection of ordinary binary edges or infer semantics
from the canvas alone.

## Required model references

The bundled model documentation is part of this Skill. Use it actively:

- `.derivon/agent/references/README.md` defines source authority, consultation
  triggers, and the future official-documentation migration procedure.
- `.derivon/agent/references/model.md` is the required operational model guide
  and manifest mapping.
- `.derivon/agent/references/derivon-paper.md` is the current working paper. It
  contains formal definitions, proofs, cost semantics, algorithms, complexity,
  and known limitations.
- `.derivon/agent/references/learning-route-hypergraph.md` is a bundled snapshot
  of <https://v3n0.top/post/2026/learning-route-hypergraph/>. It explains the
  motivation, model evolution, and intuitive examples that the paper assumes.

These references are provisional because official documentation does not yet
exist. The working paper governs formal mathematical claims; the blog supplies
explanation and context. The schema validator and running application govern
persisted file validity.

Before the first structural graph edit in a session, read `model.md`. If any
model term, relationship, cost interpretation, cycle, reachability claim,
module/folding operation, or point boundary feels ambiguous, stop and read the
relevant paper and blog sections before proceeding. Do not guess from generic
graph theory. If the sources still do not settle the question, state the gap and
ask the user which semantics they intend.

## Start here

1. Locate the workspace root by finding `.derivon/workspace.json`.
2. Read `.derivon/agent/references/model.md` before interpreting graph structure.
3. Run `node .derivon/agent/validate-workspace.mjs .` from that root.
4. Read the manifest before editing any object document. Build maps for point ID,
   hyperedge ID, and document owner.
5. Read the documents of every object affected by the request. For one
   hyperedge, inspect all premise documents, the hyperedge document, and the
   conclusion document together.
6. Preserve unrelated document content exactly. When the task concerns teaching
   quality or subject exposition, also use an installed subject-authoring Skill.

Use these discovery commands when useful:

```sh
node .derivon/agent/validate-workspace.mjs . --inventory
node .derivon/agent/validate-workspace.mjs . --review <hyperedge-id>
```

## Semantic model summary

This section is only a quick reminder. `references/model.md` is the complete
operational definition and must be consulted when this summary is insufficient.
The manifest schema is `derivon.authoring/v0.2.0`.

- A point is a concept: `{ "id", "data": { "label", "document", "format" } }`.
- A hyperedge is one atomic derivation step:
  `{ "id", "weight", "tails", "head", "data": { "document", "format" } }`.
- In the paper, a mathematical Derivation is a set of hyperedges that reaches a
  query target. The UI currently calls each individual hyperedge a "derivation";
  use "hyperedge/step" versus "derivation set/route" when the distinction matters.
- Read `(tails, head, weight)` as "all concepts in `tails` jointly imply
  `head`, at this cost." Multiple tails are AND, not independent arrows.
- Multiple hyperedges with the same tails and head are alternative derivations.
  They remain separate because their proof text and weights may differ.
- An empty `tails` array is a valid unconditional step. It is graph-wide and
  costs its weight; it is not the same as a point already belonging to a
  query-specific start set.
- `weight` is a non-negative finite number with at most one decimal place,
  attached to the whole hyperedge. Do not distribute it among premise connections.
- `view.positions` is presentation state. Preserve it unless layout is part of
  the request. Every stored coordinate must be finite.
- `view.replacements` controls visual abstraction only. It does not prove
  semantic equivalence and must not be used as a derivation relation.

Point and hyperedge IDs share the canvas namespace and must be unique. Every
document directory has exactly one owner. Never point two graph objects at the
same directory.

## Edit documents

For `format: markdown`, `document.md` is the source of truth and `index.html` is
the directly viewable publication. Keep both synchronized in the same change.
For legacy `format: html`, edit only `index.html` unless deliberately migrating
the object to Markdown.

Use the bundled deterministic renderer instead of recreating a one-off Markdown
conversion script:

```sh
node .agents/skills/derivon-workspace/scripts/render-documents.mjs . <object-id>
node .agents/skills/derivon-workspace/scripts/render-documents.mjs --write . <object-id>
```

The first command only reports drift; the second updates `index.html`. The
renderer needs `marked` and `marked-katex-extension`. It looks in the current
project by default; pass `--runtime <project>` when those packages live in a
different project. Run it without an object selector to check or publish every
Markdown object. If the runtime is unavailable, follow the unsynchronized-
publication rule below rather than improvising a partial Markdown parser.

Markdown documents support GFM, raw HTML blocks, and KaTeX formulas:

```markdown
The invariant is $f(x) \ge 0$.

$$
\int_a^b f(x)\,dx = F(b)-F(a)
$$
```

- Raw HTML supports inline CSS and JavaScript. The editor preview is an
  automatically sized sandboxed iframe with scripts, forms, modals, and popups,
  but an opaque origin. Embedded code cannot assume access to the parent DOM,
  workspace APIs, local files, cookies, storage, or same-origin APIs. Published
  `index.html` files are not wrapped in this editor sandbox.
- HTTPS external resources may work in a published page when their servers and
  browser policies permit them. In the editor's opaque-origin preview, requests
  can additionally be affected by CORS or Content Security Policy. These are
  runtime facts; another authoring Skill should decide whether a dependency is
  pedagogically justified and what fallback it needs.
- Preserve raw HTML exactly when unrelated prose is edited. Do not escape it
  into a code block or silently remove scripts, styles, forms, or interaction.
- In `index.html`, keep a complete HTML document, render headings/lists/tables,
  retain raw HTML, and include KaTeX styling when formulas are rendered.
- Do not claim the source and publication are synchronized unless their visible
  content actually agrees. If the available environment cannot render a new
  construct faithfully, edit the source, report the unsynchronized publication
  explicitly, and ask the user to open and save that document in Derivon.

This Skill governs document ownership, synchronization, and runtime boundaries.
It deliberately does not prescribe lesson structure, prose depth, examples, or
visual design. For beginner-facing mathematics, use `derivon-math-authoring`
alongside this Skill when it is installed.

## Edit graph relations

Make graph changes in `.derivon/workspace.json`; directory names do not define
relations.

- Add a concept before referencing its ID. Give it a unique document directory
  and create all files required by its format.
- Add a tail only when the derivation genuinely depends on that concept as a
  prerequisite. Mentioning a concept is not sufficient.
- To represent another way to reach the same conclusion, add a separate
  hyperedge and derivation document. Do not merge alternatives into one tail
  set, because that changes OR into AND.
- To represent jointly required premises, put all IDs in one hyperedge's
  `tails`. Do not create one hyperedge per premise.
- When changing a head or tails, re-read the derivation document and rewrite any
  stale premise/conclusion language.
- Remove an object only after checking incoming/outgoing hyperedges,
  replacements, positions, and document ownership. Do not delete documents as
  an incidental cleanup unless the user requested it and no object owns them.
- Update `document.updatedAt` after a semantic or document change.

## Review a derivation

For a hyperedge `h`, use:

```sh
node .derivon/agent/validate-workspace.mjs . --review h
```

Then perform this review:

1. Extract the assumptions, defined terms, symbols, domains, and relevant claims
   from every tail concept document.
2. Extract every concept, symbol, theorem, dataset, external fact, and condition
   used by the derivation document.
3. Classify each dependency as supplied by a tail, defined locally, common
   primitive knowledge, cited external evidence, or unsupported.
4. Treat the head document as the target definition, not as a premise. Flag
   reasoning that assumes the conclusion or one of its consequences.
5. Check each step for validity, quantifier/domain changes, unit consistency,
   boundary cases, ambiguous pronouns, notation drift, and missing citations.
6. Check graph fidelity: all actual prerequisites should be tails, tails should
   actually be used, and alternative routes should not be encoded as jointly
   required premises.

Do not call every new noun a missing premise. A locally defined helper or a
standard primitive may belong in the derivation text. For every real gap,
identify the exact sentence or formula and recommend one of these concrete
repairs:

- explain or define it locally;
- move the needed definition into an existing premise document;
- create a concept and add it to `tails` because it is independently reusable;
- split the derivation into intermediate concepts and hyperedges;
- rewrite or remove the unsupported step.

Separate findings by severity: invalid/circular reasoning, missing prerequisite,
ambiguity or notation issue, then optional exposition improvement. When asked
only to review, report findings before making edits.

## Broader assistance

Proactively look for issues relevant to the user's goal:

- orphan concepts, stale document references, unknown IDs, duplicate tails, and
  invalid weights;
- disconnected regions, unreachable conclusions, suspicious cycles, redundant
  routes, or parallel derivations whose distinct purpose is undocumented;
- concept definitions that disagree across documents;
- unexplained notation, broken formula delimiters, unsafe or inaccessible HTML,
  and source/publication drift;
- large derivations that would be clearer and more reusable as named
  intermediate concepts;
- weight changes whose rationale is absent from the derivation document.

Cycles and parallel edges are legal, so report them as review evidence rather
than automatically deleting them. Consult the paper before making any claim
about cycle grounding, exact route cost, multi-head encoding, or folding.

## Finish safely

1. Reparse `.derivon/workspace.json` as JSON.
2. Run `node .derivon/agent/validate-workspace.mjs .` and fix every error.
3. Re-read changed documents and their graph neighbors for stale terminology.
4. Check that changed model descriptions agree with the bundled source hierarchy;
   do not introduce a competing definition into object documents.
5. Summarize graph changes separately from document changes. Call out remaining
   semantic uncertainty or publication drift instead of hiding it.

Keep changes scoped to the user's request. Preserve unknown files and never
rewrite an entire workspace merely to normalize formatting.

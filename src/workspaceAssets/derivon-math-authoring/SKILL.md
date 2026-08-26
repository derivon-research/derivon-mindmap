---
name: derivon-math-authoring
description: "Supply mathematics-specific exposition standards for explicitly requested Derivon document writing: precise definitions, beginner intuition, worked reasoning, examples, counterexamples, and mathematical visualizations. Use alongside derivon-document-authoring; do not activate for graph import, concept extraction, edge modeling, weighting, or placeholder creation."
metadata:
  managed-by: derivon-mindmap-demo
  reference-set: provisional-2026-08-27-concept-atomicity
---

# Derivon Math Authoring

Apply this Skill only when the user explicitly asks to implement or improve
reader-facing mathematics documents. Use `derivon-document-authoring` for scope,
source adaptation, HTML implementation, publication, auditing, and large-scale
SubAgent coordination. Use `derivon-learning-graph` for mathematical concept
identity, hyperedge boundaries, source import, and weights.

Do not turn a request to import or expand a mathematics graph into a textbook-
writing project. During rapid graph construction, concise accurate placeholders
are sufficient.

## Establish the teaching situation

Read the target object, its graph neighbors, and the exact source material named
by the user. For a hyperedge document, read every tail, the step document, and the
head together. Treat tail concepts as the reader's available vocabulary; the
head is the idea to reach, not evidence that may be assumed.

Infer the actual beginner obstacle:

- What problem made this definition or result useful?
- What familiar case can carry the abstraction?
- Which condition, quantifier, convention, or boundary is easiest to miss?
- What should the reader be able to predict or do afterward?

If the source already has a strong motivation, example, counterexample, or proof
route, retain that teaching value. Adapt it accurately and identify its location
when useful. Do not replace a good concrete example with generic prose.

## Concept documents

A developed mathematics concept page should include the applicable forms of
understanding:

- the task the concept lets us name, test, construct, or simplify;
- a plain-language mental model before or alongside formal notation;
- a precise definition with domains, quantifiers, exclusions, and conventions;
- a worked example rather than a merely named example;
- a nonexample, boundary case, or misconception when it reveals why a condition
  matters;
- operational intuition about what changes and what remains invariant;
- connections to prerequisites and a later problem the concept unlocks.

These are acceptance criteria, not mandatory headings. A concept page is not a
proof dump; move reusable arguments into their owning hyperedges.

## Derivation documents

A developed mathematical hyperedge document should read like guided reasoning:

1. State the question in ordinary language and why resolving it matters.
2. Explain how every tail premise contributes to the plan.
3. Before a substantial formula, state the reason for trying the next move.
4. After it, interpret what changed and why the move is valid.
5. Expose domains, quantifiers, nonzero assumptions, chosen bases, finite-
   dimensional assumptions, and other conditions when they become relevant.
6. Carry a small example through the reasoning when it reduces abstraction,
   while keeping it distinct from the general argument.
7. End with the exact result and a plain-language account of what is now known.

Never smuggle the head claim or one of its consequences into the premises. Avoid
unexplained equation chains. Compact algebra is appropriate only when each move
is routine for the stated audience.

## Mathematical visual decisions

Use the HTML capabilities described by `derivon-document-authoring` when
interaction helps the reader test a mathematical relationship. Strong candidates
include coefficients and vector sums, transformations and grids, parameters and
degenerate states, convergence behavior, geometric constraints, and competing
representations of the same object.

The interaction must answer a teaching question, not decorate a formula. Give it
a meaningful initial state, labeled controls, live mathematical feedback, and a
readable explanation. It supports intuition and experimentation; it never
replaces the formal definition or argument. When interaction adds little, use a
static figure, table, or prose without apology.

## Mathematics acceptance check

Before accepting a developed page, verify that:

- every symbol is introduced before use;
- definitions and examples obey the stated domain and conventions;
- each important formula has a purpose and interpretation;
- nonexamples fail for the claimed reason;
- every tail is used and the head is not assumed;
- source terminology and theorem conditions remain accurate;
- the conclusion distinguishes what was proved from nearby stronger claims.

Use the generic document audit after publication. Depth follows the conceptual
gap, not a word quota. Once these fixed criteria and the user's explicit request
are met, optional additional examples or visual polish do not block completion.

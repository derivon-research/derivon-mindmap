---
name: derivon-math-authoring
description: Write or revise beginner-facing mathematics concept and derivation documents in a Derivon workspace. Use when mathematical lessons need intuition, motivation, worked reasoning, examples, misconceptions, or interactive HTML visualizations. Use derivon-workspace separately for graph storage and validation.
metadata:
  managed-by: derivon-mindmap-demo
  reference-set: provisional-2026-08-26-bounded-math-authoring
---

# Derivon Math Authoring

Write each object document as a small piece of an excellent introductory
textbook. A reader who knows the graph prerequisites but has never seen the
target idea should understand what problem it addresses, why the next move is
reasonable, and how the formal statement connects to an example or picture.

This Skill governs mathematical exposition. Use `derivon-workspace` for the
manifest, document ownership, hyperedge semantics, source/publication sync, and
validation commands. Do not duplicate or override those operational rules here.

## Route large authoring work

When the request spans more than a small handful of documents, crosses multiple
chapters, or asks to complete a substantial region of the graph, read
[`references/large-scale-authoring.md`](references/large-scale-authoring.md)
before planning or writing. Follow its capability-gated SubAgent workflow when
the current Agent platform provides delegation, parallel agents, or an
equivalent feature. The workflow is vendor-neutral: detect the capability that
actually exists rather than assuming a particular command or product.

If no delegation capability is available, perform the same inventory, source
packet, bounded drafting, independent review, and acceptance stages sequentially
in small batches. Lack of SubAgents never lowers the teaching or validation bar.
Do not interpret file coverage, generated prose, or successful rendering as
evidence that the documents are complete. Treat the workflow as bounded
delivery, not open-ended optimization: freeze the acceptance bar before drafting,
repair blocking defects once, and finish when that fixed bar is met.

## Establish the teaching situation

Before writing, read the target object, its graph neighbors, and the exact source
material the user named. For a derivation, read every tail document, the step
document, and the head document together. Treat tail concepts as the reader's
available vocabulary; the head is the idea to reach, not evidence you may assume.

Infer a realistic beginner's likely questions:

- What problem made us introduce this object or theorem?
- What familiar example can carry the abstraction?
- Which distinction or hidden condition is easiest to miss?
- What should the reader be able to predict after the explanation?

If a source textbook already has a strong motivation, example, counterexample,
or proof route, retain that teaching value. Adapt it accurately and identify the
section or numbered result when useful. Do not replace a good concrete example
with generic prose, and do not present paraphrases as quotations.

## Concept documents

A concept page should build several kinds of intuition, choosing only those that
fit the concept:

- **Purpose:** the task the concept lets us name, test, construct, or simplify.
- **Plain-language model:** one memorable sentence before formal notation.
- **Formal definition:** domains, quantifiers, exclusions, and notation stated
  precisely after the reader knows what to look for.
- **Examples and nonexamples:** a small worked example plus a nearby boundary
  case that exposes why each condition matters.
- **Operational intuition:** what changing an input does and what remains fixed.
- **Connections:** what earlier idea it refines and what later problem it unlocks.

Do not turn this list into identical headings on every page. Let the concept's
actual learning obstacle determine the shape. A concept page is not a proof dump;
link a property to its reason or defer the proof to the owning hyperedge.

## Derivation documents

A derivation should read like guided reasoning rather than a compressed answer.

1. State the question in ordinary language and explain why it is worth resolving.
2. Say how each tail premise will help. Omit boilerplate such as "use all
   premises"; name the concrete operation, definition, or fact being used.
3. Before a formula, explain the plan or obstacle that motivates writing it.
4. After a formula, interpret what changed and cite the reason for the step.
5. Make quantifiers, domains, nonzero assumptions, chosen bases, and finite-
   dimensional assumptions visible at the moment they matter.
6. Use a small running example when it reduces abstraction, but keep it distinct
   from the general argument.
7. End by restating the result in plain language, including what it does not say
   and how it unlocks the head concept.

Avoid unexplained chains of displayed equations. Compact algebra is appropriate
when every move is routine for the stated audience; otherwise narrate why a
substitution, factorization, construction, or inequality is the useful next move.
Distinguish the discovery story (how one might think of the move) from the proof
obligation (why the move is valid).

## Interactive mathematical HTML

Use HTML/CSS/JavaScript when interaction reveals a relationship that static prose
cannot show as directly. Good components let the learner vary one meaningful
quantity and immediately see another representation update, for example:

- coefficients together with a vector sum;
- a transformation together with its effect on a grid, basis, or test vector;
- a direction together with whether an operator preserves it;
- a parameter together with a limiting, degenerate, or counterexample state.

Every component needs a teaching question, a meaningful initial state, labeled
controls, live numeric or symbolic feedback, and a short observation prompt. Use
responsive normal flow and stable SVG/Canvas dimensions. Do not give the whole
component a fixed page height or its own vertical scrollbar. Keyboard controls,
focus states, contrast, reduced-motion behavior, and text alternatives are part
of correctness, not polish.

Prefer self-contained native HTML, CSS, SVG, Canvas, and JavaScript so the lesson
survives offline. External HTTPS dependencies are allowed when they add real
capability; pin versions and provide a readable fallback. Never assume parent DOM,
same-origin storage, local files, or Derivon application APIs. A visualization
supports intuition and experimentation; it does not replace the formal argument.

Avoid decorative dashboards, generic sliders, or diagrams that merely restate a
formula. If changing the control does not help the learner answer a mathematical
question, use prose or a static figure instead.

## Quality check

Before finishing, read the page once as a novice and once as a reviewer:

- every symbol is introduced before use;
- every important formula has a stated purpose and interpretation;
- examples satisfy the definition and nonexamples fail for the stated reason;
- no head claim is smuggled into a derivation as a premise;
- source terminology and notation remain accurate;
- interactive states, narrow widths, and the published `index.html` all work;
- the conclusion tells the reader what new question they can now approach.

After publishing, use the bundled audit instead of writing another page-check
script:

```sh
node .agents/skills/derivon-math-authoring/scripts/audit-math-pages.mjs . <object-id>
node .agents/skills/derivon-math-authoring/scripts/audit-math-pages.mjs \
  --base-url http://127.0.0.1:8090/ --runtime <project-with-playwright> \
  . <object-id>
```

The first form performs dependency-free static checks. The browser form also
tests a 390px viewport for page and formula overflow, embedded vertical scrolling,
KaTeX failures, literal delimiters, and console errors. Start a local static
server first and use the browser form for changed interactive HTML. Browser
launching may require the environment's normal approval.

Depth is determined by the conceptual gap, not a word quota. Expand genuine
reasoning and intuition; remove repetition, ceremonial headings, and prose that
only announces that a definition or conclusion exists.

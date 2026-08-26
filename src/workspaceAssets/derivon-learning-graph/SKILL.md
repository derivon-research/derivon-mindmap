---
name: derivon-learning-graph
description: Model, import, merge, weight, and audit Derivon learning graphs from books, courses, syllabi, or existing notes. Use for concept identity and granularity, hyperedge boundaries, prerequisite structure, alternative routes, source provenance, and learning-cost calibration. Do not use for polished lesson documents.
metadata:
  managed-by: derivon-mindmap-demo
  reference-set: provisional-2026-08-27-float-weight-calibration
---

# Derivon Learning Graph

Build a graph whose structure is useful across sources and courses. The primary
deliverable is a defensible set of reusable points, atomic hyperedges, alternative
routes, and calibrated weights. Rich documents are a separate, explicitly
requested deliverable.

Use `derivon-workspace` alongside this Skill for manifest syntax, document
ownership, publication, core semantics, and validation. Do not override the core
model or invent fields that the current schema does not support.

## Route the work

- For importing or merging books, courses, syllabi, or large note collections,
  read [`references/source-import.md`](references/source-import.md) before
  changing the graph.
- For every new or revised learning-cost value, read
  [`references/weight-calibration.md`](references/weight-calibration.md).
- Use a subject-specific graph-modeling Skill when one exists. A document-writing
  Skill is not a substitute for subject semantics.

## Optimize for structural evidence

Judge the work in this order:

1. concept identity and scope;
2. point granularity and reuse across sources;
3. the exact joint premise set and single conclusion of each hyperedge;
4. separation of alternative routes;
5. weight meaning and calibration;
6. provenance and unresolved modeling decisions;
7. minimal documents needed to audit the choices.

Do not spend graph-import time turning every object document into a chapter.
Detailed prose, elaborate examples, and interactive HTML are out of scope unless
the user explicitly requests document authoring.

## Model points conservatively

A point should name a stable, reusable state of understanding or established
claim. Do not create a point merely because a phrase is a heading, bold term,
person, date, or paragraph in one source. Prefer identities that can survive
merging another course.

Labels are evidence, not identity. Before merging similarly named candidates,
compare their definitions, scope, conventions, domain, and intended use. Store
aliases and source-specific wording in the minimal document. Keep genuinely
different variants separate and record the unresolved relationship rather than
silently choosing one source as canonical.

## Model hyperedges as real steps

Each hyperedge states that all tails jointly suffice for one head through the
documented step. Include a tail only when the step actually depends on it. Split
a step when it hides independently reusable intermediate understanding; keep it
whole when the premises only make sense as one atomic move.

Different arguments, teaching routes, experiments, or source treatments may
produce parallel hyperedges with the same head. Preserve them separately when a
learner could genuinely choose between them.

Derivon hyperedges are not generic relationship arrows. Chronology, citation,
historical influence, thematic similarity, opposition, and membership do not by
themselves assert that the tails yield the head. Record such evidence in object
documents or an import report, or identify the need for another relation layer;
never encode it as a fake derivation merely to keep everything on the canvas.

## Create auditable placeholders

For rapid graph construction, create concise and accurate Markdown rather than
empty files or polished lessons.

A point placeholder should contain its canonical statement or definition,
scope/conventions, aliases or variants when relevant, source locations, and any
open identity question. A hyperedge placeholder should state how the tails yield
the head, cite the governing source passage, and record the weight rating and
rationale. Mark uncertainty explicitly. Never fill a gap with a plausible but
unsupported summary.

Render the placeholders so `document.md` and `index.html` remain synchronized.
Use `derivon-document-authoring` only when the user explicitly asks to turn a
named, bounded set of placeholders into reader-facing lessons.

## Audit the resulting graph

Use the bundled report instead of inventing an inventory script:

```sh
node .agents/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs .
node .agents/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs --json .
```

The report summarizes exact float weights, anchor bands, dispersion, tail sizes,
parallel routes, duplicate labels, and isolated points. These are review signals,
not automatic semantic errors. A concentrated weight distribution can be the
correct result of consistently atomic step boundaries. It limits a dataset's
coverage for testing variable-weight routing, but does not by itself justify
changing weights or splitting edges. Inspect rationales, pairwise comparisons,
and route behavior before changing the graph.

Finish by running the workspace validator. Report structural decisions,
provisional identities, unsupported relation types, and weight uncertainty
separately from document status.

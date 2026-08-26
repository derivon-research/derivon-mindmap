---
name: derivon-document-authoring
description: Implement or substantially revise reader-facing Derivon object documents, including prose, examples, source adaptation, and interactive HTML. Use only when the user explicitly asks for document quality or document implementation; do not activate for rapid source import, graph expansion, weighting, or placeholder creation.
metadata:
  managed-by: derivon-mindmap-demo
  reference-set: provisional-2026-08-27-float-weight-calibration
---

# Derivon Document Authoring

Turn a named, bounded set of graph-object placeholders into useful reader-facing
documents. This Skill governs document design and implementation, not graph
identity, hyperedge selection, or learning-cost calibration.

Use `derivon-workspace` for storage, rendering, and validation. Use an installed
subject-authoring Skill for domain-specific standards. For rapid book or course
imports, use `derivon-learning-graph` and leave concise placeholders unless the
user separately requests polished documents.

## Enforce the scope gate

Do not infer a document-authoring request from "build a graph," "import a book,"
"merge courses," or "add concepts and edges." The user must explicitly ask to
write, expand, teach through, visualize, or improve object documents.

When the explicit request covers more than five documents, more than one chapter,
or a substantial graph region, read
[`references/large-scale-authoring.md`](references/large-scale-authoring.md)
before drafting. If the platform exposes SubAgents or equivalent delegation, the
large-scale workflow requires their active use. Small requests should be handled
directly without orchestration overhead.

## Establish the document contract

For each requested document, identify its reader, purpose, graph role, governing
sources, and the knowledge available from neighboring objects. Preserve source
distinctions: label quotations, do not present paraphrases as quotations, and do
not smooth genuine disagreement into false consensus.

A point document should make the object identifiable and usable: explain what it
is, why it matters for the requested audience, its scope or boundary, and at
least one concrete application or example when appropriate. A hyperedge document
should explain the whole joint step: how every tail contributes, what move the
step itself supplies, and exactly what head is established.

These are roles, not mandatory headings. Let subject matter and reader needs
determine the structure. Do not inflate a simple object into a chapter merely to
make the page appear complete.

## Use the document surface deliberately

Derivon Markdown supports headings, tables, raw HTML, CSS, JavaScript, SVG,
Canvas, and KaTeX. Choose the simplest representation that helps the reader do
something useful. Interaction is warranted when changing a meaningful input,
traversing a timeline, comparing positions, testing a case, or manipulating a
representation reveals a relationship more directly than prose.

Every interactive component needs a clear question, meaningful initial state,
labeled controls, visible feedback, and a readable noninteractive explanation.
Use responsive normal flow. Do not give the entire component a fixed page height
or create an internal vertical scrollbar. Preserve keyboard access, focus states,
contrast, reduced-motion behavior, and text alternatives.

Prefer self-contained native HTML, CSS, SVG, Canvas, and JavaScript so the lesson
works offline. External HTTPS dependencies are allowed when they add real
capability; pin versions and provide a readable fallback. Never assume access to
the parent DOM, workspace APIs, local files, cookies, storage, or same-origin APIs.

Avoid decorative dashboards, generic sliders, and interactions that merely
restate visible text. A strong static table, diagram, quotation comparison, or
worked example is often the better document.

## Publish and audit

Edit `document.md` as the source of truth, then use the renderer supplied by
`derivon-workspace` to synchronize `index.html`. Audit only the changed documents:

```sh
node .agents/skills/derivon-document-authoring/scripts/audit-document-pages.mjs . <object-id>
node .agents/skills/derivon-document-authoring/scripts/audit-document-pages.mjs \
  --base-url http://127.0.0.1:8090/ --runtime <project-with-playwright> \
  . <object-id>
```

The static form checks publication basics. The browser form also checks narrow
layout, formula overflow, embedded vertical scrolling, and console errors.

Review correctness, source fidelity, graph-role fidelity, accessibility, and the
specific user request. Optional polish does not block completion. Once the frozen
scope passes its acceptance criteria and publication checks, stop.

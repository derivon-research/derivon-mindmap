# Authoring never connects by gesture

Creating a hyperedge is a menu operation, not a drag. The author searches for the tail
concepts, multi-selects them, single-selects the head, and sets the weight in a form; no
interaction anywhere in the authoring mode asks the author to drag one element onto
another to express a relationship. A future contributor looking at a graph editor will
assume drag-to-connect is missing by oversight. It is not: the interaction is structurally
unavailable, and adding it back would require reversing the two decisions below.

The whole-graph view lays concepts out with a force layout and draws each concept as a
point. A force layout gives no stable left/right or up/down, so there is no direction in
which "tails produce head" could be read off the canvas, and a point carries no card
geometry offering a tail port and a head port to aim at. A hyperedge with several tails
compounds both problems: the gesture would have to be multi-step and modal, and it would
have to stay legible while the layout keeps moving underneath it. Large graphs that are
genuinely authored — Obsidian vaults being the familiar case — are built through named
links and search, not through canvas gestures, for the same reason.

The menu path is not new. v0.4.2 already shipped it beside the gesture:
`DerivationForm.tsx` with `ConceptMultiSelect.tsx` for tails, `ConceptSingleSelect.tsx`
for the head, and `ConceptSearch.tsx` for finding a concept in a graph too large to scan.
The rewrite keeps that path and drops the gesture, rather than inventing an interaction.

## Consequences

The rendering module's event vocabulary loses everything that existed to support
gestures: connect, drag-end, marquee selection, context menu, pointer modifiers, and
client-to-graph coordinate conversion. What remains crossing the seam is selection and
activation.

Authoring throughput therefore depends on how good the menu path and Agent-assisted
authoring become, not on canvas manipulation. Issue #52 must be read with this in mind:
"连多尾超边" names the operation, not a gesture.

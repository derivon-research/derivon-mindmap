# The overview is not meant to be readable

The whole-graph overview lays every concept out with a force layout, draws each as a
point, and does not draw derivations as nodes at all. At the scale Derivon targets this is
not a legible diagram and is not trying to be. Its job is to convey that the user is
standing inside a large knowledge territory, and to light up a neighbourhood under the
cursor so that moving around feels like navigating rather than paging. Reading happens
elsewhere: in the neighbourhood view, which is a one-step dagre layout of knowledge cards
with derivations drawn explicitly, and along a route.

This is recorded because the overview looks like a defect. A contributor will read the
tangle, conclude that the layout is broken, and set out to make it readable — by
reintroducing a hierarchical layout below some concept count, by drawing derivations as
intermediate nodes, or by preserving detail the view does not need. Each of those buys
legibility the view is not asking for and pays for it in the budget the view actually has
to meet.

## Consequences

Aggressive level-of-detail reduction and viewport culling in the overview are aligned with
its purpose, not a degradation of it. `e75d825b`, "preserve full graph detail", defended a
property v1 does not want; its motivation does not carry over.

The overview's binding constraints are time to interactive and hover responsiveness. Visual
fidelity is not one of them.

There is one whole-graph layout. The pre-v1 scheme of switching to a hierarchical layout
below roughly four hundred concepts is abandoned, so no code needs to decide which layout
the whole graph gets.

Because nothing in the overview has to be read, no application state needs to be rendered
into it beyond the marks a user sets deliberately — targets and known concepts. Route
highlighting in particular belongs to the route view, not here.

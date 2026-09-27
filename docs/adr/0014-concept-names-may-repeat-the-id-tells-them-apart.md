# Concept names may repeat; the id tells them apart

## Status

Accepted. It revises the glossary entries 对象元数据 and 对象 ID: an author may choose and
change an object id, and the id appears in the interface.

## Context

One name often covers several definitions. The determinant can be defined by its three
properties or through alternating forms. A characteristic polynomial can be det(A − λI) or
det(zI − T), and a derivative can be a limit or the formal derivative of a polynomial. A
derivation reaches exactly one of them. A later derivation that needs a different definition
has to go through the equivalence between the two, so each definition must be its own concept.

Nothing in `derivon.workspace/v1` requires unique names, but the authoring rules did. In a
graph with several such pairs, that pushed the qualifier into the name itself: 性质定义的行列式,
复凯莱–哈密顿定理, 内积格拉姆–施密特. No text uses these names, and they spend the one line
the canvas has for a name (about 8 CJK characters) on telling concepts apart instead of naming
them.

## Decision

- **The name is what the subject calls the concept, and two concepts may share it.** The
  application and its tools must not require names to be unique.
- **The id is what tells concepts apart.** The application still mints an opaque id such as
  `c-k7f3q2` when the author gives none. An author may choose an id, or change it later, to
  make it readable, for example `determinant-by-properties` beside `determinant-of-operator`.
- **Changing an id is one operation that updates every place that names it.** That covers the
  manifest entry, every hyperedge tail and head, every document link, the document directory,
  the orientation configuration, and the learner records on this machine. There is no partial
  rename and no alias table.
- **The description says which definition or case the concept is.** When the name is shared, it
  also says how this concept differs from the others with that name.
- **Equivalence between definitions is a derivation.** Each proved direction is its own
  hyperedge, which may form a cycle.
- **Wherever a shared name is shown, a distinguishing cue is shown with it.** The canvas already
  prints the id under the name. Pickers, search results, route steps and exported textbook
  titles show the description, or the id when there is no description.

## Considered options

- **Unique names with a qualifier inside the name.** This is the practice being replaced. It
  produces names no text uses, and the qualifier takes most of the room the canvas has.
- **A separate qualifier field on the concept.** It would add a field to the workspace protocol
  for something the description already carries, since the description exists for pickers and
  lists.
- **Ids that can never change.** A readable id is what tells two same-named concepts apart on
  the canvas, and generated ids cannot do that. Making the id editable is the smaller cost.

## Consequences

- A learner record on another machine is keyed by the old id and cannot be updated by a rename
  here. Under ADR-0012 such a record is kept, not deleted, and the learner is assessed again. An
  author sharing a workspace should expect this when renaming.
- The authoring surfaces need an id editor and a rename that covers all the places above. The
  script command surface needs the same rename as a command.
- Tools that match text to concepts by name must offer every concept with that name, together
  with its description. They must not refuse the match or pick one silently.

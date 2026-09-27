# Concept names may repeat; a description and an optional qualifier tell them apart

## Status

Accepted. It adds the optional field `points[].data.qualifier` to `derivon.workspace/v1`.

## Context

One name often covers several definitions. The determinant can be defined by its three
properties or through alternating forms. A characteristic polynomial can be det(A − λI) or
det(zI − T). A derivative can be a limit or the formal derivative of a polynomial. A derivation
reaches exactly one of them. A later derivation that needs a different definition has to go
through the equivalence between the two, so each definition must be its own concept.

`derivon.workspace/v1` never required unique names, but the authoring rules did. In a graph with
several such pairs, the rule pushed the qualifier into the name itself: 性质定义的行列式,
复凯莱–哈密顿定理, 内积格拉姆–施密特. These are names no text uses. They also spend the one line
the canvas has for a name (about 8 CJK characters) on telling concepts apart instead of naming
them.

## Decision

- **The name is what the subject calls the concept, and two concepts may share it.** The
  application and its tools must not require names to be unique.
- **The id stays an opaque, application-minted identity that never changes.** Telling
  same-named concepts apart is not its job. Learner records, the orientation configuration and
  cross-workspace references stay keyed by it.
- **The description says which definition or case the concept is.** When the name is shared, it
  also says how this concept differs from the others with that name. Pickers, search results,
  route steps and exported textbook titles show the description next to a shared name, and the
  canvas shows it on hover.
- **A concept may carry an optional qualifier**, a few characters such as 「三条性质」 or
  「交错型」. The canvas shows it under the name, and lists show it after the name. It is optional
  everywhere, and any concept may have one whether or not its name is shared. When two concepts
  share a name, the authoring tools advise adding a qualifier to each of them. They do not
  require one.
- **Equivalence between definitions is a derivation.** Each proved direction is its own
  hyperedge, which may form a cycle.

## Considered options

- **Unique names with the qualifier inside the name.** This is the practice being replaced. It
  produces names no text uses, and the qualifier takes most of the room the canvas has.
- **Readable, author-editable ids as the distinguishing cue.** A rename would have to update
  every reference at once. It still could not reach learner records on other machines, which are
  keyed by the id. Identity and presentation are separate concerns.
- **The description alone.** It is one sentence, and the canvas box has room for one short line.
  When two same-named concepts sit on the canvas together, the reader would have to hover over
  each of them. The qualifier covers that case, and a graph without shared names never needs it.

## Consequences

- `points[].data.qualifier` is an optional string. It is additive: existing workspaces stay valid.
  Validators that allow-list data fields must accept it.
- `validate` in the skills advises on shared names. It asks that the descriptions of the
  same-named concepts differ, and it suggests a qualifier for each of them. Text-to-concept tools
  such as crosslink offer every same-named concept with its qualifier and description. They must
  not refuse the match or pick one silently.

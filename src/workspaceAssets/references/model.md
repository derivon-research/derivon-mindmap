---
managed-by: derivon-mindmap-demo
reference-set: provisional-2026-08-25
status: provisional-operational-guide
---

# Derivon model and authoring-workspace mapping

**Status:** provisional operational guide
**Model reference set:** provisional-2026-08-25

Read this document before changing graph structure. It makes the current core
model explicit and maps it to the authoring manifest. For proofs and edge cases,
continue into `derivon-paper.md`. For motivation and worked intuition, read
`learning-route-hypergraph.md`.

## 1. Keep the layers separate

Derivon currently has three relevant layers:

1. **Core mathematical layer.** A weighted directed B-hypergraph. Core algorithms
   read points, hyperedges, tails, heads, and weights.
2. **Authoring layer.** Gives points and hyperedges stable IDs and object-owned
   documents. It interprets points as concepts and hyperedge payloads as written
   justification for one step.
3. **View layer.** Stores positions and replacement projections for displaying
   the graph. It is not part of reachability or cost semantics.

A field does not become part of the core merely because it is useful to an
editor. Labels, definitions, questions, explanations, HTML, materials, canvas
positions, and replacement views are application payload or presentation state.
The Rust core does not read them.

## 2. Core objects and notation

### Graph

A graph is

$$
G = (P, H).
$$

- $P$ is a set of **Points**.
- $H$ is an indexed family of **Hyperedges**.

"Indexed family" matters. Two hyperedges may have the same tail and head while
remaining distinct steps with different IDs, payloads, or weights. Storage must
not deduplicate them.

### Point

A Point $p \in P$ is opaque to the core. The authoring application interprets it
as a concept and gives it a label and document, but the core does not assume a
Point is a chapter, theorem, skill, fact, or container.

### Hyperedge

A Hyperedge is one atomic step

$$
h = (T(h), \operatorname{head}(h), w(h)),
$$

where:

- $T(h) \subseteq P$ is the **tail**, the complete set of jointly required
  premises;
- $\operatorname{head}(h) \in P$ is the single conclusion;
- $w(h) \ge 0$ is the cost of the whole step.

A B-hypergraph has one head per hyperedge. The tail may contain zero, one, or
many points.

The weight and written justification belong to the whole hyperedge. They cannot
in general be split among visual lines from each premise to the conclusion. For
example, these three steps can coexist:

$$
(\{A,B\},D,1),\quad (\{A\},D,5),\quad (\{B\},D,5).
$$

Trying to assign ordinary edge weights would require both individual edges to
cost 5 while their sum costs 1, which is impossible.

## 3. State, firing, closure, query, and derivation

### State

A State $K \subseteq P$ is the set of points currently available or obtained.
States only grow in the current core semantics.

### Firing a hyperedge

A hyperedge $h$ is executable in state $K$ exactly when

$$
T(h) \subseteq K.
$$

Firing it yields

$$
K' = K \cup \{\operatorname{head}(h)\}.
$$

All tail points must already be available. Firing does not consume premises.
Firing a step whose head is already present does not add a new point, though the
step remains a distinct stored object.

### Query

A Query is $(S,t)$:

- $S \subseteq P$ is the start set, facts already available for this particular
  query;
- $t \in P$ is the target.

The authoring manifest stores the global graph, not a query-specific start set.
Do not encode "this learner already knows A" by changing graph structure unless
it is intended as a universal relation.

### Empty tail is not the start set

$T(h)=\varnothing$ is legal. Since the empty set is a subset of every state, the
hyperedge can fire from any state after paying its weight. It expresses a
universal unconditional entry step in the graph.

This differs from $p \in S$:

- membership in $S$ is query- or user-specific and has no acquisition cost in
  that query;
- $(\varnothing,p,w)$ is graph-wide and obtains $p$ by executing a step costing
  $w$.

Never convert one into the other without an explicit application requirement.

### Closure

For selected hyperedges $R \subseteq H$ and start set $S$, the closure
$\operatorname{Cl}_R(S)$ is the least superset of $S$ closed under firing every
edge in $R$. Operationally, start with $S$, repeatedly fire every newly enabled
hyperedge, and stop when no point can be added.

A target is reachable under $R$ iff

$$
t \in \operatorname{Cl}_R(S).
$$

Closure is a least fixed point. It exists and is unique even when the graph has
cycles.

### Derivation

In the mathematical paper, a **Derivation** for query $(S,t)$ is a set of steps
$R \subseteq H$ such that $t \in \operatorname{Cl}_R(S)$. It is minimal when no
proper subset of $R$ still reaches $t$.

This terminology is easy to confuse with the authoring UI. The UI and document
paths currently call each individual hyperedge a "推导" or `derivation`, for
example `docs/derivation-h-1/document.md`. Mathematically:

- one stored `graph.hyperedges[i]` is a **Hyperedge**, one step;
- a complete route may require a **Derivation**, a set of several Hyperedges.

When ambiguity matters, use "hyperedge/step" for one manifest object and
"derivation set/route" for the whole witness.

### Executable order

A derivation set is not necessarily a linear path. An executable order is a
permutation of its hyperedges in which every step's tail is available from $S$
and the heads of earlier steps. Closure construction can produce such an order.
Global topological sorting is neither required nor always possible.

## 4. AND and OR without group objects

AND and OR are encoded structurally; they are not persisted objects.

### AND: one hyperedge with several tails

$$
(\{A,B\},D,w)
$$

means A **and** B are jointly required to obtain D in this step. In the manifest:

```json
{
  "id": "h-ab-d",
  "weight": 3,
  "tails": ["A", "B"],
  "head": "D",
  "data": {
    "document": "docs/derivation-h-ab-d",
    "format": "markdown"
  }
}
```

Do not replace this with two hyperedges `A -> D` and `B -> D`; that changes the
meaning to two independent alternatives.

### OR: separate hyperedges

$$
(\{A\},D,w_1),\quad (\{B\},D,w_2)
$$

means D has two alternative ways in. Store two hyperedges with separate IDs and
documents. Hyperedges may even share the same tails and head when they represent
distinct justifications or costs.

Do not merge alternatives into one tail set. `tails: ["A", "B"]` means both,
not either.

## 5. Worked firing example

Let

$$
S=\{A\}
$$

and let the graph contain:

$$
(\{A\},B,3),\quad
(\{B\},D,1),\quad
(\{B\},E,1),\quad
(\{D,E\},Z,1).
$$

One executable sequence is:

1. Start $K_0=\{A\}$.
2. Fire $\{A\}\to B$: $K_1=\{A,B\}$.
3. Fire $\{B\}\to D$: $K_2=\{A,B,D\}$.
4. Fire $\{B\}\to E$: $K_3=\{A,B,D,E\}$.
5. Fire $\{D,E\}\to Z$: $K_4=\{A,B,D,E,Z\}$.

The final step is one AND step. B is shared by two branches and is not consumed.
The complete derivation set contains four hyperedges; it is not an ordinary path.

## 6. Cycles and reachability

Cycles are legal in the core graph. They are not, by themselves, proof of
circular reasoning or invalid storage.

An ungrounded cycle cannot start itself. If the only ways to get A and B are
$A\to B$ and $B\to A$, then neither enters $\operatorname{Cl}(\varnothing)$.
If an external start point or another hyperedge provides A, both may become
reachable. Thus reachability is query-dependent.

Review consequences:

- do not automatically delete a cycle;
- determine whether a concrete query gives it an external entry;
- flag a derivation document that assumes its own conclusion even if another
  valid route happens to ground the same graph cycle;
- distinguish mathematical graph legality from pedagogical quality.

The paper documents why acyclicity was removed and why naive dangling-cycle
checks can be wrong.

## 7. Cost semantics

The persisted weight is a non-negative safe integer in the authoring schema and
belongs to an entire hyperedge. The core consumes weight; the application layer
must decide how to estimate and calibrate it.

There are three different route costs in the current paper:

1. **Set cost** charges each selected hyperedge once. Shared prerequisites are
   paid once. This is the intended total-work semantics, but exact optimization
   is NP-hard.
2. **Tree cost** recursively sums premise costs. Unfolding shared prerequisites
   repeats them, so it is a polynomial-time upper bound.
3. **Depth cost** takes the maximum premise branch plus the current step. It
   models critical-path time under unlimited parallelism and is a polynomial-time
   lower bound.

For non-negative weights:

$$
d_{\mathrm{depth}}(S,t)
\le C^*_{\mathrm{set}}(S,t)
\le d_{\mathrm{tree}}(S,t).
$$

Do not call tree cost the exact shared-prerequisite cost. Do not change weights
based only on document length unless the user has chosen that application-level
calibration rule. Positive transfer is represented by an additional lower-cost
hyperedge with the enabling knowledge in its tail, not by a negative weight.

## 8. Mapping to `.derivon/workspace.json`

The current manifest schema is `derivon.authoring/v0.2.0`.

| Manifest data | Layer | Meaning |
| --- | --- | --- |
| `graph.points[].id` | core identity | stable point ID |
| `graph.points[].data` | authoring payload | label and owned concept document |
| `graph.hyperedges[].id` | core identity | stable identity of one indexed hyperedge |
| `graph.hyperedges[].tails` | core | complete AND premise set |
| `graph.hyperedges[].head` | core | single conclusion point |
| `graph.hyperedges[].weight` | core | non-negative whole-step cost |
| `graph.hyperedges[].data` | authoring payload | document justifying the whole step |
| `view.positions` | view | canvas coordinates only |
| `view.replacements` | view | visual abstraction/projection only |

A replacement does not add reachability, imply equivalence, contract a module,
or preserve cost. Core algorithms ignore it.

Each point or hyperedge owns one unique document directory. The directory is
payload storage, not object identity and not a relation. Relations exist only in
`tails` and `head`.

## 9. Structural-edit decision table

| Intended meaning | Correct representation |
| --- | --- |
| A alone can derive D | one hyperedge with `tails: ["A"]`, `head: "D"` |
| A and B are both required for D | one hyperedge with `tails: ["A", "B"]` |
| Either A or B can independently derive D | two hyperedges sharing head D |
| Two different arguments derive D from A | two indexed hyperedges with tail A and separate documents |
| D can be obtained without prior points at cost w | one empty-tail hyperedge to D |
| D is already known for one query | include D in that query's start set; do not edit the graph |
| One step yields several heads | consult paper multi-head encoding; do not add a non-schema `heads` field |
| Hide details behind a visual concept | use `view.replacements`, but do not claim semantic folding |
| Lossless module contraction | consult paper module section; current view replacement is insufficient |

## 10. Document-review semantics

A point document explains the application meaning of one point. A hyperedge
document must justify why **all and only** its tail concepts jointly support its
head for that step.

When reviewing one hyperedge:

1. Treat tail documents as available premise material.
2. Treat the hyperedge document as the argument to audit.
3. Treat the head document as the target meaning, not as evidence.
4. A concept relied upon as external knowledge but absent from all tails is a
   candidate missing prerequisite.
5. A locally introduced definition, standard primitive, or cited external fact
   is not automatically a missing graph point.
6. A listed tail never used in the argument may be a stale or over-constrained
   premise.
7. If the prose offers alternatives, verify they are separate hyperedges rather
   than accidentally encoded as an AND tail.

Graph validity and argument validity are different. A schema-valid hyperedge can
have a bad proof document; a well-written document can still disagree with its
manifest relation.

## 11. Boundaries and unsettled areas

The current core does not define:

- what real-world entity a Point must represent;
- how fine or coarse point boundaries should be;
- how application payload becomes a calibrated weight;
- learner forgetting, review, or transfer dynamics;
- arbitrary semantic containment between concepts;
- lossless folding for arbitrary subgraphs.

Do not manufacture rules for these topics. Read the relevant paper/blog section,
state what is currently open or application-specific, and ask for the user's
intended policy when an edit depends on it.

## 12. When this guide is not enough

Read `.derivon/agent/references/README.md` and then the relevant source material.
Model ambiguity is a reason to inspect sources, not a reason to substitute an
ordinary directed-graph mental model. If the sources still disagree or omit the
case, report that explicitly before structural edits.

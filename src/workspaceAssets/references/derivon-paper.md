---
managed-by: derivon-mindmap-demo
source-kind: working-paper
source-repository: https://github.com/derivon-research/paper
source-file: README.md
snapshot-date: 2026-08-25
status: provisional-model-reference
---

> Bundled snapshot of the current Derivon paper. Consult this file for formal
> definitions, proofs, cost semantics, algorithmic claims, and known limitations.
> It is a working draft, not yet the future official documentation.

# Derivon Core: A Weighted Directed B-Hypergraph Model for Cost-Optimal Derivation

**Status:** working draft, v6 · **Machine-checked:** `verification/`

---

## Abstract

We model *derivation under cost* — reaching a target state from a known state through a
sequence of steps that each cost something and each require verification — as a weighted
directed B-hypergraph `G = (P, H)`, where a hyperedge `h = (T, y, w)` asserts that the
conjunction of premises `T ⊆ P` yields conclusion `y ∈ P` at cost `w ≥ 0`.

This model is obtained by stripping every domain-specific commitment from an earlier
concept-graph formulation designed for learning-path optimisation. The stripping is not
cosmetic: we show that it (i) eliminates two object types — AND-groups and OR-groups —
via an explicit bijection, (ii) makes a previously assumed acyclicity axiom unnecessary,
and (iii) exposes a sharp complexity boundary that the earlier formulation could not even
state.

The central negative result is that the cost measure the application actually wants —
*shared prerequisites are paid for once* — is NP-hard and inapproximable within
`(1 − o(1)) ln n`, whereas the two measures admitting Dijkstra-style greedy solution
systematically misprice sharing. We give a bracketing theorem that sandwiches the
intractable quantity between two polynomial-time bounds, and observe that the width of
that bracket is itself a useful diagnostic.

All propositions below are accompanied by machine verification; three defects found by
that verification are documented in §8.

---

## 1. Motivation and Scope

The model originates from a concrete question: given what a learner already knows, find
the lowest-cost route to a target concept. An earlier formulation (*v5.1*, described
informally in [an accompanying essay](https://v3n0.top/post/2026/everything-is-concept/))
answered this with a recursive concept graph carrying AND/OR derivation plans.

That formulation had a structural problem. Its derivation payload — motivation, argument,
supporting material — had been shown to belong to an entire AND-group rather than to any
single edge. The same argument applies to *weight*, and once weight and payload share a
carrier, maintaining both "plan" and "edge" as first-class objects is redundant.

Pushing that redundancy out is what produced the present model. The scope widened as a
side effect: nothing in the resulting structure is specific to learning. The same object
describes hardware design iteration (nodes are verified design states, cost is
implementation plus simulation plus rework), agent planning (nodes are achieved states,
cost is execution), and proof search (nodes are lemmas, cost is proof length).

**Admission rule for the core layer.** An attribute may enter the core only if one of the
three core algorithms reads it: reachability decision, minimum-cost solving, executable
ordering. Under this rule `definition`, `question`, `answer`, and `materials` all leave;
`w` stays.

---

## 2. The Model

**Definition 1 (Graph).** `G = (P, H)` where `P` is a set of *points* and `H` an indexed
family of *hyperedges* `h = (T(h), head(h), w(h))` with `T(h) ⊆ P`, `head(h) ∈ P`,
`w(h) ≥ 0`. The empty tail is admissible and denotes an unconditional entry point.

**Definition 2 (Firing).** `h` is executable in state `K ⊆ P` iff `T(h) ⊆ K`; firing
yields `K ∪ {head(h)}`.

**Definition 3 (Closure).** For `R ⊆ H` and `S ⊆ P`, `Cl_R(S)` is the least `X ⊇ S`
closed under `R`: for all `(T, y, w) ∈ R`, `T ⊆ X ⟹ y ∈ X`.

**Definition 4 (Derivation).** `R ⊆ H` is a derivation for query `(S, t)` iff
`t ∈ Cl_R(S)`; it is *minimal* if no proper subset is. When every `h ∈ R` satisfies
`|T(h)| ≤ 1`, a minimal derivation is a chain and the structure degenerates to an
ordinary path.

`H` is an *indexed family*, not a set: two hyperedges may share tail and head while
carrying different application payloads, and collapsing them would destroy the ability to
distinguish alternative justifications. A solver may internally deduplicate by `(T, head)`
keeping minimum `w` — this preserves the optimum under every cost measure below — but
storage must not.

AND and OR are not objects. Conjunction is `|T(h)| > 1`; disjunction is two hyperedges
sharing a head.

---

## 3. Reductions from the Concept-Graph Formulation

**Proposition 1 (OR-groups are eliminable).** The plan set `𝒫(v) ⊆ 2^In(v) \ {∅}` of the
earlier formulation is in bijection with the set of hyperedges having head `v`.

*Proof.* An edge is identified by its `(source, target)` pair, so a plan `P ⊆ In(v)`
determines and is determined by its source set. Take `Φ(P) = ({source(e) : e ∈ P}, v)`
with inverse `Φ⁻¹(T, v) = {(p, v) : p ∈ T}`; the two are mutually inverse. Conjunction
within a plan corresponds to the tail being required as a whole; disjunction between
plans corresponds to distinct hyperedges sharing a head. ∎

The projected-edge object of the earlier formulation is likewise redundant: it is the
pointwise expansion of `Φ⁻¹` and is recomputable on demand.

**Proposition 2 (Weight cannot live on edges).** There is in general no
`w_e : E → ℝ≥0` with `w(h) = Σ_{p ∈ T(h)} w_e(p → head(h))`.

*Proof.* Take `({A,B}, D, 1)`, `({A}, D, 5)`, `({B}, D, 5)`. Edge-level decomposition
requires `w_e(A→D) + w_e(B→D) = 1` together with `w_e(A→D) = 5` and `w_e(B→D) = 5`,
i.e. `10 = 1`. The least-squares residual of the system is `5.196 > 0`. ∎

The counterexample is not contrived: it describes strong combination effects, where each
premise alone is expensive. Independently, even absent competing hyperedges there is no
canonical split of `w(h)` among premises, and an edge shared by two hyperedges would be
forced to take two values simultaneously.

**Proposition 3 (Acyclicity is unnecessary).** `Cl_H(S)` exists and is unique regardless
of cycles in `G`, and points supported only cyclically never enter it.

*Proof.* `Fire(K) = K ∪ {y : (T,y,w) ∈ H, T ⊆ K}` is monotone on the finite lattice
`2^P`; least fixed point existence and uniqueness follow from the Knaster–Tarski theorem
[5]. For the second claim, take `P = {A,B,D}`, `H = {({A},B,1), ({B},A,1), ({D},A,1)}`:
`Cl(∅) = ∅` while `Cl({D}) = {A,B,D}`. ∎

This is strictly more permissive than an acyclicity axiom, which is a *global* structural
prohibition and therefore rejects graphs containing legitimate mutually-derivable pairs.
The cost is that a cycle degrades from a syntax error to a silent unreachability, which
must be compensated by a diagnostic (§7).

---

## 4. Reachability

Reading `(T, y, w)` as the Horn clause `⋀_{p∈T} p ⟹ y` and `S` as a fact set, `Cl_H(S)`
is exactly the unique minimal model of the resulting Horn program. Reachability is
therefore decidable in `O(Σ_h (|T(h)| + 1))` by counter-based forward chaining [2].

Directed hypergraphs, Horn clauses, AND/OR graphs and context-free derivations are four
notations for one structure [3, 8]; this model selects the most compact of them as
implementation substrate.

Ordering is by *executable sequence* rather than topological sort: a permutation
`h₁ … h_k` of `R` such that each `hᵢ` is executable in `S ∪ {head(h_j) : j < i}`. The
round-wise closure construction produces one, so every derivation admits at least one,
and no global acyclicity assumption is needed.

---

## 5. Cost Semantics

Two axioms precede every result in this section, and neither is a fact:

- **A1 (Additivity).** Total cost aggregates from step costs by a fixed rule.
- **A2 (Non-negativity).** `w(h) ≥ 0`.

Real cognitive cost violates A1 through fatigue, interference and forgetting. Positive
transfer — learning `A` making `B` cheaper — is properly negative cost, which A2 forbids;
it must instead be encoded as an additional lower-weight hyperedge premised on `A`.

### 5.1 Three measures

| Measure | Definition | Semantics |
|---|---|---|
| Set cost `C*_set` | `min_R Σ_{h ∈ R} w(h)` | each hyperedge charged once; **shared prerequisites paid for once** |
| Tree cost `d_tree` | `d(y) = min_h [ w(h) + Σ_{p∈T(h)} d(p) ]` | derivation unfolded to a tree; sharing charged repeatedly |
| Depth cost `d_depth` | `d(y) = min_h [ w(h) + max_{p∈T(h)} d(p) ]` | critical path; completion time under unbounded parallelism |

Set cost is the semantically intended one. The other two are *superior functions* in
Knuth's sense [1] — monotone non-decreasing in each argument and no smaller than any
argument — hence solvable by generalised Dijkstra in `O(‖G‖ log |P|)`.

Set cost admits no such local recurrence: whether branch `D` must pay for `B` depends on
whether branch `E` has already bought it, so cost is not a function of the branches' costs
but of the globally selected edge set.

### 5.2 Bracketing theorem

**Proposition 4.** For `w ≥ 0`,
`d_depth(S,t) ≤ C*_set(S,t) ≤ d_tree(S,t)`,
with equality throughout when every `|T(h)| ≤ 1`.

*Proof.* Right: let `𝓜` be the multiset of hyperedges used by the optimal tree solution;
its support is a valid derivation and charging duplicates once cannot increase the total.
Left: on an optimal `R`, the longest chain uses pairwise distinct hyperedges (the least
fixed point induces a well-founded firing order), so its weight sum is at most
`Σ_{h∈R} w(h)`, and the global minimum depth is at most that. Degenerate case: a minimal
derivation is a chain, so no sharing arises and the three definitions coincide. ∎

Verified by exhaustive cross-check on 1753 reachable random queries, 67 with strict
inequality.

### 5.3 Hardness

**Proposition 5.** Computing `C*_set(S,t)` is NP-hard, and inapproximable within
`(1 − o(1)) ln n` unless NP admits slightly superpolynomial algorithms.

*Proof.* Reduce from Set Cover. Given universe `Ω = {q₁ … qₙ}` and family `V₁ … V_m`,
build start `z`, target `t`, and hyperedges `({z}, x_j, 1)` per subset,
`({x_j}, q_i, 0)` whenever `q_i ∈ V_j`, and `({q₁ … qₙ}, t, 0)`. Reaching `t` requires
every `q_i`, so the chosen `x_j` must cover `Ω`, and the total cost equals the number of
chosen subsets. The construction is polynomial and approximation-preserving; the
inapproximability threshold [6] transfers. ∎

Verified exact against brute-force Set Cover on 60 random instances.

That optimal-hyperpath cost ranges from linear-time to NP-hard depending on the chosen
measure is known in general [4]; the intended measure here falls at the hard end.

### 5.4 Solver strategy

1. Compute `d_depth` and `d_tree` (two generalised-Dijkstra passes). If equal, `C*_set`
   is pinned — return without search.
2. Otherwise search, using the tree-cost solution as initial upper bound and `d_depth` as
   an admissible heuristic (consistency unproven; fall back to branch-and-bound).
3. On budget exhaustion return the interval `[d_depth, d_tree]` marked non-converged.
   **Never substitute `d_tree` for an exact value.**

**Why the hardness result is not disabling.** The upper bound is not merely a number: the
tree-cost optimum *is* a concrete executable derivation. The procedure is therefore an
anytime algorithm — at every moment it holds a recommendable route together with a proven
bound on how far that route can be from optimal. A deployed system needs a good route, not
a certificate of optimality, so step 1 alone already delivers the product requirement
whenever the bracket closes.

### 5.5 How tight is the bracket in practice

The bracketing theorem bounds `C*_set` but is silent on the width of the interval, which is
what decides whether the strategy above is worth anything. Measured in
`verification/bracket_practice.py`:

**On random hypergraphs the interval almost always closes.** Over several hundred reachable
queries per configuration, the fraction requiring any search at all is 0% at `maxtail = 1`
(no confluence, hence no sharing) and 1–3% at `maxtail = 2..4`; where the upper bound is
inexact it overestimates by ~1.35x on average. So in 97–99% of random queries the cheap
upper bound is already the exact optimum.

**But random graphs lack the structure the model actively encourages.** Random sampling
rarely produces the shape that matters: one point serving as common prerequisite to several
branches that later rejoin. Building that shape deliberately — a high-compression hub `X`
reused by `k` branches, with the target requiring all of them — the interval widens
monotonically:

| branches `k` | hub cost | `d_depth` | `C*_set` | `d_tree` | width | upper bound |
|---|---|---|---|---|---|---|
| 2 | 2 | 4 | 5 | 7 | 3 | 1.40x |
| 3 | 8 | 10 | 12 | 28 | 18 | 2.33x |
| 5 | 2 | 4 | 8 | 16 | 12 | 2.00x |
| 5 | 8 | 10 | 14 | 46 | 36 | 3.29x |

More branches and a more expensive hub both widen the gap — and both are exactly what
"the intermediate abstraction is a good one" looks like.

**Consequence worth recording explicitly: the bracket width is simultaneously the graph
quality signal and the instance hardness signal.** They are the same quantity. A graph that
looks the way the model wants it to look — heavy reuse, many alternative routes — sits
nearer the hard end. The reassurance "real graphs will be small enough" is therefore really
"real graphs will stay sparse and tree-like", and succeeding at the modelling goal pushes
them the other way. This is not a reason for present concern, but it does mean the thing to
measure is not graph size but branch-and-bound behaviour on hub-shaped instances.



---

## 6. Expressiveness

**Multi-head encoding.** "`T` jointly yields `y₁ … y_k` at cost `w`" encodes as
`(T, p⋆, w)` plus `({p⋆}, yᵢ, 0)`. Faithful under reachability and set cost; **not**
faithful under tree cost, which charges `p⋆` once per head (verified: set cost 4, tree
cost 8). The core therefore retains single heads.

**Semiring generalisation.** Replacing `(min, +)` yields reachability (Boolean),
most-likely derivation (Viterbi), or derivation counting [10]. Generalised Dijkstra
applies only to superior functions; other semirings require fixed-point iteration. The
recommendation is to parameterise the weight type but implement only `(min, +)` initially.

**Counting is hard.** Counting minimal derivations reduces from counting minimum set
covers, and the number of minimal derivations can grow exponentially. Any
"understanding multiplier" defined as route counting is therefore infeasible and must be
replaced by a controllable surrogate.

---

## 7. Module Layer (optional)

Folding contracts a module `H_M ⊆ H` with internal points `Pts_M`, root `r` and entrance
set `I` into a single point `M`, emitting one boundary hyperedge `(I_k, M, ω_k)` per
disjunct of the boundary formula `Bnd_M`, where `ω_k` is the internal minimum cost of
deriving `r` from `I_k`.

The hypergraph representation absorbs one earlier condition automatically — AND/OR
boundary semantics survive because a boundary is simply a set of hyperedges — at the price
of an explicit exponential: the number of boundary hyperedges equals the number of DNF
terms of `Bnd_M`, so `⋀_{i=1}^{k}(I_{i,1} ∨ I_{i,2})` needs `2^k` of them.

Two of the earlier formulation's nine folding conditions are provably **necessary** under
set cost:

| Case | Measured | Conclusion |
|---|---|---|
| Single exit, internals not externally reused | exact 7, folded 7 | faithful |
| External consumption of an internal point | exact 5; folded either unreachable or 7 | derivability lost — single exit necessary |
| Two modules sharing internal hyperedges | exact 12, folded 22 | shared prerequisite double-charged — disjointness necessary |

This relocates a constraint that had been stated as a global axiom ("no partial
intersection between recursive branches"). It is not an arbitrary engineering convenience;
it is what makes folding cost-faithful — and it constrains **only the module layer**, not
the core graph, where points may freely share premises. Modular decomposition theory [9]
gives the strict but very strong reference condition, which arbitrary sub-hypergraphs do
not satisfy; folding cannot be assumed lossless.

Recommendation: ship the *validator* (single exit, disjointness, DNF size) before shipping
folding itself.

---

## 8. Verification

```
verification/verify_v6.py     # Propositions 1–5: cycle safety, bracketing (exhaustive
                              # cross-check), degeneracy, Set Cover reduction, multi-head
verification/verify_v6b.py    # folding fidelity, impossibility of edge-level weights,
                              # DNF blow-up
verification/cycle_demo.py    # benign vs. ungrounded cycles; dangling-point criterion
verification/bracket_practice.py  # bracket tightness: random graphs vs. hub-shaped graphs
verification/verify_core.py   # branch-and-bound cross-checked against the exhaustive oracle
```

Run with `python3 verify_v6.py` (no dependencies). Every claim above is asserted, not
merely printed.

`derivon_core.py` at the repository root is the reference implementation intended for real
graphs: counter-based linear-time closure, both Knuth bounds, and branch-and-bound for set
cost with full instrumentation (nodes expanded, prunes, elapsed, whether optimality was
proven). `verification/verify_core.py` cross-checks it against the exhaustive oracle in
`verify_v6.py` — 1325 random queries agree exactly, of which 97% close without any search.
That cross-check is the only thing standing between "fast" and "fast but wrong".

**Three defects were found by verification, and are worth recording.**

*A genuine bug.* The generalised-Dijkstra implementation seeded its priority queue from
the start set only. With an empty start set and empty-tail hyperedges present, the queue
began empty, the loop never ran, and unconditional entry points never fired — while the
closure function and brute force both returned correct results. The degeneracy test had
generated `|T| = 1` exclusively and never exercised `|T| = 0`. The regression now includes
an assertion that Dijkstra and closure agree on reachability, which is what catches this
class of error.

*A wrong criterion.* Detecting "points the graph claims to derive but derives only
circularly" by asking "assume everything except this point is known" is defeated by the
cycle itself: the two members prop each other up. It both false-positives on legitimate
entry points and misses the actual bad cycle. The correct criterion computes the closure
from points of in-degree zero.

*Wording defects invisible to tests.* Stating an edge-level property at point level
("each point has at most one premise" — a point may have many incoming hyperedges; those
are OR alternatives); using one word for both a single step and a whole derivation;
using `T` for both *tail* and *target*. The code was correct throughout; only prose was
wrong. These are found by reading, not by running.

---

## 9. Open Problems

1. **Making weights commensurable.** Producing a number for `w` is an application-layer
   concern and has several workable implementations — measured effective study time, LLM
   scoring on a fixed scale, or, most crudely, the length of the explanatory text a step
   requires. The core never produces `w`; it only consumes it, so this is by construction
   *not* a gap in the model. What remains is narrower and sharper: the model **sums** these
   numbers and **compares sums across routes**, which requires them to lie on a common
   additive scale. Study time is confounded by fatigue, motivation and interruption, and
   only the taken route is ever observed — never the counterfactual. LLM scores are
   typically non-linear, so a 7 is not seven times a 1. Text length is naturally additive
   but only a proxy, and it walks straight into the failure mode the earlier formulation
   warned about: an unargued shortcut has short text and low weight while carrying no
   derivation at all. The redeeming feature is that this is self-correcting — predicted and
   realised cost can be reconciled, so `w` is learnable and calibratable. **This is a
   machine-learning problem with a clear path, not a mathematical gap**; text length or LLM
   scoring suffices as a cold-start prior.
2. **Branch-and-bound behaviour on hub-shaped instances.** §5.5 shows random graphs close
   their bracket 97–99% of the time while deliberately-compressed graphs do not. The
   quantity to measure is therefore not graph size but how far search stretches on the
   structures the model encourages.
3. **Point-boundary criteria.** When should a point be split, or an intermediate point
   introduced? The core imposes no rule, but without one granularity is uncontrolled.
4. **Forgetting, review and transfer.** `S` decays over time and transfers across tasks;
   no interface is designed for this.
5. **A full semantics-preservation theorem for folding.** Two of nine conditions are shown
   necessary; joint sufficiency is unproven.

---

## References

[1] D. E. Knuth. *A generalization of Dijkstra's algorithm*. Information Processing
Letters, 6(1):1–5, 1977.

[2] W. F. Dowling and J. H. Gallier. *Linear-time algorithms for testing the
satisfiability of propositional Horn formulae*. Journal of Logic Programming,
1(3):267–284, 1984.

[3] G. Gallo, G. Longo, S. Pallottino, and S. Nguyen. *Directed hypergraphs and
applications*. Discrete Applied Mathematics, 42(2–3):177–201, 1993.

[4] G. Ausiello, G. F. Italiano, and U. Nanni. *Hypergraph traversal revisited: Cost
measures and dynamic algorithms*. MFCS 1998, LNCS 1450.

[5] A. Tarski. *A lattice-theoretical fixpoint theorem and its applications*. Pacific
Journal of Mathematics, 5(2):285–309, 1955.

[6] U. Feige. *A threshold of ln n for approximating set cover*. Journal of the ACM,
45(4):634–652, 1998.

[7] J.-P. Doignon and J.-C. Falmagne. *Knowledge Spaces*. Springer, 1999.

[8] A. Martelli and U. Montanari. *Additive AND/OR graphs*. IJCAI 1973, pp. 1–11.

[9] M. Habib and C. Paul. *A survey of the algorithmic aspects of modular decomposition*.
Computer Science Review, 4(1):41–59, 2010.

[10] J. Goodman. *Semiring parsing*. Computational Linguistics, 25(4):573–605, 1999.

---

## Companion Writing

- [万物皆概念：如何最大化学习速度？](https://v3n0.top/post/2026/everything-is-concept/) — the
  originating formulation and its motivation.
- [学习效率的矛盾分析与学习路线的数学建模](https://v3n0.top/post/2026/everything-is-point/) — the
  narrative account of how this model was arrived at.

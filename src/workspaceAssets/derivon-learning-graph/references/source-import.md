# Source import and cross-course merging

Use this workflow to turn one or more books, courses, syllabi, or note collections
into a Derivon learning graph. The goal is representative graph structure, not a
page-by-page transcription of the sources.

## Freeze the import contract

Before extraction, record the sources, intended audience, covered range, desired
granularity, and whether the task is a new graph or a merge. Decide what a point
means in this project. Do not let different source workers silently use different
notions of "concept."

For a large import, detect whether the platform provides SubAgents, delegated
workers, parallel agents, or an equivalent capability. When available, use them
for bounded source extraction and local candidate clusters. The main Agent owns
the canonical point registry, cross-source merges, manifest integration, and
final validation. When isolation is unavailable, delegated workers return
candidate tables or patches rather than concurrently editing the manifest.

## Extract candidates before writing documents

For each source section, collect:

- candidate reusable concepts or established claims;
- exact definitions, scope, conventions, and aliases;
- arguments, constructions, experiments, or learning steps that may become
  hyperedges;
- the complete prerequisites actually used by each candidate step;
- source locations and explicit uncertainty;
- chronology, influence, citation, contrast, or containment relationships that
  may be useful but are not necessarily derivations.

This is an evidence packet, not lesson prose. Do not ask extractors to generate
chapter documents or assign final global IDs.

## Reconcile point identity

Maintain one canonical registry while merging sources. Compare candidates by
meaning rather than label:

- same statement and scope: merge and retain aliases/provenance;
- same informal idea but different domain or convention: keep a scoped canonical
  form only if the difference can be stated without changing the claim;
- materially different truth conditions or inferential role: keep variants as
  separate points;
- uncertain: keep provisional candidates separate and record the open decision.

A chapter, thinker, school, historical period, or source section may be useful
for navigation without being a derivable state. Do not force it into a Point
unless the project has explicitly defined the corresponding state of
understanding or claim.

## Reconcile relationship semantics

Classify every proposed relation before encoding it:

- **Derivation or learning dependency:** the tails jointly enable or justify the
  head through a stated step. This may become a hyperedge.
- **Alternative route:** another sufficient step to the same head. Store a
  separate hyperedge.
- **Equivalence or translation:** encode directed zero- or low-cost steps only
  when each direction is genuinely justified under the recorded scope.
- **Historical influence, chronology, citation, opposition, similarity,
  membership, or thematic association:** not a Derivon hyperedge by default.
  Preserve it in provenance or an import report and identify the need for a
  separate relation/view feature if navigation requires it.

This distinction is especially important in philosophy, history, literature,
and other humanities. "Hume influenced Kant" is historical evidence, not a
claim that knowing Hume logically derives Kant. A valid learning hyperedge might
instead document that understanding a particular Humean problem, together with
specified background concepts, enables understanding Kant's response.

## Form atomic hyperedges

For each derivational candidate:

1. State the head without using it as a premise.
2. List only the jointly necessary reusable tails.
3. Explain the one move supplied by the hyperedge itself.
4. Split independently reusable intermediate results into points.
5. Preserve distinct source arguments as parallel hyperedges.
6. Assign and justify weight using `weight-calibration.md`.

Do not infer edges merely from source order. A book may present ideas in a
pedagogical sequence that differs from logical or learning dependency.

## Produce minimal object documents

After structure and weights are settled, create concise placeholders.

Point placeholder:

```markdown
# Canonical label

**Status:** placeholder

Accurate canonical definition or statement, including scope and conventions.

**Aliases / variants:** source-specific terminology or an explicit none.

**Sources:** exact chapters, sections, definitions, or other locations.

**Open questions:** unresolved identity or scope issues, if any.
```

Hyperedge placeholder:

```markdown
# Tail set -> head

**Status:** placeholder

Accurate summary of the step showing why all tails jointly support the head.

**Weight:** rating and short rationale under the shared calibration rubric.

**Sources:** exact theorem, argument, construction, section, or other location.
```

Adapt labels to the document language, but preserve the information. Do not add
generic motivation, invented examples, or decorative HTML to make placeholders
look finished.

## Accept the import

Run structural validation and the learning-graph audit. Review duplicate labels,
uniform weights, large tails, isolated points, high-cost steps, and parallel
routes as evidence. Completion means the frozen source range has been modeled,
uncertainties are explicit, documents are synchronized, and validation passes.
It does not require polished lesson prose.

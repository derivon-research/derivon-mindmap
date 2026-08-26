# Learning-cost weight calibration

## Meaning of one weight

For a hyperedge `h = (tails, head, weight)`, interpret `weight` as:

> the marginal cognitive effort required to understand and verify this one step,
> assuming every concept in `tails` is already mastered.

The value belongs to the whole joint step. It is not the total difficulty of the
head, the total course time, the number of source pages, or a separate value for
each visual connection.

## Continuous scale with 0-5 anchors

The persisted weight is a non-negative finite float with at most one decimal
place. The `0-5` learning rubric below supplies semantic anchors on a continuous
application-level scale; it is not an integer enum and it does not narrow the
Core schema's legal range.

For an initial source import, use integer or half-step estimates such as `2.0`,
`2.5`, or `3.0` when the evidence supports the distinction. Use tenths such as
`2.3` only after pairwise comparison, route evaluation, or other calibration
provides a reason for that precision. Never add decimal jitter merely to make a
distribution look varied, and never round an existing float to an integer without
a semantic reason.

| Weight | Operational anchor |
|---:|---|
| 0 | Definition unfolding, notation translation, or a genuinely immediate equivalence under the recorded scope. |
| 1 | Direct application of one mastered definition or result with no meaningful choice of method. |
| 2 | Routine combination of familiar facts or a short standard calculation. |
| 3 | A non-obvious observation, choice, interpretation, or construction is needed. |
| 4 | A key technique or substantial conceptual bridge that usually needs guided explanation. |
| 5 | A major learning unit or difficult argument whose understanding is itself a significant milestone. |

Values between anchors interpolate their meaning. For example, `2.5` is a mostly
routine combination containing a choice or observation that needs explanation;
`3.5` is clearly non-obvious and also forms a substantial conceptual bridge.

A rating of `4.0` or above triggers a granularity review: decide whether the step
hides a reusable intermediate point. Do not split it automatically when the move
is conceptually atomic despite being difficult.

## Rating rules

- Rate the step after assuming all tails, not the learner's entire journey to the
  tails.
- Importance is not cost. A foundational definition can have low weight.
- Document length is not cost. A terse document can describe a difficult move,
  and a long explanation can support an easy one.
- Tail count is evidence, not a formula. Several premises can combine routinely;
  one premise can require a deep transformation.
- Parallel hyperedges are rated independently. A longer source proof may be
  cognitively easier than a shorter proof with a surprising trick.
- Positive transfer is represented by an additional lower-cost hyperedge whose
  tails include the enabling knowledge, never by a negative weight.
- Treat one decimal place as fixed-point authoring precision. A Core
  implementation may multiply by ten and operate on integer cost units so sums do
  not accumulate binary floating-point error.
- Record a short rationale and `low`, `medium`, or `high` confidence in the
  hyperedge placeholder or import report. Confidence is authoring metadata, not a
  new core manifest field.

## Calibrate across a graph

Before rating at scale, select anchor hyperedges that clearly represent 0, 1, 3,
and 5 for the current audience. Compare uncertain steps against anchors and
against parallel routes. Use one audience assumption across the graph; a route
for experts and a route for beginners may need distinct calibration or distinct
application views.

## Interpret distributions without optimizing them

A concentrated distribution is not inherently defective. If hyperedges have
been deliberately normalized to comparable atomic learning steps, many or even
all weights may correctly be equal. Topology and the number of steps can still
differentiate route costs.

The same distribution has a separate experimental implication: it provides
limited coverage for testing whether variable weights change route selection.
Report that as a dataset-coverage limitation, not a semantic graph error. Do not
alter correct weights merely to exercise an algorithm; use additional realistic
routes or a dedicated benchmark dataset when variable-weight behavior needs
testing.

Exact values near one anchor can also create false variety. A set such as `1.9`,
`2.0`, and `2.1` should be inspected both as exact floats and as one anchor band.
Small differences count only when their rationales and route effects are real.

After an import batch:

1. inspect the exact one-decimal histogram, anchor-band distribution, and
   dispersion statistics;
2. investigate an all-equal or concentrated distribution without assuming it is
   wrong;
3. pairwise-compare a sample of adjacent ratings;
4. review every value at or above `4.0` for hidden intermediate points;
5. compare parallel routes for meaningful cost differences;
6. run route queries and inspect whether the selected paths match informed human
   judgment.

Change a rating when these comparisons expose inconsistency, not merely to make
the histogram look varied or improve a test metric. Record the reason for
material changes.

## Limits

This rubric is an initial application-level calibration, not an objective measure
of human cognition. Fatigue, forgetting, background knowledge, instructional
quality, and individual variation are outside the current scalar weight. Keep
those limitations visible when interpreting route costs.

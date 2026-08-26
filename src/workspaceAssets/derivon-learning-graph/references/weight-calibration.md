# Learning-cost weight calibration

## Meaning of one weight

For a hyperedge `h = (tails, head, weight)`, interpret `weight` as:

> the marginal cognitive effort required to understand and verify this one step,
> assuming every concept in `tails` is already mastered.

The value belongs to the whole joint step. It is not the total difficulty of the
head, the total course time, the number of source pages, or a separate value for
each visual connection.

## Initial 0-5 rubric

Use integers during initial imports. The schema permits one decimal place, but
decimals should represent later calibration rather than invented precision.

| Weight | Operational anchor |
|---:|---|
| 0 | Definition unfolding, notation translation, or a genuinely immediate equivalence under the recorded scope. |
| 1 | Direct application of one mastered definition or result with no meaningful choice of method. |
| 2 | Routine combination of familiar facts or a short standard calculation. |
| 3 | A non-obvious observation, choice, interpretation, or construction is needed. |
| 4 | A key technique or substantial conceptual bridge that usually needs guided explanation. |
| 5 | A major learning unit or difficult argument whose understanding is itself a significant milestone. |

A rating of 4 or 5 triggers a granularity review: decide whether the step hides a
reusable intermediate point. Do not split it automatically when the move is
conceptually atomic despite being difficult.

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
- Record a short rationale and `low`, `medium`, or `high` confidence in the
  hyperedge placeholder or import report. Confidence is authoring metadata, not a
  new core manifest field.

## Calibrate across a graph

Before rating at scale, select anchor hyperedges that clearly represent 0, 1, 3,
and 5 for the current audience. Compare uncertain steps against anchors and
against parallel routes. Use one audience assumption across the graph; a route
for experts and a route for beginners may need distinct calibration or distinct
application views.

After an import batch:

1. inspect the weight histogram;
2. investigate an all-equal or nearly all-equal distribution;
3. pairwise-compare a sample of adjacent ratings;
4. review every 4 or 5 for hidden intermediate points;
5. compare parallel routes for meaningful cost differences;
6. run route queries and inspect whether the selected paths match informed human
   judgment.

Change a rating when these comparisons expose inconsistency, not merely to make
the histogram look varied. Record the reason for material changes.

## Limits

This rubric is an initial application-level calibration, not an objective measure
of human cognition. Fatigue, forgetting, background knowledge, instructional
quality, and individual variation are outside the current scalar weight. Keep
those limitations visible when interpreting route costs.

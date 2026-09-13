/**
 * Where the learner is on a route, derived at display time from the learner records.
 *
 * There is no cursor and nothing here is stored. The current step is the first step whose
 * conclusion concept has no fresh `complete` record, so a concept reached on one route counts
 * on every route through it, and reopening a workspace lands on the same step
 * ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md), `docs/learner-records.md`).
 *
 * A record whose `basis` no longer matches the content it was made against stops counting —
 * it is kept as evidence, never deleted and never re-decided — so a content change pulls the
 * learner back to the earliest step it invalidated and leaves the rest alone.
 */
import { useEffect, useMemo, useState } from 'react';
import type { MasteryRecord } from '../../learner-records';
import type { WorkspaceContent } from '../../workspace/index';
import type { RouteStep } from '../routePreview';
import { objectMasteryBasis, type ObjectBasisReader } from './objectBasis';

/** What the records say about one step, given the content basis recomputed right now. */
export type StepStanding =
  /** A fresh `complete` record: this step is done. */
  | 'complete'
  /** A `complete` record the content has moved on from: kept as evidence, not counted. */
  | 'stale'
  /** A `complete` record whose basis this host cannot recompute, so it cannot be confirmed. */
  | 'unverifiable'
  /** Asked, and not reached. Still the step to do. */
  | 'incomplete'
  /** No record at all: never asked. Not the same as `incomplete`. */
  | 'unassessed'
  /** There is a record; its basis is still being recomputed. */
  | 'checking';

export type RouteProgress = {
  /** The first step still to be reached, or `steps.length` once the whole route is done. */
  readonly currentIndex: number;
  /** One standing per step, by the derivation the step is. */
  readonly standings: ReadonlyMap<string, StepStanding>;
};

/**
 * One step's standing. `currentBasis` is what the object's manifest entry and document
 * directory hash to now: `undefined` while that is still being computed, and `null` when this
 * host cannot compute it at all.
 */
export function stepStanding(
  record: MasteryRecord | undefined,
  currentBasis: string | null | undefined,
): StepStanding {
  if (record === undefined) return 'unassessed';
  if (record.status === 'incomplete') return 'incomplete';
  if (currentBasis === undefined) return 'checking';
  if (currentBasis === null) return 'unverifiable';
  return record.basis === currentBasis ? 'complete' : 'stale';
}

/**
 * The route's progress. Two steps concluding the same concept share one standing, which is
 * what makes a concept mastered on one route count on another.
 */
export function routeProgress(
  steps: readonly RouteStep[],
  standingOf: (step: RouteStep) => StepStanding,
): RouteProgress {
  const standings = new Map(steps.map((step) => [step.derivationId, standingOf(step)] as const));
  const currentIndex = steps.findIndex((step) => standings.get(step.derivationId) !== 'complete');
  return { currentIndex: currentIndex === -1 ? steps.length : currentIndex, standings };
}

/**
 * A judgement the application has just written, with the basis it wrote. Held until the route's
 * bases are recomputed from the workspace, so handing a step in moves the walk rather than
 * flashing “still checking” in between.
 */
export type FreshJudgement = {
  /** The content it was computed from: another version of the content makes it worthless. */
  readonly content: WorkspaceContent;
  readonly conceptId: string;
  readonly basis: string;
};

/**
 * The basis one step is judged against: the one recomputed from the workspace, or — for the step
 * the learner has this moment handed in — the one the application just wrote, which is the same
 * value the recomputation will produce.
 */
export function stepBasis(
  conceptId: string,
  recomputed: ReadonlyMap<string, string | null | undefined>,
  fresh: FreshJudgement | null,
  content: WorkspaceContent,
): string | null | undefined {
  const basis = recomputed.get(conceptId);
  return basis === undefined && fresh !== null && fresh.content === content && fresh.conceptId === conceptId
    ? fresh.basis
    : basis;
}

/**
 * The basis of every complete record on the route, recomputed from the workspace. Only
 * concepts that carry a record need one: an absent record is already not complete, and an
 * `incomplete` one is not either. A concept whose basis cannot be read — or a host with no
 * inventory to read it from — reports `null`, which never counts as complete.
 *
 * The whole content is a dependency, not only the graph: a document file changing while the
 * manifest stays byte-identical is exactly the edit a judgement has to be re-checked against.
 */
export function useStepBases(
  content: WorkspaceContent,
  steps: readonly RouteStep[],
  concepts: Readonly<Record<string, MasteryRecord>>,
  reader: ObjectBasisReader | undefined,
): ReadonlyMap<string, string | null | undefined> {
  const graph = content.graph;
  const needed = useMemo(() => [...new Set(steps
    .filter((step) => concepts[step.conceptId]?.status === 'complete')
    .map((step) => step.conceptId))].sort(), [concepts, steps]);
  const key = needed.join(' ');
  const [loaded, setLoaded] = useState<{
    readonly content: WorkspaceContent;
    readonly reader: ObjectBasisReader | undefined;
    readonly key: string;
    readonly bases: ReadonlyMap<string, string | null>;
  }>();
  useEffect(() => {
    if (!needed.length) return;
    let cancelled = false;
    const paths = new Map(graph.points.map((point) => [point.id, point.data.document]));
    void Promise.all(needed.map(async (conceptId): Promise<readonly [string, string | null]> => {
      const directory = paths.get(conceptId);
      if (!reader || directory === undefined) return [conceptId, null];
      try {
        return [conceptId, await objectMasteryBasis(graph, directory, conceptId, reader)];
      } catch {
        return [conceptId, null];
      }
    })).then((entries) => {
      if (!cancelled) setLoaded({ content, reader, key, bases: new Map(entries) });
    });
    return () => { cancelled = true; };
  }, [content, graph, key, needed, reader]);
  return useMemo(() => {
    if (!needed.length) return new Map<string, string | null | undefined>();
    return loaded?.content === content && loaded.reader === reader && loaded.key === key
      ? loaded.bases
      : new Map(needed.map((conceptId) => [conceptId, undefined] as const));
  }, [content, key, loaded, needed, reader]);
}

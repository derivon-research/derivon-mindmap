/**
 * Where a known concept's knowledge came from, said in the interface.
 *
 * The file already tells the sources apart (`data.selfReported`, `data.orientationSeed`, or
 * neither); these labels only carry that to the screen, so a self-report is never read as a
 * judgement the application made, and a workspace default is never read as the learner's own
 * claim ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md)).
 */
import type { MasterySource } from '../../learner-records';

/** A short tag beside a concept, where the full note would not fit. */
export const KNOWN_SOURCE_TAG: Record<MasterySource, string> = {
  selfReported: '自述',
  orientationSeed: '默认',
  judged: '判定',
};

/** The reader's fuller note, at the one place there is room to say what the source means. */
export const KNOWN_SOURCE_NOTE: Record<MasterySource, string> = {
  selfReported: '自述：我会了',
  orientationSeed: '默认已知：工作区给的起点',
  judged: '判定：已通过',
};

/**
 * Learner records: the mastery protocol (`derivon.learning/v1`), personal routes (the
 * `derivon.route/v1` files kept beside it), and the application-side store that reads and
 * replaces them under the workspace id. Host I/O stays behind
 * `src/ports/LearnerRecordFiles.ts`; the normative specification is
 * [learner records](../../docs/learner-records.md), with [routes](../../docs/routes.md) for the
 * route protocol itself.
 */
export {
  LEARNING_SCHEMA,
  parseLearningState, serializeLearningState, validateLearningState,
  type LearnerRecordIssue, type LearningState, type MasteryRecord, type MasteryStatus,
} from './protocol';

export {
  createLearnerRecordStore,
  type LearnerRecordStore, type StoredLearningState, type StoredPersonalRoute, type StoredPersonalRouteRead,
} from './store';

export { masteryBasis, routeBasis, type BasisFile } from './basis';
export {
  EMPTY_MASTERY, conceptSources, isWithdrawable, knownConceptIds, masterySourceOf, readMastery,
  writeJudgements, writeMastery,
  type JudgementWrite,
  type MasteryClaim, type MasteryReading, type MasterySource, type MasteryWrite,
} from './mastery';
export {
  confirmedRoute, personalRouteIsStale, readPersonalRoutes, savePersonalRoute, withRouteBasis,
  type ConfirmRouteInput, type PersonalRouteStanding,
} from './personalRoutes';

/**
 * Learner records: the two protocols that persist outside the workspace
 * (`derivon.learning/v1`, `derivon.routes/v1`) and the application-side store that reads and
 * replaces them under the workspace id. Host I/O stays behind
 * `src/ports/LearnerRecordFiles.ts`; the normative specification is
 * [learner records](../../docs/learner-records.md).
 */
export {
  LEARNING_SCHEMA, ROUTES_SCHEMA, isRouteId,
  parseLearningState, parseRoutesState, serializeLearningState, serializeRoutesState,
  validateLearningState, validateRoutesState,
  type LearnerRecordIssue, type LearningState, type MasteryRecord, type MasteryStatus,
  type RouteRecord, type RoutesState,
} from './protocol';

export {
  createLearnerRecordStore,
  type LearnerRecordStore, type StoredLearningState, type StoredRoutes,
} from './store';

export { masteryBasis, routeBasis, type BasisFile } from './basis';
export {
  EMPTY_MASTERY, conceptSources, isWithdrawable, knownConceptIds, masterySourceOf, readMastery,
  writeJudgements, writeMastery,
  type JudgementWrite,
  type MasteryClaim, type MasteryReading, type MasterySource, type MasteryWrite,
} from './mastery';
export { routeIsStale, routeRecord, type ConfirmRouteInput } from './routeRecord';
export { addRoute, readRoutes, removeRoute, type RouteList } from './routesFile';

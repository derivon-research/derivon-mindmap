import { parseWorkspaceManifest, type ManifestGraph } from './manifest';

export {
  acceptWorkspaceRoute, createConcept, createDerivation, createWorkspace, deleteWorkspaceRoute, isMarkdownPath,
  isWorkspaceRoutePath, workspaceRouteImpact,
  objectDocumentPaths, objectDocumentSource, objectSourcePath,
  orientationConceptImpact, parseWorkspaceContent, updateConceptTags, updateDerivationStructure,
  updateObjectDocument, updateObjectMetadata, updateOrientation, updateTagDeclarations,
  type ContentChange, type ContentDiagnostic, type CreateConceptIntent, type CreateDerivationIntent,
  type DerivationStructure, type TextResource,
  type UpdateConceptTagsIntent, type UpdateDerivationStructureIntent, type UpdateDocumentIntent, type UpdateMetadataIntent,
  type WorkspaceContent, type WorkspaceOrientation, type WorkspaceRoute, type WorkspaceRouteReference,
} from './content';

export {
  documentReferences, isBrokenReference, objectDocumentHref, resolveWorkspaceReference,
  type DocumentReferenceItem, type DocumentReferenceReport, type ReferenceRepairAction, type ReferenceStatus,
  type ReferenceUncertainty, type ReferenceUse, type SourceRange, type WorkspaceReferenceTarget,
} from './references';

export {
  deleteObjects, deletionBlockers, deletionScope, isDeletionSafe, referenceImpact, repairDocumentReferences,
  restoreObjectDocument,
  type DeleteObjectsIntent, type DeletionPlan, type DeletionScope, type IncomingReference, type ObjectRef,
  type ReferenceImpact, type ReferenceRepairChoice, type RepairReferencesIntent, type RestoreDocumentIntent,
} from './integrity';

export {
  WORKSPACE_SCHEMA, conceptTags, conceptsWithTag, WORKSPACE_ID_RULE, generateObjectId, isValidWorkspaceId, isValidWeight, newObjectIdentity,
  parseWorkspaceManifest,
  type ConceptPoint, type DerivationHyperedge, type DocumentReference,
  type ManifestGraph, type TagDeclaration, type WorkspaceManifest,
} from './manifest';

export {
  ORIENTATION_ACTION_OPS, ORIENTATION_FINISH, ORIENTATION_PATH, ORIENTATION_SCHEMA,
  emptyOrientationConfig, orientationConceptReferences, orientationErrors, orientationWithoutConcepts,
  parseOrientationConfig, resolveOrientationAction, serializeOrientationConfig, validateOrientationConfig,
  type OrientationAction, type OrientationActionOp, type OrientationConceptReference, type OrientationConfig,
  type OrientationDiagnostic, type OrientationOption, type OrientationQuestion, type OrientationSeed,
} from './orientation';

export {
  ROUTE_SCHEMA, WORKSPACE_ROUTES_DIRECTORY,
  addStep, copyAsPersonal, decodeRoute, draftFromSolution, executableOrder, isRouteFileName, isRouteId, moveStep,
  newRoute, parallelDerivations, readRoute, removeStep, routeFileName, routeObjectIds, serializeRoute, stepCandidates,
  swapStep, useComputedOrder, workspaceRoutePath,
  type Route, type RouteDecoding, type RouteDiagnostic, type RouteDiagnosticCode, type RouteFileIssue,
  type RouteFileIssueCode, type RouteGap, type RouteLateNeed, type RouteLocation, type RoutePlace, type RouteReading,
  type StepCandidate,
} from './route';

/** The graph as product state sees it. */
export type WorkspaceGraph = ManifestGraph;

export function parseWorkspaceGraph(text: string): WorkspaceGraph {
  return parseWorkspaceManifest(text).manifest.graph;
}

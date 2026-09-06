import { parseWorkspaceManifest, type ManifestGraph } from './manifest';

export {
  createConcept, createWorkspace, objectDocumentPaths, objectDocumentPreview, objectSourcePath,
  orientationConceptImpact, parseWorkspaceContent, updateConceptTags, updateObjectDocument,
  updateObjectMetadata, updateOrientation, updateTagDeclarations,
  type ContentChange, type ContentDiagnostic, type CreateConceptIntent, type TextResource,
  type UpdateConceptTagsIntent, type UpdateDocumentIntent, type UpdateMetadataIntent,
  type WorkspaceContent, type WorkspaceOrientation,
} from './content';

export {
  WORKSPACE_SCHEMA, conceptTags, conceptsWithTag,
  type ConceptPoint, type DerivationHyperedge, type DocumentReference,
  type ManifestGraph, type TagDeclaration, type WorkspaceManifest,
} from './manifest';

export {
  ORIENTATION_ACTION_OPS, ORIENTATION_FINISH, ORIENTATION_PATH, ORIENTATION_SCHEMA,
  emptyOrientationConfig, orientationConceptReferences, orientationErrors, parseOrientationConfig,
  resolveOrientationAction, serializeOrientationConfig, validateOrientationConfig,
  type OrientationAction, type OrientationActionOp, type OrientationConceptReference, type OrientationConfig,
  type OrientationDiagnostic, type OrientationOption, type OrientationQuestion, type OrientationSeed,
} from './orientation';

/** The graph as product state sees it. */
export type WorkspaceGraph = ManifestGraph;

export function parseWorkspaceGraph(text: string): WorkspaceGraph {
  return parseWorkspaceManifest(text).manifest.graph;
}

import { parseWorkspaceManifest, type ManifestGraph } from './manifest';

export {
  createConcept, createWorkspace, objectDocumentPaths, objectDocumentPreview, orientationConceptImpact,
  parseWorkspaceContent, updateConceptTags, updateObjectDocument, updateOrientation, updateTagDeclarations,
  type ContentChange, type ContentDiagnostic, type CreateConceptIntent, type TextResource,
  type UpdateConceptTagsIntent, type UpdateDocumentIntent, type WorkspaceContent, type WorkspaceOrientation,
} from './content';

export {
  WORKSPACE_SCHEMA, conceptTags, conceptsWithTag, manifestDialect,
  type ConceptPoint, type DerivationHyperedge, type DocumentFormat, type DocumentReference,
  type ManifestGraph, type TagDeclaration, type WorkspaceManifest,
} from './manifest';

export {
  ORIENTATION_ACTION_OPS, ORIENTATION_FINISH, ORIENTATION_PATH, ORIENTATION_SCHEMA,
  emptyOrientationConfig, orientationConceptReferences, orientationErrors, parseOrientationConfig,
  resolveOrientationAction, serializeOrientationConfig, validateOrientationConfig,
  type OrientationAction, type OrientationActionOp, type OrientationConceptReference, type OrientationConfig,
  type OrientationDiagnostic, type OrientationOption, type OrientationQuestion, type OrientationSeed,
} from './orientation';

/** The graph as product state sees it: v1 shapes only, no dialect and no retired field. */
export type WorkspaceGraph = ManifestGraph;

/** Validate/migrate the manifest here; retired replacement views stay out of v1 state. */
export function parseWorkspaceGraph(text: string): WorkspaceGraph {
  return parseWorkspaceManifest(text).manifest.graph;
}

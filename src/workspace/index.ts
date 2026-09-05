import { parseDocument, type Hyperedge, type Point } from '../domain';

export {
  createConcept, createWorkspace, objectDocumentPaths, objectDocumentPreview, parseWorkspaceContent, updateObjectDocument,
  type ContentChange, type ContentDiagnostic, type CreateConceptIntent, type TextResource, type UpdateDocumentIntent,
  type WorkspaceContent,
} from './content';

export type WorkspaceGraph = {
  readonly points: readonly Point[];
  readonly hyperedges: readonly Hyperedge[];
};

/** Validate/migrate the manifest here; retired replacement views stay out of v1 state. */
export function parseWorkspaceGraph(text: string): WorkspaceGraph {
  return parseDocument(text).graph;
}

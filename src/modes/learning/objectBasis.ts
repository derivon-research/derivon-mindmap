/**
 * Acquiring one object's mastery basis: its manifest entry plus **every file under its
 * document directory, recursively**, as the specification fixes
 * ([learner records](../../docs/learner-records.md)). The files come from the host's own
 * inventory of the directory rather than from a scan of the document body, because an asset
 * a document no longer mentions is still a file the object owns.
 *
 * The judgement path in #102 reuses this. So does the invalidation check that compares a
 * stored `basis` with the one recomputed here.
 */
import { masteryBasis } from '../../learner-records';
import type { ManifestGraph, TextResource } from '../../workspace/index';

/** The read capabilities acquiring a basis needs; all three are read-only. */
export type ObjectBasisReader = {
  /** Workspace-relative paths of every file under one object's owned directory. */
  readonly listOwnedFiles: (directory: string) => Promise<readonly string[]>;
  readonly readDocuments: (paths: readonly string[]) => Promise<Readonly<Record<string, TextResource>>>;
  readonly readAsset: (path: string) => Promise<Uint8Array>;
};

const encoder = new TextEncoder();

/**
 * The basis of a judgement about `objectId`, whose owned directory is `directory`. Every file
 * under it contributes, not only the ones a document mentions: the object's own `document.md`
 * is read as its document, and every other file — an asset, or a file the manifest does not
 * name — is read as bytes. A file whose bytes cannot be read refuses the whole basis rather
 * than hashing a partial one: two writers must never disagree about what the basis covers.
 */
export async function objectMasteryBasis(
  graph: ManifestGraph,
  directory: string,
  objectId: string,
  reader: ObjectBasisReader,
): Promise<string> {
  const paths = [...new Set(await reader.listOwnedFiles(directory))]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const documentPath = `${directory}/document.md`;
  const documents = paths.includes(documentPath) ? await reader.readDocuments([documentPath]) : {};
  const files = [];
  for (const path of paths) {
    if (path !== documentPath) {
      files.push({ path, bytes: await reader.readAsset(path) });
      continue;
    }
    const resource = documents[path];
    if (resource?.status !== 'ready') {
      throw new Error(`读不出「${path}」，这条记录所依据的内容版本算不出来`);
    }
    files.push({ path, bytes: encoder.encode(resource.text) });
  }
  return masteryBasis(graph, objectId, files);
}

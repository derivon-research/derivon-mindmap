/**
 * The three read capabilities a mastery basis needs, over an in-memory workspace. A browser
 * test cannot reach a host filesystem, and the basis must still be computed the way the
 * desktop host computes it: from the object's directory listing, never from a document scan.
 */
import type { TextResource } from '../workspace/index';
import type { ObjectBasisReader } from '../modes/learning/objectBasis';

export function createMemoryObjectFiles(
  documents: Readonly<Record<string, string>>,
  assets: Readonly<Record<string, Uint8Array>> = {},
): ObjectBasisReader {
  const all = [...Object.keys(documents), ...Object.keys(assets)];
  return {
    async listOwnedFiles(directory) {
      return all.filter((path) => path.startsWith(`${directory}/`)).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    },
    async readDocuments(paths) {
      return Object.fromEntries(paths.map((path): [string, TextResource] => [path,
        documents[path] === undefined
          ? { status: 'error', message: '读不到' }
          : { status: 'ready', text: documents[path] }]));
    },
    async readAsset(path) {
      const bytes = assets[path];
      if (!bytes) throw new Error(`读不到 ${path}`);
      return new Uint8Array(bytes);
    },
  };
}

/**
 * The content basis of a learner record: the one value it uses to answer *does this
 * judgement still count?* It is defined in [learner records](../../docs/learner-records.md)
 * and it is a hash carrying no inventory — it never explains *what* changed.
 *
 * Two coverages live here, and they are deliberately different:
 *
 * - `routeBasis` covers **the manifest entries of every concept and derivation the route
 *   names, and nothing else**, so an unrelated graph edit never invalidates a route;
 * - `masteryBasis` covers **one object's manifest entry plus every file under its document
 *   directory**, so a document or asset edit retires the judgement whose object owns it.
 */
import type { ManifestGraph } from '../workspace/index';

const encoder = new TextEncoder();

/**
 * JSON with object keys in ascending code-unit order, no insignificant whitespace, arrays in
 * their recorded order and numbers in ECMAScript's shortest round-tripping form. `JSON.stringify`
 * already gives everything but the key order; a key whose value is `undefined` is dropped, as
 * `JSON.stringify` drops it, so a rewritten manifest with the same values keeps every basis alive.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type BasisRecord = { readonly name: string; readonly digest: Uint8Array };

/** The one stream both coverages share: name length, name bytes and digest per record. */
async function basisStream(records: readonly BasisRecord[]): Promise<string> {
  records = [...records].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const parts: Uint8Array[] = [];
  for (const record of records) {
    const name = encoder.encode(record.name);
    const length = new Uint8Array(8);
    new DataView(length.buffer).setBigUint64(0, BigInt(name.length), true);
    parts.push(length, name, record.digest);
  }
  return hex(await sha256(concat(parts)));
}

function entryById(graph: ManifestGraph): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const point of graph.points) entries.set(point.id, point);
  for (const edge of graph.hyperedges) entries.set(edge.id, edge);
  return entries;
}

/**
 * A manifest entry contributes one record, named with the object id. The two-domain prefix
 * (`entry` here, `file` for documents) is what keeps an entry's digest from ever colliding
 * with a file's, however an object names its directory. An id the graph no longer has
 * contributes nothing, which is exactly what makes a record whose object was deleted stale.
 */
async function entryRecord(entries: ReadonlyMap<string, unknown>, id: string): Promise<BasisRecord | null> {
  const entry = entries.get(id);
  if (entry === undefined) return null;
  return {
    name: `.derivon/workspace.json#${id}`,
    digest: await sha256(concat([encoder.encode('entry'), encoder.encode(canonicalJson(entry))])),
  };
}

/**
 * The basis of a route that names `objectIds`: the manifest entry of each of them and nothing
 * else.
 */
export async function routeBasis(graph: ManifestGraph, objectIds: Iterable<string>): Promise<string> {
  const entries = entryById(graph);
  const records: BasisRecord[] = [];
  for (const id of new Set(objectIds)) {
    const record = await entryRecord(entries, id);
    if (record) records.push(record);
  }
  return basisStream(records);
}

/** One file under an object's document directory, as workspace-relative path and bytes. */
export type BasisFile = {
  readonly path: string;
  readonly bytes: Uint8Array;
};

/**
 * The basis of a judgement about `objectId`: its manifest entry plus every file under its
 * document directory, recursively. `files` is the object's owned-file inventory acquired by
 * the caller; the digest domain is `file`, so a document's record can never collide with the
 * object's entry record.
 */
export async function masteryBasis(
  graph: ManifestGraph,
  objectId: string,
  files: readonly BasisFile[],
): Promise<string> {
  const records: BasisRecord[] = [];
  const entry = await entryRecord(entryById(graph), objectId);
  if (entry) records.push(entry);
  const domain = encoder.encode('file');
  for (const file of files) {
    records.push({ name: file.path, digest: await sha256(concat([domain, file.bytes])) });
  }
  return basisStream(records);
}

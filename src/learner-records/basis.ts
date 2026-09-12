/**
 * The content basis of a route: the one value a `derivon.routes/v1` record uses to answer
 * *does this route still describe the current graph?* It is defined in
 * [learner records](../../docs/learner-records.md) and it covers **the manifest entries of
 * every concept and derivation the route names, and nothing else** — so an unrelated graph
 * edit never invalidates a route, and editing an object that is named always does.
 *
 * It is a hash and it carries no inventory: it never explains *what* changed, because the
 * answer a learner needs is only "this route was solved against a different graph".
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

/**
 * The basis of a route that names `objectIds`. An id the graph no longer has contributes no
 * record, which is exactly what makes a route whose objects were deleted read as stale.
 */
export async function routeBasis(graph: ManifestGraph, objectIds: Iterable<string>): Promise<string> {
  const entryById = new Map<string, unknown>();
  for (const point of graph.points) entryById.set(point.id, point);
  for (const edge of graph.hyperedges) entryById.set(edge.id, edge);
  const digestDomain = encoder.encode('entry');
  const records: { readonly name: string; readonly digest: Uint8Array }[] = [];
  for (const id of new Set(objectIds)) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    records.push({
      name: `.derivon/workspace.json#${id}`,
      digest: await sha256(concat([digestDomain, encoder.encode(canonicalJson(entry))])),
    });
  }
  records.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const parts: Uint8Array[] = [];
  for (const record of records) {
    const name = encoder.encode(record.name);
    const length = new Uint8Array(8);
    new DataView(length.buffer).setBigUint64(0, BigInt(name.length), true);
    parts.push(length, name, record.digest);
  }
  return hex(await sha256(concat(parts)));
}

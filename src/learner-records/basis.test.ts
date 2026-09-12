import { describe, expect, it } from 'vitest';
import { parseWorkspaceManifest, type ManifestGraph } from '../workspace/index';
import { routeBasis } from './basis';

/**
 * The route basis follows `docs/learner-records.md`: one SHA-256 stream over the manifest
 * entries of the objects the route names, each record being the name's length as an unsigned
 * 64-bit little-endian integer, the name's UTF-8 bytes, and the entry's 32-byte digest.
 *
 * The expected digest below was computed independently of `basis.ts` — a throwaway script
 * over `node:crypto` that encoded those same records by hand — so the assertion can disagree
 * with the implementation instead of restating it.
 */
const KNOWN_ANSWER = '519add193d33dc674adcc47139a6b3c9f85208dbe4e95a7ed0b8fcb623d1ff56';

const conceptA = { id: 'c-a', data: { label: 'A', document: 'docs/a' } };
const conceptB = { id: 'c-b', data: { label: 'B', document: 'docs/b' } };
const derivation = { id: 'h-ab', weight: 2, tails: ['c-a'], head: 'c-b', data: { document: 'docs/h-ab' } };

function graphOf(
  graph: { points: readonly unknown[]; hyperedges: readonly unknown[] },
  { indent = 0, reorder = false }: { indent?: number; reorder?: boolean } = {},
): ManifestGraph {
  const document = { title: '路线依据', description: '' };
  const manifest = {
    schema: 'derivon.workspace/v1',
    id: 'basis-workspace',
    ...(reorder ? { document } : { document: { description: document.description, title: document.title } }),
    tags: [],
    graph,
  };
  return parseWorkspaceManifest(JSON.stringify(manifest, null, indent)).manifest.graph;
}

const graph = (overrides: Partial<{ points: readonly unknown[]; hyperedges: readonly unknown[] }> = {}) =>
  graphOf({ points: [conceptA, conceptB], hyperedges: [derivation], ...overrides });

describe('routeBasis', () => {
  it('hashes the manifest entries of exactly the objects a route names', async () => {
    await expect(routeBasis(graph(), ['c-a', 'c-b', 'h-ab'])).resolves.toBe(KNOWN_ANSWER);
  });

  it('reads the same values as the same basis however the manifest is written on disk', async () => {
    const compact = await routeBasis(graphOf({ points: [conceptA, conceptB], hyperedges: [derivation] }), ['c-a']);
    const reordered = await routeBasis(
      graphOf({ points: [conceptA, conceptB], hyperedges: [derivation] }, { indent: 4, reorder: true }),
      ['c-a'],
    );
    expect(reordered).toBe(compact);
  });

  it('does not care what order the ids are given in', async () => {
    await expect(routeBasis(graph(), ['h-ab', 'c-b', 'c-a'])).resolves.toBe(KNOWN_ANSWER);
  });

  it('changes when a named object changes, because the route no longer describes the graph', async () => {
    const edited = graph({ points: [{ ...conceptA, data: { ...conceptA.data, label: 'A′' } }, conceptB] });
    await expect(routeBasis(edited, ['c-a', 'c-b', 'h-ab'])).resolves.not.toBe(KNOWN_ANSWER);
  });

  it('changes when a named derivation changes, including its weight and endpoints', async () => {
    const heavier = graph({ hyperedges: [{ ...derivation, weight: 3 }] });
    const reheaded = graph({ hyperedges: [{ ...derivation, head: 'c-a', tails: [] }] });
    await expect(routeBasis(heavier, ['c-a', 'c-b', 'h-ab'])).resolves.not.toBe(KNOWN_ANSWER);
    await expect(routeBasis(reheaded, ['c-a', 'c-b', 'h-ab'])).resolves.not.toBe(KNOWN_ANSWER);
  });

  it('ignores an object the route does not name, so an unrelated edit never invalidates it', async () => {
    const extra = graph({ points: [conceptA, conceptB, { id: 'c-z', data: { label: 'Z', document: 'docs/z' } }] });
    await expect(routeBasis(extra, ['c-a', 'c-b', 'h-ab'])).resolves.toBe(KNOWN_ANSWER);
  });

  it('changes when a named object is gone, rather than quietly hashing fewer records', async () => {
    const thinned = graph({ hyperedges: [] });
    await expect(routeBasis(thinned, ['c-a', 'c-b', 'h-ab'])).resolves.not.toBe(KNOWN_ANSWER);
  });

  it('is a lowercase SHA-256 rendered as hexadecimal', async () => {
    await expect(routeBasis(graph(), ['c-a'])).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

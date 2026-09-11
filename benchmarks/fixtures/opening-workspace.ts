import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Generated Markdown workspace with a large unrequested asset, never licensed case content. */
export async function createOpeningWorkspace(concepts: number): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'derivon-opening-'));
  await mkdir(path.join(root, '.derivon'));
  const points = Array.from({ length: concepts }, (_, index) => ({ id: `c-${index}`, data: {
    label: `Concept ${index}`, document: `docs/c-${index}`,
  } }));
  const hyperedges = Array.from({ length: Math.floor(concepts * 0.4) }, (_, index) => ({
    id: `h-${index}`, tails: [points[index].id], head: points[index + 1].id, weight: 1,
    data: { document: `docs/h-${index}` },
  }));
  await writeFile(path.join(root, '.derivon/workspace.json'), JSON.stringify({
    schema: 'derivon.workspace/v1', id: 'opening-benchmark', document: { title: 'Opening benchmark', description: '' },
    graph: { points, hyperedges },
  }));
  for (const object of [...points, ...hyperedges]) {
    await mkdir(path.join(root, object.data.document), { recursive: true });
    await writeFile(path.join(root, object.data.document, 'document.md'), `# ${object.id}\n\nGenerated Markdown. <details><summary>Details</summary>Body</details>\n`);
  }
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets/unrequested.bin'), Buffer.alloc(64 * 1024 * 1024, 42));
  return root;
}

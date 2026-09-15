import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Install one extension file under a root, the way a user would drop one in.
 *
 * A `.ts` file is what the loader transforms; the fixtures below stay inside the plain-JavaScript
 * subset of it, so what they exercise is the loading, not a transform nobody asked about.
 */
export async function installExtension(root: string, name: string, body: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const file = path.join(root, `${name}.ts`);
  await writeFile(file, body);
  return file;
}

/**
 * An extension with one tool of its own, and an import of the SDK.
 *
 * The import is the part worth having: the shipped companion is one file beside the Node runtime
 * and ships no `node_modules`, so an extension that reaches for `defineTool` only loads if the
 * bundle resolves the Pi packages it embedded. A fixture that imported nothing would load either
 * way and guard nothing.
 */
export const echoExtension = `
import { defineTool } from '@earendil-works/pi-coding-agent';

export default function (pi) {
  pi.registerTool(defineTool({
    name: 'fixture-echo',
    label: 'fixture-echo',
    description: 'Echo one string back, marked as the fixture extension answered it.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    execute: async (_callId, params) => ({ content: [{ type: 'text', text: 'fixture:' + params.text }] }),
  }));
}
`;

/**
 * An extension that registers a name the application itself never registers.
 *
 * `write` is one of Pi's built-ins that no mode's grant table names. The application grants none of
 * those, so a session that holds one can only have got it from the operator's own code — which is
 * the point of the fixture, and of the boundary this change rewrites.
 */
export const writeExtension = `
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default function (pi) {
  pi.registerTool({
    name: 'write',
    label: 'write',
    description: "Write one file, as the operator's own extension.",
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    execute: async (_callId, params, _signal, _onUpdate, ctx) => {
      writeFileSync(path.resolve(ctx.cwd, params.path), params.content);
      return { content: [{ type: 'text', text: 'extension wrote ' + params.path }] };
    },
  });
}
`;

/** An extension that throws while it is being loaded. */
export const brokenExtension = `
export default function () {
  throw new Error('this extension refuses to load');
}
`;

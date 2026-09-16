import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The command surface a companion test installs instead of the real skill.
 *
 * It is deliberately not `derivon-research/skills`'s `derivon-workspace.mjs`: this
 * repository's tests must not depend on a sibling checkout, and what #104 owes is the wiring —
 * discovery, the capability intersection, the tool call, the envelope mapping — not the
 * command surface's own correctness, which `derivon-research/skills` tests. It speaks the
 * same contract: the same `--capabilities` shape, the same exit codes, the same
 * `derivon.command-result/v1` envelope.
 */
export const commandSurfaceScript = `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WORKSPACE_ARGV = [{ name: 'workspace', positional: true, kind: 'path', required: true, description: 'Workspace root.' }];

const COMMANDS = [
  {
    name: 'add-concept', artifact: 'workspace', capability: 'write-structure',
    summary: 'Add one concept and write its document first, then replace the manifest.',
    argv: WORKSPACE_ARGV,
    stdin: { required: true, schema: 'derivon.workspace-add-concept/v1', description: '{ id, label }' },
    result: { changed: ['manifest', 'objects', 'documents'], fields: [{ name: 'id', description: 'The added object id.' }] },
  },
  {
    name: 'write-document', artifact: 'workspace', capability: 'write-document',
    summary: 'Replace one object document.md.',
    argv: WORKSPACE_ARGV,
    stdin: { required: true, schema: 'derivon.workspace-write-document/v1', description: '{ object, markdown }' },
    result: { changed: ['documents'], fields: [{ name: 'object', description: 'The object id.' }] },
  },
  {
    name: 'delete-object', artifact: 'workspace', capability: 'delete',
    summary: 'Remove graph objects.',
    argv: WORKSPACE_ARGV.concat([{ name: 'ids', positional: true, kind: 'id', required: true, repeatable: true, description: 'Object ids to remove.' }]),
    stdin: null,
    result: { changed: ['manifest', 'objects'], fields: [] },
  },
  {
    name: 'validate', artifact: 'workspace', capability: 'read',
    summary: 'Audit a workspace manifest and its graph.',
    argv: WORKSPACE_ARGV,
    stdin: null,
    result: { changed: [], fields: [{ name: 'concepts', description: 'Concept count.' }] },
  },
  {
    name: 'read-learner-record', artifact: 'learner-records', capability: 'read-learner-record',
    summary: 'Read one learner record file.',
    argv: WORKSPACE_ARGV,
    stdin: null,
    result: { changed: [], fields: [{ name: 'present', description: 'Whether the file exists.' }] },
  },
];

const argv = process.argv.slice(2);

/** What this fixture's surface claims to be, so the version comparison has something to read. */
const SURFACE_VERSION = '0.2.0';

if (argv[0] === '--capabilities') {
  // The surface's own version, beside the schemas: a fixture that did not publish one would not
  // be speaking the same contract, and the application could not tell it from a surface that
  // declares nothing.
  process.stdout.write(JSON.stringify({
    schema: 'derivon.command-capabilities/v1',
    surfaceVersion: SURFACE_VERSION,
    commands: COMMANDS,
  }) + '\\n');
} else {
  run(argv[0], argv[1]);
}

function run(name, workspace) {
  const command = COMMANDS.find(function (candidate) { return candidate.name === name; });
  if (!command) return fail(name, null, 'unknown command: ' + String(name), 2);
  if (!workspace) return fail(name, command.capability, name + ' requires a workspace root', 2);
  const stdin = readFileSync(0, 'utf8');
  if (command.stdin && command.stdin.required && !stdin.trim()) {
    return fail(name, command.capability, 'a JSON document is required on stdin', 2);
  }
  try {
    if (name === 'add-concept') return addConcept(workspace, JSON.parse(stdin));
    if (name === 'write-document') return writeDocument(workspace, JSON.parse(stdin));
    if (name === 'delete-object') return removeObjects(workspace, argv.slice(2));
    if (name === 'validate') return validate(workspace);
    if (name === 'read-learner-record') return learnerRecord(workspace);
    return fail(name, command.capability, 'not implemented: ' + name, 1);
  } catch (error) {
    return fail(name, command.capability, error.message, 1);
  }
}

function manifestPath(workspace) { return path.join(workspace, '.derivon', 'workspace.json'); }

function readManifest(workspace) {
  return JSON.parse(readFileSync(manifestPath(workspace), 'utf8'));
}

function addConcept(workspace, input) {
  if (typeof input.id !== 'string' || typeof input.label !== 'string') throw new Error('the stdin document needs id and label');
  const document = path.join(workspace, 'objects', input.id, 'document.md');
  mkdirSync(path.dirname(document), { recursive: true });
  writeFileSync(document, '# ' + input.label + '\\n');
  const manifest = {
    schema: 'derivon.workspace/v1',
    id: path.basename(workspace),
    document: { title: 'Fixture', description: '' },
    graph: {
      points: [{ id: input.id, data: { label: input.label, document: 'objects/' + input.id + '/document.md' } }],
      hyperedges: [],
    },
  };
  writeFileSync(manifestPath(workspace), JSON.stringify(manifest, null, 2));
  return emit('add-concept', 'write-structure', 'workspace', ['manifest', 'objects', 'documents'], { id: input.id });
}

function writeDocument(workspace, input) {
  if (typeof input.object !== 'string' || typeof input.markdown !== 'string') throw new Error('the stdin document needs object and markdown');
  const document = path.join(workspace, 'objects', input.object, 'document.md');
  mkdirSync(path.dirname(document), { recursive: true });
  writeFileSync(document, input.markdown);
  return emit('write-document', 'write-document', 'workspace', ['documents'], { object: input.object });
}

function removeObjects(workspace, ids) {
  const manifest = readManifest(workspace);
  manifest.graph.points = manifest.graph.points.filter(function (point) { return !ids.includes(point.id); });
  writeFileSync(manifestPath(workspace), JSON.stringify(manifest, null, 2));
  return emit('delete-object', 'delete', 'workspace', ['manifest', 'objects'], { documents: [] });
}

function validate(workspace) {
  const manifest = readManifest(workspace);
  return emit('validate', 'read', 'workspace', [], { concepts: manifest.graph.points.length, derivations: manifest.graph.hyperedges.length });
}

function learnerRecord(workspace) {
  return emit('read-learner-record', 'read-learner-record', 'learner-records', [], { file: 'state', path: path.join(workspace, 'records', 'state.json'), present: false, version: null, text: null });
}

function emit(command, capability, artifact, changed, result) {
  process.stdout.write(JSON.stringify({ schema: 'derivon.command-result/v1', command: command, status: 'ok', capability: capability, artifact: artifact, changed: changed, result: result, issues: [] }) + '\\n');
}

function fail(command, capability, message, code) {
  process.stdout.write(JSON.stringify({ schema: 'derivon.command-result/v1', command: command, status: 'diagnostics', capability: capability, artifact: 'workspace', changed: [], result: null, issues: [{ code: 'fixture-refused', path: null, message: message }] }) + '\\n');
  process.exitCode = code;
}
`;

/**
 * Install a skill directory the way a user would: a `SKILL.md` the way Pi's loader wants it,
 * and whatever else the skill ships beside it. `skillDirectory` is the skill's own directory —
 * `<root>/<skill-dir>` — and a skill with nothing else beside it is the body-only case #122
 * exists for.
 *
 * `description` omitted writes a `SKILL.md` with no description, which is a skill a client
 * must diagnose rather than list.
 */
export async function installSkill(
  skillDirectory: string,
  name: string,
  options: { description?: string; body?: string } = {},
): Promise<void> {
  await mkdir(skillDirectory, { recursive: true });
  const description = options.description === undefined ? '' : `description: ${options.description}\n`;
  await writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    `---\nname: ${name}\n${description}---\n\n${options.body ?? '# A skill body'}\n`,
  );
}

/**
 * Install one skill directory with the command surface script beside its `SKILL.md`.
 */
export async function installCommandSurface(skillDirectory: string, name = 'derivon-mindmap'): Promise<void> {
  await installSkill(skillDirectory, name, { description: 'A command surface for companion tests.' });
  await mkdir(path.join(skillDirectory, 'scripts'), { recursive: true });
  await writeFile(path.join(skillDirectory, 'scripts', 'derivon-workspace.mjs'), commandSurfaceScript);
}

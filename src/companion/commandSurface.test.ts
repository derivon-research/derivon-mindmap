import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandSurfaceScript } from '../testing/commandSurface';
import {
  commandTools, grantedCommands, invocationFor, parseCapabilities, sessionToolNames,
  type Command, type CommandSurface,
} from './commandSurface';

let surface: CommandSurface;

beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'derivon-capabilities-'));
  const scriptPath = path.join(directory, 'derivon-workspace.mjs');
  await writeFile(scriptPath, commandSurfaceScript);
  // The fixture speaks the real contract, so parsing it here is parsing what the command
  // surface publishes rather than a shape invented by this test.
  const output = execFileSync(process.execPath, [scriptPath, '--capabilities'], { encoding: 'utf8' });
  const commands = parseCapabilities(output);
  if (!commands) throw new Error(`the fixture did not publish capabilities: ${output}`);
  surface = { scriptPath, commands };
});

describe('the capability intersection', () => {
  it('gives authoring every workspace capability and no learner-record one', () => {
    const names = grantedCommands(surface, 'authoring').map((command) => command.name);
    expect(names).toContain('add-concept');
    expect(names).toContain('write-document');
    expect(names).toContain('delete-object');
    expect(names).toContain('validate');
    expect(names).not.toContain('read-learner-record');
  });

  it('gives learning reads only, in both artifact categories', () => {
    const names = grantedCommands(surface, 'learning').map((command) => command.name);
    expect(names).toEqual(['validate', 'read-learner-record']);
  });

  it('holds no write-capability command in the learning session, structurally', () => {
    const granted = grantedCommands(surface, 'learning');
    for (const command of surface.commands) {
      if (command.capability === 'read' || command.capability === 'read-learner-record') continue;
      expect(granted).not.toContainEqual(command);
    }
  });

  it('grants the learning session bash and the authoring session nothing built-in', () => {
    expect(sessionToolNames(grantedCommands(surface, 'learning'), 'learning'))
      .toEqual(['validate', 'read-learner-record', 'bash']);
    expect(sessionToolNames(grantedCommands(surface, 'authoring'), 'authoring'))
      .not.toContain('bash');
  });
});

describe('reading --capabilities', () => {
  it('rejects input that is not a command list', () => {
    expect(parseCapabilities('not json at all')).toBeNull();
    expect(parseCapabilities('{"schema":"derivon.command-capabilities/v1"}')).toBeNull();
    expect(parseCapabilities('{"commands":"add-concept"}')).toBeNull();
  });

  it('skips a command that does not declare what a tool needs', () => {
    const parsed = parseCapabilities(JSON.stringify({
      commands: [
        { name: 'validate', artifact: 'workspace', capability: 'read' },
        { name: 'broken', capability: 'read' },
      ],
    }));
    expect(parsed?.map((command) => command.name)).toEqual(['validate']);
  });
});

describe('turning a command into argv', () => {
  const crosslink: Command = {
    name: 'crosslink', artifact: 'workspace', capability: 'write-document', summary: 'Add crosslinks.',
    argv: [
      { name: 'workspace', positional: true, kind: 'path', required: true, repeatable: false },
      { name: 'selectors', positional: true, kind: 'id', required: false, repeatable: true },
      { name: 'all', positional: false, flag: '--all', kind: 'boolean', required: false, repeatable: false },
      { name: 'check', positional: false, flag: '--check', kind: 'boolean', required: false, repeatable: false },
    ],
    stdin: null,
  };

  it('never passes the workspace root the model was not given', () => {
    expect(invocationFor(crosslink, { all: true }).argv).toEqual(['--all']);
  });

  it('passes repeatable positionals in order and only the true booleans', () => {
    expect(invocationFor(crosslink, { selectors: ['c-1', 'c-2'], all: true, check: false }).argv)
      .toEqual(['c-1', 'c-2', '--all']);
  });

  it('passes a value flag as a pair, camel-cased parameter or not', () => {
    const exportTextbook: Command = {
      name: 'export-textbook', artifact: 'workspace', capability: 'read', summary: 'Export.',
      argv: [
        { name: 'workspace', positional: true, kind: 'path', required: true, repeatable: false },
        { name: 'max-nodes', positional: false, flag: '--max-nodes', kind: 'number', required: false, repeatable: false },
      ],
      stdin: null,
    };
    expect(invocationFor(exportTextbook, { maxNodes: 4000 }).argv).toEqual(['--max-nodes', '4000']);
  });

  it('serializes the stdin document as JSON, and sends nothing when there is none', () => {
    const addConcept = surface.commands.find((command) => command.name === 'add-concept');
    if (!addConcept) throw new Error('the fixture has no add-concept');
    expect(invocationFor(addConcept, { stdin: { id: 'c-1', label: 'One' } }))
      .toEqual({ argv: [], stdin: '{"id":"c-1","label":"One"}' });
    expect(invocationFor(addConcept, {}).stdin).toBeUndefined();
  });
});

describe('the tool a command becomes', () => {
  const authoringTools = () => commandTools({ surface, mode: 'authoring', workspacePath: '/tmp/ws' });

  it('exposes no workspace parameter and derives the flags it declares', () => {
    const addConcept = authoringTools().find((tool) => tool.name === 'add-concept');
    if (!addConcept) throw new Error('no add-concept tool');
    const parameters = addConcept.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(parameters.properties)).toEqual(['stdin']);
    expect(parameters.required).toEqual(['stdin']);
  });

  it('marks a repeated positional as an array and a value flag as one value', () => {
    const deleteObject = authoringTools().find((tool) => tool.name === 'delete-object');
    if (!deleteObject) throw new Error('no delete-object tool');
    const parameters = deleteObject.parameters as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(parameters.properties.ids).toMatchObject({ type: 'array', items: { type: 'string' } });
  });

  it('describes the stdin document with the schema name the surface published', () => {
    const addConcept = authoringTools().find((tool) => tool.name === 'add-concept');
    expect(addConcept?.description).toContain('derivon.workspace-add-concept/v1');
  });
});

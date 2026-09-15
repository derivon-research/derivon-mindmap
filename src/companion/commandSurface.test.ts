import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandSurfaceScript, installSkill } from '../testing/commandSurface';
import { DERIVON_TOOL_NAME } from './cliTool';
import {
  commandTools, discoverSkills, grantedCommands, invocationFor, parseCapabilities, sessionToolNames,
  shellToolName, type Command, type CommandSurface,
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

  it('grants both modes the ability to read, the graph-query tool, and the platform\'s shell', () => {
    // `derivon` is in both modes' grant because it changes nothing: there is no capability to
    // intersect it with and no mode to leave it out of, so these reads answer the same way whether
    // the session may write or not.
    expect(sessionToolNames(grantedCommands(surface, 'learning'), 'learning', 'bash'))
      .toEqual(['validate', 'read-learner-record', 'read', DERIVON_TOOL_NAME, 'bash']);
    const authoring = sessionToolNames(grantedCommands(surface, 'authoring'), 'authoring', 'bash');
    expect(authoring).toContain('read');
    expect(authoring).toContain(DERIVON_TOOL_NAME);
    expect(authoring).toContain('bash');
    expect(authoring).not.toContain('powershell');
  });

  it('names the shell tool by platform, not by grant', () => {
    expect(shellToolName('win32')).toBe('powershell');
    expect(shellToolName('darwin')).toBe('bash');
    expect(shellToolName('linux')).toBe('bash');
    expect(sessionToolNames([], 'learning', shellToolName('win32'))).toEqual(['read', DERIVON_TOOL_NAME, 'powershell']);
    expect(sessionToolNames([], 'authoring', shellToolName('darwin'))).toEqual(['read', DERIVON_TOOL_NAME, 'bash']);
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

describe('the skills the two roots offer', () => {
  it('loads a skill from either root, including one that is only a SKILL.md', async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-user-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-skills-project-'));
    await installSkill(path.join(configDirectory, 'skills', 'method'), 'method', {
      description: 'A methodology the model should follow.',
    });
    await installSkill(path.join(workspace, '.derivon', 'skills', 'body-only'), 'body-only', {
      description: 'Nothing but a body.',
      body: '# Body only\n\nThe passphrase is tungsten.',
    });

    const discovery = discoverSkills({ configDirectory, workspacePath: workspace });

    expect(discovery.skills.map((skill) => skill.name).sort()).toEqual(['body-only', 'method']);
    const bodyOnly = discovery.skills.find((skill) => skill.name === 'body-only');
    expect(bodyOnly?.description).toBe('Nothing but a body.');
    // The location the prompt carries is the file itself: `read` opens it, and nothing has
    // to know that this skill ships no command surface.
    expect(bodyOnly?.filePath).toBe(path.join(workspace, '.derivon', 'skills', 'body-only', 'SKILL.md'));
    expect(discovery.skillNotes).toEqual([]);
  });

  it('loads the user-level root before a workspace is open', async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-nouserroot-'));
    await installSkill(path.join(configDirectory, 'skills', 'method'), 'method', { description: 'Method.' });

    const discovery = discoverSkills({ configDirectory, workspacePath: null });

    expect(discovery.skills.map((skill) => skill.name)).toEqual(['method']);
  });

  it('keeps the user-level skill when both roots install the same name, and says so', async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-collide-user-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-skills-collide-project-'));
    await installSkill(path.join(configDirectory, 'skills', 'derivon-mindmap'), 'derivon-mindmap', {
      description: 'The user-level one.',
    });
    await installSkill(path.join(workspace, '.derivon', 'skills', 'derivon-mindmap'), 'derivon-mindmap', {
      description: 'The project-level one.',
    });

    const discovery = discoverSkills({ configDirectory, workspacePath: workspace });

    expect(discovery.skills.map((skill) => skill.name)).toEqual(['derivon-mindmap']);
    expect(discovery.skills[0]?.description).toBe('The user-level one.');
    expect(discovery.skillNotes.join('\n')).toContain('技能冲突');
    expect(discovery.skillNotes.join('\n')).toContain(path.join(configDirectory, 'skills', 'derivon-mindmap', 'SKILL.md'));
    expect(discovery.skillNotes.join('\n')).toContain(path.join(workspace, '.derivon', 'skills', 'derivon-mindmap', 'SKILL.md'));
  });

  it('refuses a skill with no description and names the file', async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-nodesc-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-skills-nodesc-ws-'));
    await installSkill(path.join(workspace, '.derivon', 'skills', 'undescribed'), 'undescribed');

    const discovery = discoverSkills({ configDirectory, workspacePath: workspace });

    // A description is what the prompt carries, so a skill without one has nothing to be
    // listed by; it is diagnosed instead of loaded.
    expect(discovery.skills).toEqual([]);
    expect(discovery.skillNotes.join('\n')).toContain(path.join(workspace, '.derivon', 'skills', 'undescribed', 'SKILL.md'));
    expect(discovery.skillNotes.join('\n')).toContain('description');
  });

  it('diagnoses a SKILL.md whose frontmatter cannot be parsed, and loads no skill from it', async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-badfront-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-skills-badfront-ws-'));
    const directory = path.join(workspace, '.derivon', 'skills', 'broken');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), '---\nname: [unclosed\ndescription: oops\n---\n\n# Broken\n');

    const discovery = discoverSkills({ configDirectory, workspacePath: workspace });

    expect(discovery.skills).toEqual([]);
    expect(discovery.skillNotes.join('\n')).toContain(path.join(directory, 'SKILL.md'));
  });

  it("never reads Pi's own skill roots", async () => {
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'derivon-skills-pi-base-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'derivon-skills-pi-ws-'));
    await installSkill(path.join(workspace, '.pi', 'skills', 'pi-project'), 'pi-project', { description: 'Pi only.' });
    await installSkill(path.join(configDirectory, '.pi', 'agent', 'skills', 'pi-user'), 'pi-user', { description: 'Pi only.' });

    const discovery = discoverSkills({ configDirectory, workspacePath: workspace });

    expect(discovery.skills).toEqual([]);
    // An unmatched root is not a diagnostic either: nothing is installed, which is the
    // ordinary state of a machine this application has just been installed on.
    expect(discovery.skillNotes).toEqual([]);
  });
});

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDerivonCli, type DerivonCli } from '../testing/derivonCli';
import { DERIVON_TOOL_NAME, derivonTool } from './cliTool';

/**
 * The graph a workspace carries. `data` is in it because the CLI hands it through untouched,
 * and `id` and `tags` sit beside it because they must not travel to the CLI.
 */
const GRAPH = {
  points: [
    { id: 'A', data: { label: '概念 A', document: 'docs/concept-a' } },
    { id: 'B', data: { label: '概念 B', document: 'docs/concept-b' } },
    { id: 'Z', data: { label: '概念 Z', document: 'docs/concept-z' } },
  ],
  hyperedges: [
    { id: 'h-ab', weight: 1, tails: ['A'], head: 'B' },
    { id: 'h-bz', weight: 2, tails: ['B'], head: 'Z' },
  ],
};

let directory: string;
let workspace: string;
let cli: DerivonCli;
const machinePath = process.env.PATH;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-cli-tool-'));
  workspace = path.join(directory, 'workspace');
  await mkdir(path.join(workspace, '.derivon'), { recursive: true });
  await writeFile(path.join(workspace, '.derivon', 'workspace.json'), JSON.stringify({
    schema: 'derivon.workspace/v1',
    id: 'fixture-workspace',
    document: { title: 'Fixture', description: 'A graph to query.' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: GRAPH,
  }, null, 2));
  cli = await installDerivonCli(directory);
  // The fixture stands in for the operator's own installation and is found the same way: by
  // name, on the PATH this process was started with. A bundled copy would need none of this.
  process.env.PATH = `${cli.binDirectory}${path.delimiter}${machinePath ?? ''}`;
});

afterEach(() => {
  if (machinePath === undefined) delete process.env.PATH;
  else process.env.PATH = machinePath;
});

/** One call, as the session makes it: the tool definition's own execute, and the text back. */
async function call(parameters: unknown, tool: ToolDefinition = derivonTool({ workspacePath: workspace })) {
  const result = await tool.execute('fixture-call', parameters as never, undefined, undefined, undefined as never);
  return result.content.map((part) => (part as { text?: string }).text ?? '').join('');
}

describe('the graph the tool answers about', () => {
  it("sends the manifest's graph and nothing else on stdin", async () => {
    await call({ argv: ['point', 'list'] });

    const [invocation] = await cli.calls();
    expect(invocation).toBeDefined();
    // The id, the title and the tag declarations stay behind: the CLI's protocol is the graph.
    expect(JSON.parse(invocation.input)).toEqual(GRAPH);
  });

  it('cannot be pointed at another graph', async () => {
    await expect(call({ argv: ['point', 'list', '--input', '/tmp/other/graph.json'] }))
      .rejects.toThrow(/--input/);
    await expect(call({ argv: ['point', 'list', '--input=/tmp/other/graph.json'] }))
      .rejects.toThrow(/--input/);
    // Refused before anything ran, so no other graph was ever opened.
    expect(await cli.calls()).toEqual([]);
  });

  it('has no workspace parameter: the session is rooted at the workspace, not the call', () => {
    const parameters = derivonTool({ workspacePath: workspace }).parameters as {
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(Object.keys(parameters.properties)).toEqual(['argv']);
    expect(parameters.required).toEqual(['argv']);
    expect(parameters.additionalProperties).toBe(false);
  });
});

describe('the CLI it runs', () => {
  it('returns the CLI\'s JSON exactly as printed', async () => {
    expect(await call({ argv: ['point', 'list'] })).toBe(JSON.stringify(GRAPH.points));
  });

  it('passes every word through unchanged, repeated flags and --pretty included', async () => {
    const argv = ['query', 'route', '--start', 'A', '--start', 'B', '--target', 'Z', '--pretty'];

    const text = await call({ argv });

    const [invocation] = await cli.calls();
    expect(invocation.argv).toEqual(argv);
    const route = JSON.parse(text) as Record<string, unknown>;
    expect(route.hyperedgeIds).toEqual(['h-ab', 'h-bz']);
    expect(route.cost).toBe(3);
    // `--pretty` reached the CLI rather than being interpreted here, and the document came back
    // as it was printed — this tool does not re-serialize anything.
    expect(text).toBe(JSON.stringify(route, null, 2));
  });

  it('repeats a flag as many times as the call did', async () => {
    // A query takes one start and one target per occurrence, and a dropped or reordered one would
    // answer a different question, so the argv is compared as a sequence rather than a set.
    const argv = ['query', 'diagnose', '--start', 'A', '--target', 'Z', '--target', 'B'];

    const text = await call({ argv });

    const [invocation] = await cli.calls();
    expect(invocation.argv).toEqual(argv);
    expect((JSON.parse(text) as { targetPointIds: string[] }).targetPointIds).toEqual(['Z', 'B']);
  });

  it('answers closure and diagnosis from the graph it was handed', async () => {
    expect(await call({ argv: ['query', 'closure', '--start', 'A'] }))
      .toBe(JSON.stringify({ pointIds: ['A', 'B', 'Z'], startPointIds: ['A'] }));
    expect(await call({ argv: ['query', 'diagnose', '--start', 'A', '--target', 'Z'] }))
      .toBe(JSON.stringify({
        reachable: true,
        startPointIds: ['A'],
        targetPointIds: ['Z'],
        targetDiagnoses: [{ targetPointId: 'Z', blockingPointIds: [], cycles: [] }],
      }));
  });

  it('reports a non-zero exit and its stderr beside the output', async () => {
    const refused = await call({ argv: ['query', 'route'] });

    // The CLI's own usage failure: one JSON object on stderr, its own exit code, and the model
    // reads both rather than a thrown error it cannot inspect.
    expect(refused).toContain('--target');
    expect(refused).toContain('[stderr]');
    expect(refused).toContain('[exit code 64]');
  });

  it('refuses a call that is not one argv array', async () => {
    await expect(call({ argv: 'query route' })).rejects.toThrow(/argv/);
  });
});

describe('when the CLI is not there', () => {
  it('says so, and points at the skill that installs it', async () => {
    process.env.PATH = await mkdtemp(path.join(tmpdir(), 'derivon-cli-empty-'));

    const failure = call({ argv: ['point', 'list'] });

    await expect(failure).rejects.toThrow(new RegExp(DERIVON_TOOL_NAME));
    await expect(failure).rejects.toThrow(/derivon-cli/);
    await expect(failure).rejects.toThrow(/install/i);
  });
});

describe('when the workspace has no readable manifest', () => {
  it('says where it looked, and not that the CLI is missing', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'derivon-cli-bare-'));

    const failure = call({ argv: ['point', 'list'] }, derivonTool({ workspacePath: bare }));

    await expect(failure).rejects.toThrow(/workspace\.json/);
    await expect(failure).rejects.not.toThrow(/PATH/);
  });
});

describe('with no workspace open', () => {
  it('answers that there is no graph rather than reaching for one', async () => {
    await expect(call({ argv: ['point', 'list'] }, derivonTool({ workspacePath: null })))
      .rejects.toThrow(/workspace/i);
  });
});

describe('what the tool tells the model about itself', () => {
  it('points at the CLI and the skill instead of keeping a command table of its own', () => {
    const description = derivonTool({ workspacePath: workspace }).description;

    expect(description).toContain('--help');
    expect(description).toContain('derivon-cli');
    expect(description).toContain('stdin');
  });
});

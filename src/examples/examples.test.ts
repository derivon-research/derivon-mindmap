import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_SCHEMA, orientationErrors, parseWorkspaceContent } from '../workspace/index';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

function workspace(directory: string) {
  return parseWorkspaceContent({
    graph: read(`./${directory}/.derivon/workspace.json`),
    documents: {},
    companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: read(`./${directory}/.derivon/orientation.json`) } },
  });
}

describe.each(['replace-with', 'math-reforged'])('the %s example workspace', (directory) => {
  const content = workspace(directory);

  it('ships as a v1 manifest whose declared tags all match concepts', () => {
    expect(JSON.parse(content.graphText).schema).toBe(WORKSPACE_SCHEMA);
    expect(content.tags.length).toBeGreaterThan(0);
    for (const tag of content.tags) {
      expect(content.graph.points.filter((point) => point.data.tags?.includes(tag.id)).length).toBeGreaterThan(0);
    }
    expect(content.graph.points.filter((point) => !point.data.tags?.length)).toEqual([]);
  });

  it('ships an orientation configuration the learning side can run as-is', () => {
    expect(content.orientation.status).toBe('ready');
    expect(content.orientation.status !== 'absent' && orientationErrors(content.orientation.diagnostics)).toEqual([]);
  });
});

it('covers multiple targets and known initialization in the math-reforged case', () => {
  const content = workspace('math-reforged');
  const config = content.orientation.status === 'ready' ? content.orientation.config : null;
  expect(config!.seed.targets.length).toBeGreaterThan(0);
  expect(config!.seed.known.length).toBeGreaterThan(1);
  const multiTarget = config!.questions.flatMap((question) => question.options)
    .filter((option) => option.actions.some((action) => (action.points?.length ?? 0) > 1
      && (action.op === 'set-targets' || action.op === 'add-targets')));
  expect(multiTarget.length).toBeGreaterThan(0);
  const knownByTag = config!.questions.flatMap((question) => question.options)
    .filter((option) => option.actions.some((action) => action.op.endsWith('known') && (action.tags?.length ?? 0) > 0));
  expect(knownByTag.length).toBeGreaterThan(0);
});

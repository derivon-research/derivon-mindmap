import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openModelConfiguration } from './modelConfiguration';

/**
 * The claim under test is ADR-0010's: what the application offers is a function of its
 * own two files and nothing else. These cases are written from the operator's side —
 * each one is a way the configuration can be wrong, and each must produce a catalog
 * plus a reason rather than a bare empty list.
 */

let directory: string;
const ambient = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'] as const;
let restore: Partial<Record<(typeof ambient)[number], string | undefined>>;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-model-config-'));
  restore = Object.fromEntries(ambient.map((name) => [name, process.env[name]]));
  for (const name of ambient) delete process.env[name];
});

afterEach(() => {
  for (const name of ambient) {
    if (restore[name] === undefined) delete process.env[name];
    else process.env[name] = restore[name];
  }
});

const writeModels = (providers: unknown) =>
  writeFile(path.join(directory, 'models.json'), JSON.stringify({ providers }));
const writeAuth = (content: string) => writeFile(path.join(directory, 'auth.json'), content);

const ownProvider = {
  fixture: {
    baseUrl: 'http://127.0.0.1:1/v1',
    api: 'openai-completions',
    apiKey: 'fixture-key',
    models: [{ id: 'fixture-model', name: 'Fixture Model' }],
  },
};

it('offers the models its own two files declare', async () => {
  await Promise.all([
    writeModels(ownProvider),
    writeAuth(JSON.stringify({ fixture: { type: 'api_key', key: 'fixture-key' } })),
  ]);
  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models).toEqual([
    { providerId: 'fixture', modelId: 'fixture-model', name: 'Fixture Model' },
  ]);
  expect(catalog.diagnosis).toBeUndefined();
});

it('ignores a provider the machine credentials through the environment', async () => {
  await Promise.all([writeModels(ownProvider), writeAuth('{}')]);
  process.env.ANTHROPIC_API_KEY = 'not-ours';

  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models.map((model) => model.providerId)).toEqual(['fixture']);
});

it('refuses to resolve a model whose provider is credentialled from outside', async () => {
  await Promise.all([writeModels(ownProvider), writeAuth('{}')]);
  process.env.ANTHROPIC_API_KEY = 'not-ours';
  const configuration = await openModelConfiguration(directory);

  await expect(configuration.resolve('anthropic', 'claude-sonnet-4-5'))
    .rejects.toThrow(/auth\.json/);
});

it('names both files on a first run instead of showing an empty list', async () => {
  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models).toEqual([]);
  expect(catalog.diagnosis).toContain(path.join(directory, 'models.json'));
  expect(catalog.diagnosis).toContain(path.join(directory, 'auth.json'));
});

it('reports an unparseable models.json rather than resolving to nothing', async () => {
  await Promise.all([
    writeFile(path.join(directory, 'models.json'), '{ providers: '),
    writeAuth('{}'),
  ]);

  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models).toEqual([]);
  expect(catalog.diagnosis).toMatch(/models\.json/);
});

it('says the declared providers have no credential when both files are valid but empty', async () => {
  await Promise.all([writeModels({}), writeAuth('{}')]);

  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models).toEqual([]);
  expect(catalog.diagnosis).toContain('auth.json');
});

it('leaves a model the catalog does not name without one', async () => {
  await Promise.all([
    writeModels({
      fixture: {
        baseUrl: 'http://127.0.0.1:1/v1',
        api: 'openai-completions',
        apiKey: 'fixture-key',
        models: [{ id: 'unnamed-model' }],
      },
    }),
    writeAuth('{}'),
  ]);

  const catalog = await (await openModelConfiguration(directory)).listAvailable();

  expect(catalog.models).toEqual([{ providerId: 'fixture', modelId: 'unnamed-model' }]);
});

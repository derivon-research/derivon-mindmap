import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSeedManifest, seedNotes, type SeedManifest } from './skillsSeed';

const seed = (overrides: Partial<SeedManifest> = {}): SeedManifest => ({
  repository: 'derivon-research/skills',
  revision: '8466baad58c7f325fcfdb32874d8187d151481c8',
  skills: ['derivon-mindmap', 'derivon-cli'],
  ...overrides,
});

async function writeManifest(body: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'derivon-seed-manifest-'));
  const file = path.join(directory, 'manifest.json');
  await writeFile(file, body);
  return file;
}

describe('readSeedManifest', () => {
  it('reads what the prepare step writes', async () => {
    const file = await writeManifest(JSON.stringify({
      repository: 'derivon-research/skills',
      revision: '8466baad58c7f325fcfdb32874d8187d151481c8',
      surfaceVersion: '0.3.0',
      digest: 'abc',
      skills: ['derivon-mindmap', 'derivon-cli'],
    }));

    expect(readSeedManifest(file)).toEqual({
      repository: 'derivon-research/skills',
      revision: '8466baad58c7f325fcfdb32874d8187d151481c8',
      surfaceVersion: '0.3.0',
      skills: ['derivon-mindmap', 'derivon-cli'],
    });
  });

  it('reads a seed whose surface declared no version', async () => {
    const file = await writeManifest(JSON.stringify({
      repository: 'derivon-research/skills', revision: 'abc', surfaceVersion: null, skills: ['derivon-mindmap'],
    }));

    expect(readSeedManifest(file)?.surfaceVersion).toBeUndefined();
  });

  it('says nothing when there is no manifest to read', async () => {
    // A development build, a bundle prepared without the seed step, or a path the bridge did not
    // pass: all the same situation, and none of them an error.
    expect(readSeedManifest(undefined)).toBeUndefined();
    expect(readSeedManifest('')).toBeUndefined();
    expect(readSeedManifest('/nowhere/manifest.json')).toBeUndefined();
    expect(readSeedManifest(await writeManifest('not json'))).toBeUndefined();
    expect(readSeedManifest(await writeManifest('{"revision":"abc"}'))).toBeUndefined();
  });
});

describe('seedNotes', () => {
  it('says nothing when the seed is installed and nothing claims a version', () => {
    expect(seedNotes({
      seed: seed(),
      installedSkills: ['derivon-mindmap', 'derivon-cli'],
      installedSurfaceVersion: undefined,
    })).toEqual([]);
  });

  it('says which bundled skill is not in the skills root', () => {
    const notes = seedNotes({
      seed: seed(),
      installedSkills: ['derivon-mindmap'],
      installedSurfaceVersion: undefined,
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('derivon-cli');
    // It is a configuration state, not a failure: the root is the operator's and a session works
    // without the skill.
    expect(notes[0]).toContain('不在技能根里');
  });

  /** The point of the whole comparison: a difference is reported, never enforced. */
  it('reports a version the surface declares which differs from the shipped one', () => {
    const notes = seedNotes({
      seed: seed({ surfaceVersion: '0.3.0' }),
      installedSkills: ['derivon-mindmap', 'derivon-cli'],
      installedSurfaceVersion: '0.4.0',
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('0.4.0');
    expect(notes[0]).toContain('0.3.0');
    // No ordering is claimed: this function does not own version parsing, and a wrong "newer" is
    // worse than none.
    expect(notes[0]).not.toContain('更新');
  });

  it('says nothing when the two agree', () => {
    expect(seedNotes({
      seed: seed({ surfaceVersion: '0.3.0' }),
      installedSkills: ['derivon-mindmap', 'derivon-cli'],
      installedSurfaceVersion: '0.3.0',
    })).toEqual([]);
  });

  it('says nothing about a version either side does not declare', () => {
    // The revision pinned today declares nothing, so this is the state a fresh install is in —
    // and it must be silent rather than inventing one side of the comparison.
    const declared = { installedSkills: ['derivon-mindmap', 'derivon-cli'] };
    expect(seedNotes({ ...declared, seed: seed(), installedSurfaceVersion: '0.4.0' })).toEqual([]);
    expect(seedNotes({ ...declared, seed: seed({ surfaceVersion: '0.3.0' }), installedSurfaceVersion: undefined })).toEqual([]);
  });

  it('says nothing at all without a seed', () => {
    expect(seedNotes({
      seed: undefined,
      installedSkills: [],
      installedSurfaceVersion: '0.4.0',
    })).toEqual([]);
  });
});

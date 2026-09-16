import { readFileSync } from 'node:fs';

/**
 * What the bundle ships as a seed: the revision it was prepared from, and what that revision's
 * surface declared about itself at the time.
 *
 * Written by `scripts/prepare-skills-seed.mjs`, never by hand. `surfaceVersion` is `null` when the
 * seeded surface declared no version — which is the state of the revision pinned today.
 */
export type SeedManifest = {
  readonly repository: string;
  readonly revision: string;
  readonly surfaceVersion?: string;
  readonly skills: readonly string[];
};

/**
 * The seed manifest the bundle shipped, or nothing.
 *
 * An absent or unreadable manifest is not an error: a development build may never have run the
 * prepare step, and a session without these skills is still a usable session. It is also read
 * once, at startup, because it describes the bundle rather than anything the operator changes.
 */
export function readSeedManifest(path: string | undefined): SeedManifest | undefined {
  if (!path) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (!Array.isArray(value.skills)) return undefined;
    return {
      repository: typeof value.repository === 'string' ? value.repository : '',
      revision: typeof value.revision === 'string' ? value.revision : '',
      // A version of the wrong type is not a version: leaving it out keeps "declares nothing"
      // distinguishable from "declares this", which is what the comparison rests on.
      ...(typeof value.surfaceVersion === 'string' && value.surfaceVersion
        ? { surfaceVersion: value.surfaceVersion }
        : {}),
      skills: value.skills.filter((skill): skill is string => typeof skill === 'string'),
    };
  } catch {
    return undefined;
  }
}

/**
 * What the seed and the installation disagree about, as lines for the operator.
 *
 * Two different questions, and only one of them is about versions:
 *
 * - A skill the bundle carries that is not in the skills root. Installation happens on the first
 *   run that creates the root, so this is a seed that could not be copied, or a skill the operator
 *   deleted on purpose. Either way it is worth saying, and it is not a failure — the session works
 *   without it.
 * - A version difference. Reported and nothing more: the application ships a seed and names it, the
 *   installed skill names itself, and the two are allowed to differ (ADR-0013). No ordering is
 *   claimed, because claiming "newer" would mean parsing versions this function does not own — and
 *   a wrong ordering is worse than no ordering.
 *
 * Neither question is answered by guessing: a surface that declares no version produces no version
 * line, because "unknown" is not "different".
 */
export function seedNotes(options: {
  readonly seed: SeedManifest | undefined;
  readonly installedSkills: readonly string[];
  readonly installedSurfaceVersion: string | undefined;
}): readonly string[] {
  const { seed, installedSkills, installedSurfaceVersion } = options;
  if (!seed) return [];
  const notes = seed.skills
    .filter((skill) => !installedSkills.includes(skill))
    .map((skill) => `随包的基础技能 ${skill} 不在技能根里。应用可能没能把它装进去；可以从应用包内的 skills-seed 目录拷贝一份到 ~/.derivon/skills/。`);
  const shipped = seed.surfaceVersion;
  if (shipped && installedSurfaceVersion && shipped !== installedSurfaceVersion) {
    notes.push(`技能面声明自己的版本是 ${installedSurfaceVersion}，应用随包的是 ${shipped}。技能版本不与应用版本绑定，两者不同是允许的；这条只把差异说出来。`);
  }
  return notes;
}

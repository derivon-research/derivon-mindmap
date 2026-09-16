#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The base skills the desktop bundle ships, fetched from a pinned revision of the skills
 * repository.
 *
 * Pinned for the same reason `prepare-companion.mjs` pins the Node runtime: a release has to be
 * reproducible, and a seed that moved with whatever the skills repository's default branch
 * happened to be would make two builds of the same application version differ. The revision is
 * a build input, not a runtime authority — see
 * `docs/adr/0013-who-owns-the-user-level-skills-root.md`.
 *
 * The base set is two skills. `derivon-mindmap` carries the script command surface, and
 * `derivon-cli` is what the `derivon` tool needs installed. The other four skills in that
 * repository are methodology for an operator's own agents elsewhere, and are not this
 * application's sessions.
 */
const SKILLS_REPOSITORY = 'derivon-research/skills';
const SKILLS_REVISION = '8466baad58c7f325fcfdb32874d8187d151481c8';
const BASE_SKILLS = ['derivon-mindmap', 'derivon-cli'];

/** Where the Tauri bundle picks the seed up from. Mirrors `dist-companion/`. */
const DESTINATION = 'dist-skills';
/** Where one download is kept between runs, so a rebuild does not fetch again. */
const CACHE = path.join('.skills-seed');

const revisionArgument = process.argv.indexOf('--revision');
const revision = revisionArgument >= 0 ? process.argv[revisionArgument + 1] : SKILLS_REVISION;
const force = process.argv.includes('--force');
if (!revision || !/^[0-9a-f]{7,40}$/.test(revision)) {
  console.error(`prepare-skills-seed: not a revision: ${revision ?? '(missing)'}`);
  process.exitCode = 1;
}

/** The revision this build was prepared from, and the digest of what it produced. */
async function existingManifest() {
  try {
    return JSON.parse(await readFile(path.join(DESTINATION, 'manifest.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Every file under a directory, workspace-relative and sorted.
 *
 * Sorted because the digest must not depend on the order the filesystem happens to hand
 * entries back in — the whole point of recording it is that two builds of the same revision
 * agree.
 */
async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, root);
    return [path.relative(root, entryPath).split(path.sep).join('/')];
  }));
  return nested.flat().sort();
}

/**
 * One digest over the seed's contents: each file's path and its bytes.
 *
 * Recorded so a rebuild from the same revision can be checked against what the last build
 * produced. GitHub publishes no checksum for an archive of a commit, so the revision is not
 * verified against an external source — this makes the *contents* verifiable instead, which is
 * what a release is actually claiming.
 */
async function contentDigest(directory) {
  const hash = createHash('sha256');
  for (const file of await listFiles(directory)) {
    hash.update(file);
    hash.update(await readFile(path.join(directory, file)));
  }
  return hash.digest('hex');
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function fetchArchive() {  await mkdir(CACHE, { recursive: true });
  const archivePath = path.join(CACHE, 'skills.tar.gz');
  try {
    // Already fetched for this revision: codeload archives are immutable, so there is nothing
    // to check. `--force` is for the case where the download itself is suspect.
    if (!force) {
      await readFile(archivePath);
      return archivePath;
    }
  } catch {
    // Not fetched yet, or asked to fetch again.
  }
  const url = `https://codeload.github.com/${SKILLS_REPOSITORY}/tar.gz/${revision}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status} ${response.statusText}`);
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  return archivePath;
}

/**
 * What the seeded surface says about itself.
 *
 * Asked of the artifact rather than kept as a second number here: `--capabilities` is the
 * surface's own account of what it is, and a version recorded separately would be a second
 * place to keep in step. A surface that declares none is a legitimate state — the manifest
 * records null, and the application then reports no difference, because "unknown" is not
 * "different".
 */
async function declaredVersion(seedDirectory) {
  const script = path.join(seedDirectory, 'derivon-mindmap', 'scripts', 'derivon-workspace.mjs');
  try {
    // The runtime this build is already running under, not one borrowed from PATH.
    const { stdout } = await run(process.execPath, [script, '--capabilities'], { maxBuffer: 16 * 1024 * 1024 });
    const value = JSON.parse(stdout);
    return typeof value.surfaceVersion === 'string' ? value.surfaceVersion : null;
  } catch (error) {
    // A seed whose surface cannot be asked is still a usable seed; only the comparison is lost.
    console.warn(`prepare-skills-seed: could not read the seeded surface's version: ${error.message}`);
    return null;
  }
}

async function prepare() {
  const current = await existingManifest();
  if (!force && current?.revision === revision) {
    console.log(`Skills seed already prepared from ${revision.slice(0, 12)}.`);
    return;
  }
  const archivePath = await fetchArchive();
  const scratch = await mkdtemp(path.join(tmpdir(), 'derivon-skills-'));
  try {
    // `tar` reads the gzip archive on every platform this script supports.
    await run('tar', ['-xf', archivePath, '-C', scratch]);
    const [extracted] = await readdir(scratch);
    if (!extracted) throw new Error('the archive held no directory');
    const source = path.join(scratch, extracted);

    await rm(DESTINATION, { recursive: true, force: true });
    await mkdir(DESTINATION, { recursive: true });
    for (const skill of BASE_SKILLS) {
      if (!await exists(path.join(source, skill))) {
        throw new Error(`${SKILLS_REPOSITORY}@${revision.slice(0, 12)} has no ${skill} skill`);
      }
      // Node's own copy, not `cp`: this runs on Windows too, where there is no `cp`.
      await cp(path.join(source, skill), path.join(DESTINATION, skill), { recursive: true });
    }

    const manifest = {
      repository: SKILLS_REPOSITORY,
      revision,
      // What the seeded surface declares about itself, or null when it declares nothing.
      surfaceVersion: await declaredVersion(DESTINATION),
      digest: await contentDigest(DESTINATION),
      skills: BASE_SKILLS,
    };
    await writeFile(path.join(DESTINATION, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Skills seed prepared from ${SKILLS_REPOSITORY}@${revision.slice(0, 12)} (${manifest.digest.slice(0, 12)}).`);
    console.log(`  surface version: ${manifest.surfaceVersion ?? '(declares none)'}`);
    console.log(`  skills: ${BASE_SKILLS.join(', ')}`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

prepare().catch((error) => {
  console.error(`prepare-skills-seed: ${error.message}`);
  process.exitCode = 1;
});

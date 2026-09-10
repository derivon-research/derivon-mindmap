import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The Node runtime the desktop bundle ships.
 *
 * Pinned rather than taken from `process.execPath`: a developer's own `node` is often a
 * small launcher linked against `@rpath/libnode.*.dylib` and a tree of package-manager
 * dylibs (Homebrew and Nix both build it that way), so copying that one file produces a
 * binary that cannot start — on this machine or on a user's. The official builds are
 * self-contained, and pinning them also makes the bundle reproducible.
 *
 * Pi SDK requires >= 22.19.0.
 */
const NODE_VERSION = 'v22.23.2';

const triples = {
  darwin: { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' },
  linux: { arm64: 'aarch64-unknown-linux-gnu', x64: 'x86_64-unknown-linux-gnu' },
  win32: { arm64: 'x86_64-pc-windows-msvc', x64: 'x86_64-pc-windows-msvc' },
};

const distributions = {
  darwin: { arm64: 'darwin-arm64', x64: 'darwin-x64' },
  linux: { arm64: 'linux-arm64', x64: 'linux-x64' },
  win32: { arm64: 'win-x64', x64: 'win-x64' },
};

const triple = triples[process.platform]?.[process.arch];
const distribution = distributions[process.platform]?.[process.arch];
if (!triple || !distribution) {
  throw new Error(`Unsupported companion platform: ${process.platform}/${process.arch}`);
}

const windows = process.platform === 'win32';
const archive = `node-${NODE_VERSION}-${distribution}.${windows ? 'zip' : 'tar.gz'}`;
const cache = path.join('.node-runtime', NODE_VERSION);
const cached = path.join(cache, `node-${distribution}${windows ? '.exe' : ''}`);
const destination = path.join('src-tauri', 'binaries', `node-${triple}${windows ? '.exe' : ''}`);

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** The published checksum for this archive, so a truncated or swapped download fails here. */
async function expectedDigest() {
  const sums = await (await fetch(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`))
    .text();
  const line = sums.split('\n').find((entry) => entry.trim().endsWith(` ${archive}`));
  if (!line) throw new Error(`No published checksum for ${archive}`);
  return line.trim().split(/\s+/)[0];
}

async function fetchRuntime() {
  const [payload, digest] = await Promise.all([
    download(`https://nodejs.org/dist/${NODE_VERSION}/${archive}`),
    expectedDigest(),
  ]);
  const actual = createHash('sha256').update(payload).digest('hex');
  if (actual !== digest) {
    throw new Error(`${archive} checksum mismatch: expected ${digest}, got ${actual}`);
  }

  const scratch = await mkdtemp(path.join(tmpdir(), 'derivon-node-'));
  try {
    const archivePath = path.join(scratch, archive);
    await writeFile(archivePath, payload);
    // `tar` reads both gzip and zip on every platform this script supports.
    await run('tar', ['-xf', archivePath, '-C', scratch]);
    const extracted = path.join(
      scratch,
      `node-${NODE_VERSION}-${distribution}`,
      ...(windows ? ['node.exe'] : ['bin', 'node']),
    );
    await mkdir(cache, { recursive: true });
    await copyFile(extracted, cached);
    await chmod(cached, 0o755);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Refuse to ship a runtime that needs libraries from this machine.
 *
 * This is the check that was missing: the previous script copied the developer's own
 * `node`, and the resulting bundle failed at `dyld: Library not loaded` rather than at
 * build time.
 */
async function assertSelfContained(file) {
  if (process.platform !== 'darwin') return;
  const { stdout } = await run('otool', ['-L', file]);
  const foreign = stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean)
    .filter((library) => !library.startsWith('/usr/lib/') && !library.startsWith('/System/'));
  if (foreign.length) {
    throw new Error(
      `${file} is not self-contained; it needs ${foreign.join(', ')}. `
      + 'The desktop bundle must not depend on libraries from the build machine.',
    );
  }
}

try {
  await readFile(cached);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  process.stdout.write(`Downloading Node ${NODE_VERSION} (${distribution}) for the companion…\n`);
  await fetchRuntime();
}

await assertSelfContained(cached);
await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { force: true });
await copyFile(cached, destination);
await chmod(destination, 0o755);

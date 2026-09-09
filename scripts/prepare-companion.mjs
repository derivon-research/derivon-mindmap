import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const triples = {
  darwin: { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' },
  linux: { arm64: 'aarch64-unknown-linux-gnu', x64: 'x86_64-unknown-linux-gnu' },
  win32: { arm64: 'x86_64-pc-windows-msvc', x64: 'x86_64-pc-windows-msvc' },
};

const triple = triples[process.platform]?.[process.arch];
if (!triple) throw new Error(`Unsupported companion platform: ${process.platform}/${process.arch}`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  throw new Error(`Pi SDK requires Node >=22.19.0; found ${process.versions.node}`);
}

const destination = path.join('src-tauri', 'binaries', `node-${triple}${process.platform === 'win32' ? '.exe' : ''}`);
await mkdir(path.dirname(destination), { recursive: true });
await unlink(destination).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
});
await writeFile(destination, await readFile(process.execPath));
await chmod(destination, 0o755);

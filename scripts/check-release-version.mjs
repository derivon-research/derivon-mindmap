import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

function readManifestVersion(path) {
  const match = fs.readFileSync(path, "utf8").match(/^version = "([^"]+)"$/m);
  if (!match) throw new Error(`No version found in ${path}`);
  return match[1];
}

function readLockedPackageVersion(path, packageName) {
  const text = fs.readFileSync(path, "utf8");
  for (const block of text.split("[[package]]").slice(1)) {
    const name = block.match(/^\s*name = "([^"]+)"$/m)?.[1];
    const version = block.match(/^\s*version = "([^"]+)"$/m)?.[1];
    if (name === packageName && version) return version;
  }
  throw new Error(`Package ${packageName} not found in ${path}`);
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock root package", packageLock.packages?.[""]?.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", readManifestVersion("src-tauri/Cargo.toml")],
  ["src-tauri/Cargo.lock", readLockedPackageVersion("src-tauri/Cargo.lock", "derivon-app")],
]);

const expected = process.argv[2] ?? process.env.RELEASE_VERSION ?? packageJson.version;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if (!semver.test(expected)) throw new Error(`Invalid release version: ${expected}`);

const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  for (const [file, version] of mismatches) {
    console.error(`${file}: expected ${expected}, found ${version ?? "missing"}`);
  }
  process.exit(1);
}

if (packageJson.license !== "MIT") throw new Error("package.json must declare the MIT license");
if (tauriConfig.bundle?.license !== "MIT") throw new Error("Tauri bundle must declare the MIT license");
if (!fs.existsSync("LICENSE")) throw new Error("LICENSE is missing");

console.log(`Release metadata is consistent at ${expected}.`);

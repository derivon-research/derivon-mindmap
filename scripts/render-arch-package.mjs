import fs from "node:fs";
import path from "node:path";

const [version, sourceUrl, checksum, outputDir = "dist/arch"] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  throw new Error("usage: render-arch-package.mjs <version> <source-url> <sha256> [output-dir]");
}
if (!/^(?:https?|file):\/\//.test(sourceUrl ?? "")) {
  throw new Error("source URL must use HTTP(S) or file://");
}
if (!/^[0-9a-f]{64}$/.test(checksum ?? "")) throw new Error("source checksum must be SHA-256");

const template = fs.readFileSync("packaging/arch/PKGBUILD.in", "utf8");
const pkgbuild = template
  .replaceAll("@VERSION@", version)
  .replaceAll("@SOURCE_URL@", sourceUrl)
  .replaceAll("@SOURCE_SHA256@", checksum);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "PKGBUILD"), pkgbuild);
console.log(`Rendered ${path.join(outputDir, "PKGBUILD")}`);

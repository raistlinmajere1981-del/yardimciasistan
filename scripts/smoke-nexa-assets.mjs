import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { nexaRuntimePaths } from "./nexa-assets.mjs";

const manifest = JSON.parse(readFileSync("assets/nexa/manifest.json", "utf8"));
const uniquePaths = new Set();
for (const asset of manifest.assets) {
  const bytes = readFileSync(asset.assetPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(asset.static, true);
  assert.equal(asset.motionSafe, true);
  if (asset.format === "image/webp") {
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(bytes.toString("ascii", 12, 16), "VP8L");
    const bits = bytes.readUInt32LE(21);
    assert.equal((bits & 0x3fff) + 1, asset.dimensions.width);
    assert.equal(((bits >>> 14) & 0x3fff) + 1, asset.dimensions.height);
    assert.ok(bits & (1 << 28), "Real alpha must be present");
    assert.equal(asset.fallback, undefined);
  }
  if (asset.format === "image/svg+xml") assert.ok(bytes.toString().includes('<svg '));
  uniquePaths.add(asset.assetPath);
}
const walk = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
const hashes = new Set();
for (const path of walk("assets/nexa").filter((p) => p.endsWith(".webp"))) {
  assert.ok(uniquePaths.has(path), `Unreferenced WebP: ${path}`);
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.ok(!hashes.has(hash), `Duplicate WebP export: ${path}`); hashes.add(hash);
}
for (const folder of ["states", "desktop", "web"]) assert.ok(walk(`assets/nexa/${folder}`).every((p) => p.endsWith(".webp")));
assert.ok(walk("assets/nexa/habitat").every((p) => p.endsWith(".svg")));
for (const value of Object.values(manifest.sources)) {
  for (const path of typeof value === "string" ? [value] : Object.values(value)) assert.ok(existsSync(path), path);
}
for (const surface of ["desktop", "web"]) {
  const paths = nexaRuntimePaths(surface);
  assert.ok(paths.length > 0);
  assert.ok(paths.every((p) => p.endsWith(".webp") || p.endsWith(".svg")));
  assert.ok(paths.every((p) => !/\/(master|quality)\//.test(p)));
}
console.log("nexa-assets-smoke-ok");

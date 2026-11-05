import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalProvenance, checkCopy, moduleInventory, safePath, vendorRoot } from "../../../web-site-template/tools/sync-effect-engine.mjs";

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studioRoot = safePath(process.env.EFEKT_ATOLYESI_ROOT
  ? resolve(process.env.EFEKT_ATOLYESI_ROOT)
  : resolve(adminRoot, "../../../EfektAtolyesi"));
const output = safePath(join(adminRoot, "public", "effect-studio"));
const provenancePath = join(adminRoot, "effect-engine-provenance.json");
const required = ["index.html", "styles.css", "scene.html", "scene.css", "src", "assets", "examples"];
const mode = process.argv[2];
if (process.argv.length > 3 || (mode && !["--check", "--write-provenance"].includes(mode))) throw Error("Usage: sync-effect-studio.mjs [--check|--write-provenance]");
const provenance = await canonicalProvenance(studioRoot);
// The template must be explicitly authored first; Admin cannot silently heal it.
checkCopy(vendorRoot, provenance);
for (const name of required) {
  if (!existsSync(join(studioRoot, name))) throw Error("Efekt Atölyesi eksik: " + name);
}
if (mode) {
  for (const name of required) {
    safePath(join(output, name));
    if (!existsSync(join(output, name))) throw Error("Admin snapshot missing: " + name + "; run explicit effect:sync");
  }
  if (mode === "--write-provenance") {
    // Adopt an already identical snapshot without touching any editor/scene files.
    if (JSON.stringify(moduleInventory(output)) !== JSON.stringify(provenance.files)) throw Error("Admin engine differs; explicit sync required");
    safePath(provenancePath);
    writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
  }
  checkCopy(output, provenance, {strict: false, provenancePath});
} else {
  // Validate the full editor tree before copying; no symlink escapes into other projects.
  function inspect(path) {
    safePath(path);
    const entry = lstatSync(path);
    if (entry.isDirectory()) for (const child of readdirSync(path)) inspect(join(path, child));
    else if (!entry.isFile()) throw Error("Unexpected editor source entry: " + path);
  }
  for (const name of required) inspect(join(studioRoot, name));
  mkdirSync(dirname(output), {recursive: true});
  const work = mkdtempSync(output + ".stage-"), stage = join(work, "next"), backup = join(work, "previous");
  let moved = false;
  try {
    for (const name of required) cpSync(join(studioRoot, name), join(stage, name), {recursive: true});
    writeFileSync(join(stage, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
    checkCopy(stage, provenance, {strict: false});
    if (existsSync(output)) { renameSync(output, backup); moved = true; }
    try {
      renameSync(stage, output);
      safePath(provenancePath);
      writeFileSync(provenancePath, readFileSync(join(output, "provenance.json")));
    } catch (error) {
      if (moved) { rmSync(output, {recursive: true, force: true}); renameSync(backup, output); moved = false; }
      throw error;
    }
  } finally {
    // A failed rollback leaves the last good tree at work/previous for recovery.
    if (!moved || existsSync(output)) rmSync(work, {recursive: true, force: true});
  }
}
console.log(`effect-studio-${mode === "--check" ? "check" : "sync"}-ok: ${Object.keys(provenance.files).length} modules, ${provenance.fingerprint}`);

import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalEngineRoot, canonicalProvenance, checkCopy, moduleInventory, safePath, vendorRoot } from "../../../web-site-template/tools/sync-effect-engine.mjs";

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = safePath(canonicalEngineRoot);
const editorRoot = safePath(join(adminRoot, "effects-source"));
const output = safePath(join(adminRoot, "public", "effect-studio"));
const provenancePath = join(adminRoot, "effect-engine-provenance.json");
const required = ["index.html", "styles.css", "assets", "examples"];
const mode = process.argv[2];
if (process.argv.length > 3 || (mode && !["--check", "--write-provenance"].includes(mode))) throw Error("Usage: sync-effect-studio.mjs [--check|--write-provenance]");
const provenance = await canonicalProvenance(engineRoot);
// The template must be explicitly authored first; Admin cannot silently heal it.
checkCopy(vendorRoot, provenance);
for (const name of required) {
  if (!existsSync(join(editorRoot, name))) throw Error("Site efekt editörü eksik: " + name);
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
  const expectedEditor = moduleInventory(engineRoot);
  if (JSON.stringify(expectedEditor) !== JSON.stringify(moduleInventory(output)))
    throw Error("Admin runtime and Channel Foundry engine diverged.");
  // Ensure optional editor source isn't a stale second implementation.
  function assertEditorParity(rootA, rootB) {
    const walk = (root, prefix = "") => readdirSync(root, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => {
      const relative = prefix ? prefix+"/"+e.name : e.name;
      if (e.isDirectory()) return walk(join(root,e.name),relative);
      if (!e.isFile() || e.isSymbolicLink()) throw Error("Unsupported editor source: "+relative);
      return [relative];
    });
    const names=walk(rootA);
    if (JSON.stringify(names)!==JSON.stringify(walk(rootB))) throw Error("Admin editor inventory differs");
    for(const name of names)if(!readFileSync(join(rootA,name)).equals(readFileSync(join(rootB,name))))
      throw Error("Admin editor content differs: "+name);
  }
  assertEditorParity(join(engineRoot, "src/editor"),join(output, "src/editor"));
} else {
  // Validate the full editor tree before copying; no symlink escapes into other projects.
  function inspect(path) {
    safePath(path);
    const entry = lstatSync(path);
    if (entry.isDirectory()) for (const child of readdirSync(path)) inspect(join(path, child));
    else if (!entry.isFile()) throw Error("Unexpected editor source entry: " + path);
  }
  for (const name of required) inspect(join(editorRoot, name));
  inspect(join(engineRoot, "src"));
  mkdirSync(dirname(output), {recursive: true});
  const work = mkdtempSync(output + ".stage-"), stage = join(work, "next"), backup = join(work, "previous");
  let moved = false;
  try {
    for (const name of required) cpSync(join(editorRoot, name), join(stage, name), {recursive: true});
    // Only Channel Foundry owns editor and engine JavaScript.
    // Admin receives a reviewed, byte-identical snapshot for its own sites.
    cpSync(join(engineRoot, "src"), join(stage, "src"), {recursive: true});
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

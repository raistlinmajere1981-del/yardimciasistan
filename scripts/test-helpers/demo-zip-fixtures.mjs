import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DEMO_VERSION, sha256File } from "../demo-data/lib/util.mjs";

const packIds = ["a-pension-restaurant", "b-market", "c-market-dealer"];
const cacheRoot = path.resolve("artifacts/verify/demo-zip-fixtures");
const schemaSha256 = () => sha256File("apps/desktop-app/db/schema.sql");

function findArchives(directory, ids, schemaHash) {
  const manifestPath = path.join(directory, "demo-data-manifest.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
  if (manifest?.format !== "yardimci-asistan-demo-data-manifest"
      || manifest.version !== DEMO_VERSION || manifest.schemaSha256 !== schemaHash
      || !Array.isArray(manifest.packages)) return null;
  const archives = ids.map(id => {
    const pack = manifest.packages.find(item => item.id === id);
    if (!pack?.verification?.ok || typeof pack.zipFile !== "string" || !/^[\w.+-]+\.zip$/.test(pack.zipFile)) return null;
    const archive = path.join(directory, pack.zipFile);
    const stat = fs.statSync(archive, { throwIfNoEntry: false });
    return stat?.isFile() && stat.size === pack.zipSizeBytes
      && sha256File(archive) === pack.zipSha256 ? archive : null;
  });
  return archives.every(Boolean) ? archives : null;
}

export function prepareDemoZipFixtures(ids = packIds, { regenerate = false } = {}) {
  const schemaHash = schemaSha256();
  const versionCache = path.join(cacheRoot, `${DEMO_VERSION}-${schemaHash}`);
  fs.mkdirSync(versionCache, { recursive: true });
  if (!regenerate) {
    const cached = fs.readdirSync(versionCache, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
      .map(entry => path.join(versionCache, entry.name));
    for (const directory of ["artifacts/demo-data", ...cached]) {
      const archives = findArchives(directory, ids, schemaHash);
      if (archives) return archives;
    }
  }
  const staging = fs.mkdtempSync(path.join(versionCache, ".generate-"));
  try {
    execFileSync(process.execPath, ["scripts/demo-data/generate-demo-data.mjs", "--output", staging, "--only", ids.join(",")], { stdio: "inherit" });
    const archives = findArchives(staging, ids, schemaHash);
    if (!archives) throw new Error("Güncel demo ZIP fixture'ları oluşturulamadı.");
    const destination = path.join(versionCache, path.basename(staging).replace(".generate-", "ready-"));
    fs.renameSync(staging, destination);
    return archives.map(archive => path.join(destination, path.basename(archive)));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

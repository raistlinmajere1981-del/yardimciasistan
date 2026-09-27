import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = join(repoRoot, "artifacts");
const installInfoPath = join(artifactsRoot, "web-module-deploy", "install-info.txt");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const deleteInstallInfo = args.has("--all");

for (const arg of args) {
  if (!["--dry-run", "--all"].includes(arg)) {
    throw new Error(`Bilinmeyen seçenek: ${arg}`);
  }
}

if (!existsSync(artifactsRoot)) {
  console.log("artifact-clean-ok: artifacts/ zaten yok.");
  process.exit(0);
}

const before = summarize(artifactsRoot);
const preservedInstallInfo = !deleteInstallInfo && existsSync(installInfoPath)
  ? readFileSync(installInfoPath)
  : null;

if (dryRun) {
  console.log(`artifacts/: ${before.files} dosya, ${formatBytes(before.bytes)}`);
  console.log(preservedInstallInfo
    ? "Korunacak: artifacts/web-module-deploy/install-info.txt"
    : "Korunacak dosya yok.");
  console.log("Dry-run: hiçbir dosya silinmedi.");
  process.exit(0);
}

rmSync(artifactsRoot, { recursive: true, force: true });

if (preservedInstallInfo) {
  mkdirSync(dirname(installInfoPath), { recursive: true });
  writeFileSync(installInfoPath, preservedInstallInfo, { mode: 0o600 });
}

console.log(
  `artifact-clean-ok: ${before.files} dosya / ${formatBytes(before.bytes)} temizlendi` +
  (preservedInstallInfo ? "; install-info.txt korundu." : ".")
);

function summarize(root) {
  let files = 0;
  let bytes = 0;
  walk(root);
  return { files, bytes };

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      bytes += statSync(absolutePath).size;
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

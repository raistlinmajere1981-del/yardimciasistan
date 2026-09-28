import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { BLACKSEA_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { runCommand } from "./exec.mjs";

/**
 * kind:"builtin" taskların gerçek işlemleri. Komut değil, panel içi
 * dosya/derleme işlemleri; hepsi Node API ile (shell yok).
 */

function fileHash(path) {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
  } catch {
    return "-";
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function listFilesRecursive(root, base = "") {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, base), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFilesRecursive(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

function artifactRoots() {
  const roots = [join(REPO_ROOT, "artifacts")];
  const rel = join(REPO_ROOT, "apps", "desktop-app", "release");
  if (existsSync(rel)) roots.push(rel);
  const apk = join(REPO_ROOT, "apps", "android-app", "build", "outputs");
  if (existsSync(apk)) roots.push(apk);
  return roots.filter((r) => existsSync(r));
}

export async function builtinShowArtifacts() {
  const lines = [];
  let totalFiles = 0;
  let totalBytes = 0;
  for (const root of artifactRoots()) {
    lines.push(`\n${root}`);
    const files = listFilesRecursive(root)
      .filter((f) => !f.endsWith(".log"))
      .sort();
    const interesting = files.filter((f) => /\.(exe|AppImage|apk|aab|zip|tar\.gz|tar|deb|rpm|dmg)$/.test(f));
    const shown = interesting.length > 0 ? interesting : files.slice(0, 30);
    for (const f of shown) {
      const abs = join(root, f);
      let size = 0;
      try { size = statSync(abs).size; } catch { /* yok say */ }
      totalFiles += 1;
      totalBytes += size;
      lines.push(`  ${f}  ${formatBytes(size)}  sha256:${fileHash(abs)}`);
    }
    if (interesting.length === 0 && files.length > shown.length) {
      lines.push(`  ... (${files.length - shown.length} dosya daha)`);
    }
  }
  if (lines.length === 0) return { exitCode: 1, stdout: "", stderr: "Artifact bulunamadı (önce build/pack çalıştırın).", durationMs: 0, timedOut: false };
  lines.push(`\nToplam listelenen: ${totalFiles} dosya / ${formatBytes(totalBytes)}`);
  lines.push("Not: build ile deploy ayrıdır; buradaki dosyalar yayınlanmaz.");
  return { exitCode: 0, stdout: lines.join("\n"), stderr: "", durationMs: 0, timedOut: false };
}

export function desktopDataTargets() {
  const override = process.env.YA_DESKTOP_DATA_DIR?.trim();
  const dataRoot = override ? override : join(REPO_ROOT, "data");
  const names = ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm", "yardimci-asistan.sqlite-journal"];
  return { dataRoot, files: names.map((n) => join(dataRoot, n)).filter((p) => existsSync(p)) };
}

export async function builtinDesktopDataClean() {
  const { dataRoot, files } = desktopDataTargets();
  if (files.length === 0) {
    return { exitCode: 0, stdout: `Temizlenecek dosya yok (${dataRoot}).`, stderr: "", durationMs: 0, timedOut: false };
  }
  const removed = [];
  for (const f of files) {
    try { rmSync(f, { force: true }); removed.push(f); } catch (e) {
      return { exitCode: 1, stdout: removed.join("\n"), stderr: `Silinemedi: ${f} (${e instanceof Error ? e.message : e})`, durationMs: 0, timedOut: false };
    }
  }
  return { exitCode: 0, stdout: `Desktop verisi temizlendi:\n${removed.join("\n")}\nlogs/ ve backup/ korundu.`, stderr: "", durationMs: 0, timedOut: false };
}

export async function runBuiltin(name) {
  if (name === "show-artifacts") return builtinShowArtifacts();
  if (name === "desktop-data-clean") return builtinDesktopDataClean();
  if (name === "blacksea-missing") {
    return { exitCode: 1, stdout: "", stderr: `BlackSea reposu bağlı değil: ${BLACKSEA_ROOT}`, durationMs: 0, timedOut: false };
  }
  return { exitCode: 2, stdout: "", stderr: `Bilinmeyen builtin: ${name}`, durationMs: 0, timedOut: false };
}

export { BLACKSEA_ROOT, REPO_ROOT, runCommand };

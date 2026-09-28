import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BLACKSEA_ROOT, REPO_ROOT } from "../lib/paths.mjs";

/**
 * Riskli işlemler öncesi kısa preflight. Günlük basit testlerde
 * kullanılmaz; yalnızca registry'de preflight tanımlı tasklarda çalışır.
 * Secret/config DEĞERLERİ asla okunmaz ya da rapora dökülmez.
 */

function hasCommand(cmd, args = ["--version"]) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 8000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function adbDevices() {
  try {
    const r = spawnSync("adb", ["devices"], { encoding: "utf8", timeout: 10000 });
    if (r.status !== 0) return { ok: false, devices: [] };
    const devices = String(r.stdout ?? "").split("\n").slice(1)
      .map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split(/\s+/))
      .filter((p) => p[1] === "device")
      .map((p) => p[0]);
    return { ok: true, devices };
  } catch {
    return { ok: false, devices: [] };
  }
}

function checkRepo() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    return pkg.name === "yardimci-asistan"
      ? { name: "Doğru repo (yardimci-asistan)", ok: true, detail: REPO_ROOT }
      : { name: "Doğru repo", ok: false, detail: `package.json adı: ${pkg.name}` };
  } catch (e) {
    return { name: "Doğru repo", ok: false, detail: e instanceof Error ? e.message : "okunamadı" };
  }
}

function checkGitClean() {
  try {
    const r = spawnSync("git", ["status", "--porcelain=v1"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 8000 });
    if (r.status !== 0) return { name: "Working tree temiz", ok: false, detail: "git status çalışmadı" };
    const dirty = String(r.stdout ?? "").trim();
    return dirty
      ? { name: "Working tree temiz", ok: false, detail: `${dirty.split("\n").length} değişmiş dosya` }
      : { name: "Working tree temiz", ok: true, detail: "temiz" };
  } catch {
    return { name: "Working tree temiz", ok: false, detail: "kontrol edilemedi" };
  }
}

function checkYaSyncSecret() {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, "firm-template", "web-module", "config", "business.json"), "utf8"));
    const present = String(cfg.sync_secret ?? "").trim().length > 0;
    return { name: "YA sync secret", ok: true, required: false, detail: present ? "mevcut" : "yok (boş)" };
  } catch {
    return { name: "YA sync secret", ok: true, required: false, detail: "okunamadı" };
  }
}

function checkNatroEnv() {
  const present = existsSync(join(BLACKSEA_ROOT, ".deploy", "natro.env"));
  return { name: "Natro FTP config", ok: true, required: false, detail: present ? "mevcut (.deploy/natro.env)" : "yok (şifre terminalde sorulur)" };
}

const SUITES = {
  basic: () => [
    checkRepo(),
    { name: "node", ok: hasCommand("node"), detail: process.version, required: true },
    { name: "npm", ok: hasCommand("npm"), detail: "", required: true },
  ],
  "android-sdk": () => [
    ...SUITES.basic(),
    { name: "adb", ok: hasCommand("adb", ["version"]), detail: "", required: true },
    { name: "java", ok: hasCommand("java", ["-version"]), detail: "", required: true },
  ],
  android: () => {
    const dev = adbDevices();
    return [
      ...SUITES["android-sdk"](),
      { name: "ADB cihaz", ok: dev.ok && dev.devices.length > 0, detail: dev.devices.length > 0 ? dev.devices.join(", ") : "cihaz bağlı değil", required: true },
    ];
  },
  release: () => [...SUITES.basic(), { ...checkGitClean(), required: true }],
  "deploy-ya": () => [
    ...SUITES.basic(),
    { name: "ssh", ok: hasCommand("ssh", ["-V"]), detail: "", required: true },
    { name: "rsync", ok: hasCommand("rsync", ["--version"]), detail: "", required: true },
    { name: "php", ok: hasCommand("php", ["-v"]), detail: "", required: true },
    checkYaSyncSecret(),
  ],
  "deploy-blacksea": () => {
    const blackseaOk = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"));
    return [
      { name: "BlackSea reposu", ok: blackseaOk, detail: blackseaOk ? BLACKSEA_ROOT : "bağlı değil", required: true },
      { name: "lftp", ok: hasCommand("lftp", ["--version"]), detail: "", required: true },
      checkNatroEnv(),
    ];
  },
};

export function runPreflight(suite) {
  if (!suite || !SUITES[suite]) return { suite: suite ?? "yok", checks: [], ok: true };
  const checks = SUITES[suite]().map((c) => ({ required: true, ...c }));
  const failed = checks.filter((c) => c.required && !c.ok);
  return { suite, checks, ok: failed.length === 0, failed };
}

export function formatPreflight(result) {
  return result.checks.map((c) => `  [${c.ok ? "OK" : c.required ? "ERR" : "--"}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n");
}

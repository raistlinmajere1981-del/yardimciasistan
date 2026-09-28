import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BLACKSEA_ROOT, REPO_ROOT } from "../lib/paths.mjs";

/**
 * Ana ekran durum başlığı. Her şey hızlı ve yereldir; ekranı yavaşlatmaz.
 * adb sonucu process başına bir kez alınır (daemon ilk seferde yavaş olabilir).
 */
let adbCache = null;

function sh(cmd, args, { timeout = 6000, cwd = REPO_ROOT } = {}) {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout });
    return { status: r.status, out: String(r.stdout ?? "").trim(), err: String(r.stderr ?? "").trim() };
  } catch {
    return { status: 127, out: "", err: "timeout" };
  }
}

export function getAdbStatus() {
  if (adbCache) return adbCache;
  const d = sh("adb", ["devices", "-l"], { timeout: 8000 });
  if (d.status !== 0) {
    adbCache = { available: false, devices: [], note: "adb yok / çalışmadı" };
    return adbCache;
  }
  const devices = d.out.split("\n").slice(1).map((l) => l.trim()).filter(Boolean)
    .map((l) => {
      const p = l.split(/\s+/);
      const model = (l.match(/model:([^\s]+)/) ?? [])[1]?.replaceAll("_", " ") ?? "";
      return { serial: p[0], state: p[1], model };
    })
    .filter((x) => x.state === "device");
  adbCache = { available: true, devices, note: devices.length === 0 ? "cihaz bağlı değil" : "" };
  return adbCache;
}

export function resetAdbCache() { adbCache = null; }

export function getGitStatus() {
  const branch = sh("git", ["branch", "--show-current"]);
  const head = sh("git", ["rev-parse", "--short", "HEAD"]);
  const dirty = sh("git", ["status", "--porcelain=v1"]);
  const upstream = sh("git", ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);
  let ahead = null, behind = null;
  if (upstream.status === 0) {
    const [b, a] = upstream.out.split(/\s+/).map(Number);
    behind = b; ahead = a;
  }
  return {
    branch: branch.status === 0 && branch.out ? branch.out : "(detached)",
    head: head.status === 0 ? head.out : "?",
    dirtyCount: dirty.status === 0 && dirty.out ? dirty.out.split("\n").length : 0,
    ahead, behind,
  };
}

function secretPresence(path) {
  try {
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    return String(cfg.sync_secret ?? "").trim() ? "mevcut" : "yok";
  } catch {
    return "okunamadı";
  }
}

export function getEnvStatus() {
  const yaSecret = secretPresence(join(REPO_ROOT, "firm-template", "web-module", "config", "business.json"));
  const natroEnv = existsSync(join(BLACKSEA_ROOT, ".deploy", "natro.env")) ? "mevcut" : "yok";
  const blacksea = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh")) ? "bağlı" : "bağlı değil";
  return { yaSecret, natroEnv, blacksea };
}

export function renderStatusBar() {
  const g = getGitStatus();
  const adb = getAdbStatus();
  const env = getEnvStatus();
  const tree = g.dirtyCount === 0 ? "temiz" : `kirli (${g.dirtyCount} dosya)`;
  const sync = g.ahead === null ? "upstream yok" : `ahead ${g.ahead} / behind ${g.behind}`;
  const adbLine = !adb.available ? "adb yok" : adb.devices.length === 0
    ? "cihaz bağlı değil"
    : adb.devices.map((d) => d.model || d.serial).join(", ");
  return [
    `branch: ${g.branch}  HEAD: ${g.head}  tree: ${tree}  ${sync}`,
    `android: ${adbLine}`,
    `YA secret: ${env.yaSecret} · natro.env: ${env.natroEnv} · blacksea: ${env.blacksea} · node ${process.version}`,
  ].join("\n");
}

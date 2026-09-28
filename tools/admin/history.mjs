import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_DIR, HISTORY_FILE, HISTORY_LOG_DIR } from "./lib/paths.mjs";

const MAX_ENTRIES = 100;

function load() {
  try {
    const raw = readFileSync(HISTORY_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(entries) {
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
}

export function recordRun({ kind, refId, title, command, args = [], cwd = "repo", exitCode, durationMs, branch, commit, fullLog = "" }) {
  const entries = load();
  const seq = (entries[0]?.seq ?? 0) + 1;
  mkdirSync(HISTORY_LOG_DIR, { recursive: true });
  const logFile = join(HISTORY_LOG_DIR, `${seq}.log`);
  try {
    writeFileSync(logFile, fullLog.slice(0, 1_000_000));
  } catch { /* log yazılamazsa kayıt yine tutulur */ }
  const entry = {
    seq, ts: new Date().toISOString(), kind, refId, title,
    command, args, cwd, exitCode, pass: exitCode === 0,
    durationMs, branch: branch ?? "", commit: commit ?? "", logFile,
  };
  entries.unshift(entry);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  // Budanmış kayıtların log dosyalarını temizle.
  const live = new Set(trimmed.map((e) => `${e.seq}.log`));
  try {
    for (const f of readdirSync(HISTORY_LOG_DIR)) {
      if (!live.has(f)) rmSync(join(HISTORY_LOG_DIR, f), { force: true });
    }
  } catch { /* en iyi çaba */ }
  save(trimmed);
  return entry;
}

export function listRuns(limit = 20) {
  return load().slice(0, limit);
}

export function getRun(seq) {
  return load().find((e) => e.seq === Number(seq));
}

export function readLog(entry) {
  try {
    return readFileSync(entry.logFile, "utf8");
  } catch {
    return "(log dosyası bulunamadı)";
  }
}

export function lastPassFor(refId, branch = "", commit = "") {
  const entries = load().filter((e) => e.refId === refId);
  const lastPass = entries.find((e) => e.pass);
  if (!lastPass) return { lastPass: null, currentMismatch: false };
  const currentMismatch = Boolean(branch && commit)
    && (lastPass.branch !== branch || lastPass.commit !== commit);
  return { lastPass, currentMismatch };
}

export function historyLocation() {
  return { dir: HISTORY_DIR, file: HISTORY_FILE, exists: existsSync(HISTORY_FILE) };
}

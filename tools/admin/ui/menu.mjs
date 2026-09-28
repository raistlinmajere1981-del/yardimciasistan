import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { getSiteProfiles } from "../config/sites.mjs";
import { TASK_CATEGORIES, TASKS, getTask } from "../config/tasks.mjs";
import { copyText, saveReportFile } from "../clipboard.mjs";
import * as gitops from "../gitops.mjs";
import { getRun, lastPassFor, listRuns, readLog, recordRun } from "../history.mjs";
import { buildFullReport, buildSummary, formatDuration, timeAgo } from "../report.mjs";
import { runBuiltin } from "../runners/builtins.mjs";
import { formatCmd, runCommand } from "../runners/exec.mjs";
import { formatPreflight, runPreflight } from "../runners/preflight.mjs";
import { runSteps } from "../runners/workflow.mjs";
import { BLACKSEA_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { getGitStatus, renderStatusBar } from "./status.mjs";

const BACK_KEYS = new Set(["b", "B", "\x1b", "geri"]);

const SECTIONS = {
  checks: {
    title: "Kontroller", groups: [
      ["Presetler", ["dev-check", "full-verify", "release-check"]],
      ["Hızlı kontroller", ["doctor", "typecheck", "typecheck-electron", "lint", "lint-strict", "lint-php", "knip-strict", "test-all", "e2e", "arch-audit", "design-audit-strict"]],
      ["Bileşik kontroller", ["pilot-check", "pilot-check-android", "pilot-check-full", "check", "check-linux", "pre-main"]],
      ["Tekil smoke'lar", ["smoke-local-lab", "smoke-web-form-api", "smoke-web-module", "smoke-desktop-clean-startup", "smoke-diagnostics"]],
    ],
  },
  android: {
    title: "Android", groups: [
      ["Cihaz", ["android-devices", "android-launch", "android-screenshot", "android-dump", "android-mirror", "android-logcat"]],
      ["Build + kur", ["build-android-debug", "android-release-apk", "android-release-aab", "android-install-debug", "android-install-release", "android-install-nobuild", "android-install-launch", "android-release-flow"]],
      ["Cihaz verisi", ["android-clear-data", "android-uninstall"]],
      ["Bağlantı testleri", ["android-configure", "smoke-android-token", "smoke-android-release-conn", "smoke-android-approval", "smoke-local-companion"]],
      ["Bakım", ["android-clean"]],
    ],
  },
  build: {
    title: "Build / Release", groups: [
      ["Derleme", ["build-packages", "build-apps", "build-all"]],
      ["Paketleme", ["pack-desktop-dir", "pack-desktop-linux", "pack-desktop-win", "pack-desktop-win32", "pack-web-module", "android-release-apk", "android-release-aab"]],
      ["Release akışları", ["release-desktop-linux", "release-android"]],
      ["Artifact", ["show-artifacts"]],
    ],
  },
  fresh: {
    title: "Temiz Başlangıç", groups: [
      ["Sonuç seç", ["fresh-lab-once", "fresh-test-data", "fresh-desktop-data", "android-clear-data", "fresh-artifacts", "fresh-artifacts-all", "fresh-deps-cache", "fresh-full"]],
    ],
  },
  devtools: {
    title: "Geliştirici Araçları", groups: [
      ["Dev sunucuları (ön planda)", ["dev-desktop", "dev-local", "dev-php", "bs-dev"]],
      ["Tanılama", ["logs-list", "logs-latest", "logs-errors", "smoke-diagnostics", "doctor"]],
    ],
  },
};

export function createUI() {
  const rl = createInterface({ input, output, terminal: true });
  return {
    rl,
    close: () => rl.close(),
    ask: (q) => rl.question(q),
  };
}

function header(title) {
  return `\n===== ${title} =====\n${renderStatusBar()}\n${"-".repeat(60)}`;
}

async function askChoice(ui, title, items, { extra = [] } = {}) {
  console.log(header(title));
  items.forEach((it, i) => console.log(`  ${i + 1}) ${it.label}`));
  extra.forEach((e) => console.log(`  ${e.key}) ${e.label}`));
  console.log("  b) Geri   /) Ara");
  const ans = (await ui.ask("\nSeçim: ")).trim();
  if (BACK_KEYS.has(ans)) return { action: "back" };
  if (ans === "/") return { action: "search" };
  const hitExtra = extra.find((e) => e.key === ans);
  if (hitExtra) return { action: "extra", id: hitExtra.id };
  const n = Number(ans);
  if (Number.isInteger(n) && n >= 1 && n <= items.length) return { action: "pick", index: n - 1 };
  console.log("Geçersiz seçim.");
  return { action: "retry" };
}

async function confirm(ui, reason) {
  const ans = (await ui.ask(`\nONAY: ${reason}\nDevam edilsin mi? [e/H] `)).trim().toLowerCase();
  return ans === "e" || ans === "evet" || ans === "y" || ans === "yes";
}

export function currentVcs() {
  const g = getGitStatus();
  return { branch: g.branch, commit: g.head };
}

function showImpact(task) {
  if (task.impact?.length) {
    console.log("\nEtki:");
    for (const line of task.impact) console.log(`  - ${line}`);
  }
}

async function collectArgs(ui, task) {
  const extra = [];
  for (const p of task.argsPrompt ?? []) {
    const val = (await ui.ask(`${p.prompt}: `)).trim();
    if (!val && p.required) {
      console.log("Bu değer zorunlu; işlem iptal edildi.");
      return null;
    }
    if (val) {
      if (p.flag) extra.push(p.flag, val);
      else extra.push(val);
    }
  }
  return extra;
}

/** Tek task/group/workflow çalıştır + history'ye kaydet. */
export async function executeEntry(ui, entry, { extraArgsByStep = {} } = {}) {
  const blackseaOk = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"));
  if (entry.site === "blacksea" && !blackseaOk) {
    console.log(`\nBlackSea reposu bağlı değil: ${BLACKSEA_ROOT}`);
    return null;
  }
  if (entry.preflight) {
    console.log(`\nPreflight (${entry.preflight}):`);
    const pf = runPreflight(entry.preflight);
    console.log(formatPreflight(pf) || "  (kontrol yok)");
    if (!pf.ok) {
      console.log("\nPreflight başarısız; işlem durduruldu.");
      return null;
    }
  }
  showImpact(entry);
  if (entry.confirm && !(await confirm(ui, entry.confirm))) {
    console.log("İptal edildi.");
    return null;
  }

  const vcs = currentVcs();
  const startedAll = Date.now();

  if (entry.kind === "group" || entry.kind === "workflow") {
    console.log(`\n${entry.title} başlıyor (${entry.steps.length} adım, ${entry.stopOnError ? "ilk hatada dur" : "tümü çalışır"})`);
    const res = await runSteps(entry, {
      extraArgsByStep,
      onStep: (s) => console.log(`\n--- ${s.title} ---`),
    });
    console.log(`\n${res.summary} · toplam ${formatDuration(res.durationMs)}`);
    for (const r of res.results) {
      console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.title} (${formatDuration(r.durationMs)})`);
    }
    const rec = recordRun({
      kind: entry.kind, refId: entry.id, title: entry.title,
      command: entry.kind, args: entry.steps, cwd: "repo",
      exitCode: res.exitCode, durationMs: Date.now() - startedAll,
      branch: vcs.branch, commit: vcs.commit, fullLog: res.fullLog,
    });
    await outputScreen(ui, { title: entry.title, command: entry.kind, args: entry.steps, exitCode: res.exitCode, durationMs: res.durationMs, branch: vcs.branch, commit: vcs.commit, fullLog: res.fullLog, rerun: () => executeEntry(ui, entry) });
    return rec;
  }

  // task / builtin
  const extra = await collectArgs(ui, entry);
  if (extra === null) return null;
  if (entry.kind === "builtin") {
    const raw = await runBuiltin(entry.builtin);
    return finishRaw(ui, entry, [], raw, vcs, startedAll, () => executeEntry(ui, entry));
  }
  const command = entry.command;
  const args = [...entry.args, ...extra];
  console.log(`\n$ ${formatCmd(command, args)}`);
  let raw;
  if (entry.mode === "inherit") {
    raw = await runCommand({ command, args, cwd: entry.cwd ?? "repo", mode: "inherit" });
    raw = { ...raw, stdout: "(etkileşimli çalıştı; çıktı yakalanmadı)", stderr: "" };
  } else {
    raw = await runCommand({ command, args, cwd: entry.cwd ?? "repo", mode: "capture" });
  }
  return finishRaw(ui, entry, args, raw, vcs, startedAll, () => executeEntry(ui, entry));
}

async function finishRaw(ui, entry, args, raw, vcs, startedAll, rerun) {
  const pass = raw.exitCode === 0;
  console.log(`\nSonuç: ${pass ? "PASS" : "FAIL"} (exit ${raw.exitCode}) · ${formatDuration(raw.durationMs)}`);
  const fullLog = `${raw.stdout ?? ""}${raw.stderr ? `\n[stderr]\n${raw.stderr}` : ""}`;
  recordRun({
    kind: entry.kind ?? "task", refId: entry.id, title: entry.title,
    command: entry.command ?? `builtin:${entry.builtin}`, args, cwd: entry.cwd ?? "repo",
    exitCode: raw.exitCode, durationMs: Date.now() - startedAll,
    branch: vcs.branch, commit: vcs.commit, fullLog,
  });
  await outputScreen(ui, {
    title: entry.title, command: entry.command ?? `builtin:${entry.builtin}`, args,
    exitCode: raw.exitCode, durationMs: raw.durationMs,
    branch: vcs.branch, commit: vcs.commit, fullLog, rerun,
  });
  return raw;
}

function tailLines(text, n = 40) {
  const lines = text.split("\n");
  return lines.length > n ? `... (${lines.length - n} satır üstte)\n${lines.slice(-n).join("\n")}` : text;
}

/** Çıktı ekranı: c özet kopyala / a ham kopyala / s kaydet / r tekrar / b geri */
export async function outputScreen(ui, run) {
  console.log(`\n----- ${run.title} -----`);
  console.log(buildSummary(run));
  console.log("----- ÇIKTI (son 40 satır) -----");
  console.log(tailLines(run.fullLog || "(çıktı yok)", 40));
  console.log("-------------------------------");
  for (;;) {
    const k = (await ui.ask("[c] özet kopyala · [a] ham çıktı kopyala · [s] dosyaya kaydet · [r] tekrar · [b] geri: ")).trim();
    if (BACK_KEYS.has(k) || k === "") return;
    if (k === "c") {
      const r = copyText(buildSummary(run));
      console.log(r.ok ? `Özet panoya kopyalandı (${r.method}).` : `Pano yok: ${r.reason}. [s] ile dosyaya kaydedin.`);
    } else if (k === "a") {
      const r = copyText(buildFullReport({ summary: buildSummary(run), fullLog: run.fullLog }));
      console.log(r.ok ? `Ham çıktı panoya kopyalandı (${r.method}).` : `Pano yok: ${r.reason}. [s] ile dosyaya kaydedin.`);
    } else if (k === "s") {
      const p = saveReportFile(run.title, buildFullReport({ summary: buildSummary(run), fullLog: run.fullLog }));
      console.log(`Rapor kaydedildi: ${p}`);
    } else if (k === "r") {
      await run.rerun?.();
      return;
    } else {
      console.log("Bilinmeyen tuş.");
    }
  }
}

// ---------- Bölüm ekranları ----------

async function sectionScreen(ui, key) {
  const blackseaOk = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"));
  if (key === "web") return webSection(ui);
  const sec = SECTIONS[key];
  for (;;) {
    const items = [];
    for (const [gtitle, ids] of sec.groups) {
      items.push({ label: `── ${gtitle} ──`, sep: true });
      for (const id of ids) {
        const t = getTask(id);
        if (!t) continue;
        if (t.site === "blacksea" && !blackseaOk) continue;
        items.push({ label: `${t.title}${t.kind !== "task" ? ` [${t.kind === "group" ? "grup" : "workflow"}]` : ""}`, id });
      }
    }
    console.log(header(sec.title));
    let n = 0;
    const indexMap = new Map();
    for (const it of items) {
      if (it.sep) console.log(`  ${it.label}`);
      else { n += 1; indexMap.set(n, it.id); console.log(`  ${n}) ${it.label}`); }
    }
    console.log("  b) Geri   /) Ara");
    const ans = (await ui.ask("\nSeçim: ")).trim();
    if (BACK_KEYS.has(ans)) return;
    if (ans === "/") { await palette(ui); continue; }
    const id = indexMap.get(Number(ans));
    if (!id) { console.log("Geçersiz seçim."); continue; }
    await executeEntry(ui, getTask(id));
  }
}

async function webSection(ui) {
  const profiles = getSiteProfiles();
  for (;;) {
    const choice = await askChoice(ui, "Web / Deploy — site seç", profiles.map((p) => ({
      label: `${p.title} — ${p.host}${p.available ? "" : " [bağlı değil]"}`,
    })));
    if (choice.action !== "pick") return;
    const profile = profiles[choice.index];
    if (!profile.available) { console.log(profile.availabilityNote); continue; }
    await siteScreen(ui, profile);
  }
}

async function siteScreen(ui, profile) {
  const tasks = TASKS.filter((t) => t.category === "web" && t.site === profile.id);
  for (;;) {
    const choice = await askChoice(ui, `${profile.title}`, tasks.map((t) => ({
      label: `${t.title}${t.kind !== "task" ? ` [${t.kind === "group" ? "grup" : "workflow"}]` : ""}`,
    })), { extra: [{ key: "d", label: "Deploy durumu", id: "deploy-status" }] });
    if (choice.action === "back") return;
    if (choice.action === "search") { await palette(ui); continue; }
    if (choice.action === "extra") {
      console.log(`\nDeploy hedefi: ${profile.host}`);
      console.log(`Hazır: ${profile.deployReady ? "evet" : "hayır"} — ${profile.deployReadyNote}`);
      if (profile.id === "blacksea") console.log("(İpucu: .deploy/natro.env yoksa FTP şifresi terminalde gizli sorulur.)");
      console.log("(Secret değerleri gösterilmez; yalnızca mevcut/yok.)");
      continue;
    }
    if (choice.action !== "pick") continue;
    await executeEntry(ui, tasks[choice.index]);
  }
}

// ---------- Git ekranı ----------

async function gitSection(ui) {
  for (;;) {
    const choice = await askChoice(ui, "Git (günlük işlemler)", gitops.GIT_OPS.map((o) => ({ label: `${o.title}\n      ${o.git}` })));
    if (choice.action === "back") return;
    if (choice.action === "search") { await palette(ui); continue; }
    if (choice.action !== "pick") continue;
    await runGitOp(ui, gitops.GIT_OPS[choice.index].id);
  }
}

async function recordGit(ui, opId, title, gitCmd, raw, vcs) {
  const fullLog = `${raw.stdout ?? ""}${raw.stderr ? `\n[stderr]\n${raw.stderr}` : ""}`;
  console.log(`\nGerçek komut: ${gitCmd}\nSonuç: ${raw.exitCode === 0 ? "PASS" : "FAIL"} (exit ${raw.exitCode})`);
  recordRun({ kind: "git", refId: `git:${opId}`, title: `Git: ${title}`, command: "git", args: [opId], cwd: "repo", exitCode: raw.exitCode, durationMs: raw.durationMs, branch: vcs.branch, commit: vcs.commit, fullLog: `${gitCmd}\n\n${fullLog}` });
  await outputScreen(ui, { title: `Git: ${title}`, command: "git", args: [opId], exitCode: raw.exitCode, durationMs: raw.durationMs, branch: vcs.branch, commit: vcs.commit, fullLog, rerun: () => runGitOp(ui, opId) });
}

async function runGitOp(ui, opId, preset = {}) {
  const vcs = currentVcs();
  switch (opId) {
    case "status": return recordGit(ui, opId, "status", "git status --short --branch", await gitops.gitStatus(), vcs);
    case "diff": return recordGit(ui, opId, "diff", "git diff", await gitops.gitDiff(false), vcs);
    case "diff-staged": return recordGit(ui, opId, "diff --cached", "git diff --cached", await gitops.gitDiff(true), vcs);
    case "log": return recordGit(ui, opId, "log", "git log --oneline -15", await gitops.gitLog(15), vcs);
    case "branches": return recordGit(ui, opId, "branch listesi", "git branch -vv", await gitops.gitBranches(), vcs);
    case "fetch": return recordGit(ui, opId, "fetch", "git fetch --prune", await gitops.gitFetch(), vcs);
    case "pull": return recordGit(ui, opId, "pull", "git pull --ff-only", await gitops.gitPull(), vcs);
    case "push": {
      if (!(await confirm(ui, "Uzak repoya push yapılır (force yok, güvenli push)."))) { console.log("İptal edildi."); return null; }
      return recordGit(ui, opId, "push", "git push", await gitops.gitPush(), vcs);
    }
    case "commit":
    case "commit-push": {
      const changed = await gitops.gitChangedFiles();
      console.log("\nStagelenmiş:\n" + (changed.staged.stdout.trim() || "  (yok)"));
      console.log("\nStagelenmemiş:\n" + (changed.unstaged.stdout.trim() || "  (yok)"));
      const stageAll = (await ui.ask("Tümünü stage'le? (git add -A) [e/H] ")).trim().toLowerCase();
      const message = preset.message ?? await ui.ask("Commit mesajı: ");
      if (!message.trim()) { console.log("İptal edildi (boş mesaj)."); return null; }
      const raw = await gitops.gitCommit(message.trim(), stageAll === "e" || stageAll === "evet");
      await recordGit(ui, "commit", "commit", `git commit -m "${message.trim()}"`, raw, vcs);
      if (opId === "commit-push" && raw.exitCode === 0) {
        if (!(await confirm(ui, "Commit başarılı; push yapılsın mı?"))) return null;
        return recordGit(ui, "push", "push", "git push", await gitops.gitPush(), currentVcs());
      }
      return null;
    }
    case "switch":
    case "create": {
      const name = preset.name ?? (await ui.ask(opId === "switch" ? "Geçilecek branch: " : "Yeni branch adı: ")).trim();
      if (!name) { console.log("İptal edildi."); return null; }
      const raw = opId === "switch" ? await gitops.gitSwitch(name) : await gitops.gitCreate(name);
      return recordGit(ui, opId, opId, opId === "switch" ? `git switch ${name}` : `git switch -c ${name}`, raw, vcs);
    }
    case "merge": {
      const source = preset.source ?? (await ui.ask("Kaynak branch (merge edilecek): ")).trim();
      const target = preset.target ?? (await ui.ask("Hedef branch: ")).trim();
      if (!source || !target) { console.log("İptal edildi."); return null; }
      console.log(`\n${await gitops.gitMergePlan(source, target)}`);
      console.log("Conflict çıkarsa işlem durur; otomatik çözüm yapılmaz.");
      if (!(await confirm(ui, `git switch ${target} + git merge ${source} çalıştırılsın mı?`))) { console.log("İptal edildi."); return null; }
      const raw = await gitops.gitMerge(source, target);
      return recordGit(ui, opId, "merge", `git switch ${target} && git merge ${source}`, raw, vcs);
    }
    case "delete": {
      const name = preset.name ?? (await ui.ask("Silinecek branch: ")).trim();
      if (!name) { console.log("İptal edildi."); return null; }
      if (!(await confirm(ui, `git branch -d ${name} (güvenli silme; merge edilmemişse reddedilir)`))) { console.log("İptal edildi."); return null; }
      return recordGit(ui, opId, "delete", `git branch -d ${name}`, await gitops.gitDelete(name), vcs);
    }
    default: console.log("Bilinmeyen git işlemi."); return null;
  }
}

// ---------- Son Çalıştırmalar ----------

async function historySection(ui) {
  for (;;) {
    const runs = listRuns(20);
    console.log(header("Son Çalıştırmalar"));
    if (runs.length === 0) { console.log("  (henüz kayıt yok)"); }
    runs.forEach((r, i) => {
      console.log(`  ${i + 1}) ${r.title}  ${r.pass ? "PASS" : "FAIL"}  ${timeAgo(r.ts)}  [${r.branch}@${r.commit}]`);
    });
    // Full Verify HEAD uyarısı
    const vcs = currentVcs();
    const { lastPass, currentMismatch } = lastPassFor("full-verify", vcs.branch, vcs.commit);
    if (lastPass) {
      console.log(`\n  Son Full Verify: ${lastPass.commit}${currentMismatch ? " — UYARI: mevcut HEAD için değil" : " (mevcut HEAD ile aynı)"}`);
    }
    console.log("  b) Geri   /) Ara");
    const ans = (await ui.ask("\nSeçim (detay için numara): ")).trim();
    if (BACK_KEYS.has(ans)) return;
    if (ans === "/") { await palette(ui); continue; }
    const run = runs[Number(ans) - 1];
    if (!run) { console.log("Geçersiz seçim."); continue; }
    await historyDetail(ui, run.seq);
  }
}

async function historyDetail(ui, seq) {
  const run = getRun(seq);
  if (!run) { console.log("Kayıt bulunamadı."); return; }
  const log = readLog(run);
  await outputScreen(ui, {
    title: run.title, command: run.command, args: run.args,
    exitCode: run.exitCode, durationMs: run.durationMs,
    branch: run.branch, commit: run.commit, fullLog: log,
    rerun: () => rerunHistory(ui, run),
  });
}

async function rerunHistory(ui, run) {
  if (run.kind === "git") return runGitOp(ui, String(run.args[0] ?? "status"));
  const task = getTask(run.refId);
  if (!task) { console.log(`Kayıtlı task artık yok: ${run.refId}`); return null; }
  return executeEntry(ui, task);
}

// ---------- Palette (/) + npm script ----------

function readPackageScripts() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

async function npmScriptRunner(ui, filter = "") {
  const scripts = readPackageScripts();
  if (Object.keys(scripts).length === 0) { console.log("package.json okunamadı."); return; }
  const names = Object.keys(scripts).filter((n) => n.toLowerCase().includes(filter.toLowerCase()));
  if (names.length === 0) { console.log("Eşleşen npm script yok."); return; }
  const list = names.slice(0, 40);
  const choice = await askChoice(ui, `npm script çalıştır (${names.length} eşleşme${names.length > 40 ? ", ilk 40" : ""})`, list.map((n) => ({ label: `${n} — ${(scripts[n] ?? "").slice(0, 80)}` })));
  if (choice.action !== "pick") return;
  const name = list[choice.index];
  const entry = { id: `npm:${name}`, kind: "task", title: `npm run ${name}`, category: "checks", command: "npm", args: ["run", name], preflight: "basic" };
  await executeEntry(ui, entry);
}

export async function palette(ui) {
  const q = (await ui.ask("\n/ Ara (örn. android, blacksea, deploy, smoke): ")).trim().toLowerCase();
  if (!q) return;
  const hits = TASKS.filter((t) => `${t.id} ${t.title}`.toLowerCase().includes(q)).slice(0, 20);
  const labels = hits.map((t) => ({ label: `[${TASK_CATEGORIES[t.category]}] ${t.title}` }));
  labels.push({ label: `npm script ara: "${q}"`, npm: true });
  const choice = await askChoice(ui, `Sonuçlar: "${q}"`, labels);
  if (choice.action !== "pick") return;
  if (labels[choice.index].npm) return npmScriptRunner(ui, q);
  await executeEntry(ui, hits[choice.index]);
}

// ---------- Ana menü ----------

const MAIN = [
  { key: "checks", label: "Kontroller (test/check grupları)" },
  { key: "android", label: "Android (build/kur/cihaz)" },
  { key: "web", label: "Web / Deploy (site profilleri)" },
  { key: "build", label: "Build / Release (binary üret, yayınlama)" },
  { key: "fresh", label: "Temiz Başlangıç (sonuç seç, flag ezberleme)" },
  { key: "git", label: "Git (günlük işlemler)" },
  { key: "devtools", label: "Geliştirici Araçları" },
  { key: "history", label: "Son Çalıştırmalar" },
];

export async function mainLoop(ui) {
  for (;;) {
    const choice = await askChoice(ui, "Yardımcı Asistan — Geliştirici Konsolu", MAIN.map((m) => ({ label: m.label })), { extra: [{ key: "n", label: "npm script çalıştır…", id: "npm" }] });
    if (choice.action === "back") {
      const quit = (await ui.ask("Çıkılsın mı? [e/H] ")).trim().toLowerCase();
      if (quit === "e" || quit === "evet") return;
      continue;
    }
    if (choice.action === "search") { await palette(ui); continue; }
    if (choice.action === "extra") { await npmScriptRunner(ui); continue; }
    if (choice.action !== "pick") continue;
    const key = MAIN[choice.index].key;
    if (key === "git") await gitSection(ui);
    else if (key === "history") await historySection(ui);
    else await sectionScreen(ui, key);
  }
}

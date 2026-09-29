import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { createTerminalUI } from "./terminal.mjs";

export const SECTIONS = {
  checks: {
    title: "Kontroller", groups: [
      ["Doğrulama presetleri", ["verify-dev", "verify-domain", "verify-full", "verify-pre-main", "verify-release"]],
      ["Teşhis", ["verify-check", "verify-list", "verify-plan"]],
      ["Dar kapılar", ["doctor", "typecheck", "typecheck-electron", "lint-strict", "lint-php", "knip-strict", "test-all", "e2e", "arch-audit", "design-audit-strict", "smoke-diagnostics"]],
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
      ["Sürüm", ["product-version-show", "product-version-set"]],
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
  return createTerminalUI();
}

async function askChoice(ui, title, items, { extra = [], body = [] } = {}) {
  const decorated = items.map((item, index) => ({
    ...item,
    separator: Boolean(item.separator ?? item.sep),
    value: { kind: "item", index },
  }));
  if (extra.length) {
    decorated.push({ label: "Diğer", separator: true });
    for (const item of extra) {
      decorated.push({
        label: item.label,
        description: item.description,
        searchText: item.searchText ?? item.label,
        value: { kind: "extra", id: item.id },
      });
    }
  }
  const choice = await ui.select({
    title,
    status: renderStatusBar(),
    body,
    items: decorated,
  });
  if (choice.action !== "pick") return { action: choice.action };
  if (choice.item.value?.kind === "extra") {
    return { action: "extra", id: choice.item.value.id };
  }
  const index = choice.item.value?.index;
  return { action: "pick", index, item: items[index] };
}

async function confirm(ui, reason, details = []) {
  const choice = await ui.select({
    title: "Onay",
    status: renderStatusBar(),
    body: [reason, ...details.map((line) => `• ${line}`)],
    searchable: false,
    initialValue: false,
    footer: "↑↓ seç · Enter onayla · Esc vazgeç",
    items: [
      { label: "Vazgeç", value: false },
      { label: "Devam et", value: true },
    ],
  });
  return choice.action === "pick" && choice.item.value === true;
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

function tailLines(text, n = 4) {
  const lines = String(text ?? "").split("\n").filter((line, index, all) => line || index < all.length - 1);
  return lines.length > n ? [`… ${lines.length - n} satır üstte`, ...lines.slice(-n)] : lines;
}

/** Sonuç ekranı: seçimler ok tuşlarıyla; log ayrıca kaydırılabilir. */
export async function outputScreen(ui, run) {
  let notice = "";
  for (;;) {
    const summary = buildSummary(run);
    const body = [
      `Sonuç: ${run.exitCode === 0 ? "PASS" : "FAIL"} · exit ${run.exitCode} · ${formatDuration(run.durationMs)}`,
      `Branch: ${run.branch || "-"} @ ${run.commit || "-"}`,
      notice,
      "Son çıktı:",
      ...tailLines(run.fullLog || "(çıktı yok)", 4),
    ].filter(Boolean);
    const choice = await ui.select({
      title: `Sonuç — ${run.title}`,
      status: renderStatusBar(),
      body,
      searchable: false,
      footer: "↑↓ seç · Enter uygula · Esc geri",
      items: [
        { label: "Tam çıktıyı görüntüle", value: "view" },
        { label: "Özeti panoya kopyala", value: "copy-summary" },
        { label: "Tam raporu panoya kopyala", value: "copy-full" },
        { label: "Raporu dosyaya kaydet", value: "save" },
        { label: "Tekrar çalıştır", value: "rerun" },
        { label: "Geri", value: "back" },
      ],
    });
    if (choice.action !== "pick" || choice.item.value === "back") return;
    if (choice.item.value === "view") {
      await ui.viewText({ title: run.title, text: run.fullLog || "(çıktı yok)" });
    } else if (choice.item.value === "copy-summary") {
      const result = copyText(summary);
      notice = result.ok ? `Özet panoya kopyalandı (${result.method}).` : `Pano yok: ${result.reason}`;
    } else if (choice.item.value === "copy-full") {
      const result = copyText(buildFullReport({ summary, fullLog: run.fullLog }));
      notice = result.ok ? `Tam rapor panoya kopyalandı (${result.method}).` : `Pano yok: ${result.reason}`;
    } else if (choice.item.value === "save") {
      notice = `Rapor kaydedildi: ${saveReportFile(run.title, buildFullReport({ summary, fullLog: run.fullLog }))}`;
    } else if (choice.item.value === "rerun") {
      await run.rerun?.();
      return;
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
    for (const [groupTitle, ids] of sec.groups) {
      items.push({ label: groupTitle, separator: true });
      for (const id of ids) {
        const task = getTask(id);
        if (!task) continue;
        if (task.site === "blacksea" && !blackseaOk) continue;
        items.push({
          label: task.title,
          description: task.description ?? (task.kind === "task"
            ? task.id
            : `${task.kind === "group" ? "Grup" : "Workflow"} · ${task.id}`),
          searchText: `${task.id} ${groupTitle} ${task.description ?? ""}`,
          id,
        });
      }
    }
    const choice = await askChoice(ui, sec.title, items);
    if (choice.action !== "pick") return;
    if (choice.item?.id) await executeEntry(ui, getTask(choice.item.id));
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

async function chooseLocalBranch(ui, title, { exclude = [], initialValue } = {}) {
  const raw = await gitops.gitBranchNames();
  if (raw.exitCode !== 0) {
    await ui.viewText({ title: "Branch listesi alınamadı", text: raw.stderr || raw.stdout });
    return null;
  }
  const blocked = new Set(exclude);
  const branches = raw.stdout.split("\n").map((name) => name.trim()).filter(Boolean).filter((name) => !blocked.has(name));
  if (!branches.length) return null;
  const choice = await ui.select({
    title,
    status: renderStatusBar(),
    items: branches.map((name) => ({ label: name, value: name, searchText: name })),
    initialValue,
  });
  return choice.action === "pick" ? choice.item.value : null;
}

async function gitSection(ui) {
  for (;;) {
    const choice = await askChoice(ui, "Git — günlük işlemler", gitops.GIT_OPS.map((op) => ({
      label: op.title,
      description: op.git,
      searchText: `${op.id} ${op.title} ${op.git}`,
    })));
    if (choice.action !== "pick") return;
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
      const stageChoice = await ui.select({
        title: "Commit — stage seçimi",
        status: renderStatusBar(),
        body: ["Commit öncesi hangi dosyalar stage edilsin?"],
        searchable: false,
        initialValue: false,
        footer: "↑↓ seç · Enter devam · Esc iptal",
        items: [
          { label: "Yalnızca zaten staged olanları kullan", description: "git add çalıştırılmaz", value: false },
          { label: "Tüm değişiklikleri stage et", description: "git add -A", value: true },
        ],
      });
      if (stageChoice.action !== "pick") return null;
      const message = preset.message ?? await ui.ask("Commit mesajı: ");
      if (!message.trim()) { console.log("İptal edildi (boş mesaj)."); return null; }
      const raw = await gitops.gitCommit(message.trim(), stageChoice.item.value);
      await recordGit(ui, "commit", "commit", `git commit -m "${message.trim()}"`, raw, vcs);
      if (opId === "commit-push" && raw.exitCode === 0) {
        if (!(await confirm(ui, "Commit başarılı; push yapılsın mı?"))) return null;
        return recordGit(ui, "push", "push", "git push", await gitops.gitPush(), currentVcs());
      }
      return null;
    }
    case "switch": {
      const name = preset.name ?? await chooseLocalBranch(ui, "Geçilecek branch", { exclude: [vcs.branch] });
      if (!name) return null;
      return recordGit(ui, opId, "branch değiştir", `git switch ${name}`, await gitops.gitSwitch(name), vcs);
    }
    case "create": {
      const name = preset.name ?? (await ui.ask("Yeni branch adı: ")).trim();
      if (!name) return null;
      return recordGit(ui, opId, "branch oluştur", `git switch -c ${name}`, await gitops.gitCreate(name), vcs);
    }
    case "merge": {
      const source = preset.source ?? await chooseLocalBranch(ui, "Merge — kaynak branch", { initialValue: vcs.branch });
      if (!source) return null;
      const target = preset.target ?? await chooseLocalBranch(ui, "Merge — hedef branch", { exclude: [source], initialValue: "main" });
      if (!target) return null;
      const plan = await gitops.gitMergePlan(source, target);
      if (!(await confirm(ui, "Branch'ler birleştirilecek.", [...plan.trim().split("\n"), "Conflict çıkarsa işlem durur; otomatik çözüm yapılmaz."]))) return null;
      return recordGit(ui, opId, "merge", `git switch ${target} && git merge ${source}`, await gitops.gitMerge(source, target), vcs);
    }
    case "delete": {
      const name = preset.name ?? await chooseLocalBranch(ui, "Silinecek branch", { exclude: [vcs.branch] });
      if (!name) return null;
      if (!(await confirm(ui, `${name} branch'i güvenli biçimde silinsin mi?`, [`git branch -d ${name}`, "Merge edilmemiş branch Git tarafından reddedilir."]))) return null;
      return recordGit(ui, opId, "branch sil", `git branch -d ${name}`, await gitops.gitDelete(name), vcs);
    }
    default: console.log("Bilinmeyen git işlemi."); return null;
  }
}

// ---------- Son Çalıştırmalar ----------

async function historySection(ui) {
  for (;;) {
    const runs = listRuns(20);
    const vcs = currentVcs();
    const { lastPass, currentMismatch } = lastPassFor("verify-full", vcs.branch, vcs.commit);
    const body = lastPass
      ? [`Son Full Verify: ${lastPass.commit}${currentMismatch ? " — mevcut HEAD için değil" : " — mevcut HEAD"}`]
      : ["Henüz başarılı Full Verify kaydı yok."];
    const items = runs.length
      ? runs.map((run) => ({
          label: `${run.pass ? "✓" : "✗"} ${run.title}`,
          description: `${timeAgo(run.ts)} · ${run.branch}@${run.commit}`,
          searchText: `${run.title} ${run.refId} ${run.branch} ${run.commit}`,
          value: run.seq,
        }))
      : [{ label: "Henüz kayıt yok", disabled: true }];
    const choice = await ui.select({
      title: "Son Çalıştırmalar",
      status: renderStatusBar(),
      body,
      items,
    });
    if (choice.action !== "pick") return;
    await historyDetail(ui, choice.item.value);
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

async function npmScriptRunner(ui, initialQuery = "") {
  const scripts = readPackageScripts();
  const names = Object.keys(scripts).sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    await ui.viewText({ title: "npm Scriptleri", text: "package.json okunamadı veya script bulunamadı." });
    return;
  }
  const choice = await ui.select({
    title: "npm script çalıştır",
    status: renderStatusBar(),
    items: names.map((name) => ({
      label: name,
      description: String(scripts[name] ?? "").slice(0, 140),
      searchText: `${name} ${scripts[name] ?? ""}`,
      value: name,
    })),
    startSearch: Boolean(initialQuery),
    initialQuery,
  });
  if (choice.action !== "pick") return;
  const name = choice.item.value;
  await executeEntry(ui, {
    id: `npm:${name}`, kind: "task", title: `npm run ${name}`,
    category: "checks", command: "npm", args: ["run", name], preflight: "basic",
  });
}

export async function palette(ui) {
  const scripts = readPackageScripts();
  const taskItems = TASKS.map((task) => ({
    label: task.title,
    description: `${TASK_CATEGORIES[task.category]} · ${task.id}`,
    searchText: `${task.id} ${task.title} ${TASK_CATEGORIES[task.category]}`,
    value: { kind: "task", id: task.id },
  }));
  const scriptItems = Object.keys(scripts).sort((a, b) => a.localeCompare(b)).map((name) => ({
    label: `npm run ${name}`,
    description: String(scripts[name] ?? "").slice(0, 140),
    searchText: `${name} ${scripts[name] ?? ""}`,
    value: { kind: "npm", name },
  }));
  const choice = await ui.select({
    title: "Komut Paleti",
    status: renderStatusBar(),
    body: ["Yazmaya başlayarak task, workflow veya npm script ara."],
    items: [...taskItems, ...scriptItems],
    startSearch: true,
    footer: "yaz: filtrele · ↑↓ seç · Enter çalıştır · Esc geri",
  });
  if (choice.action !== "pick") return;
  if (choice.item.value.kind === "task") return executeEntry(ui, getTask(choice.item.value.id));
  const name = choice.item.value.name;
  return executeEntry(ui, {
    id: `npm:${name}`, kind: "task", title: `npm run ${name}`,
    category: "checks", command: "npm", args: ["run", name], preflight: "basic",
  });
}

// ---------- Ana menü ----------

const MAIN = [
  { key: "search", label: "Komut Ara", description: "Task, workflow ve npm scriptlerini tek yerde filtrele" },
  { key: "checks", label: "Kontroller", description: "Test/check grupları ve doğrulama presetleri" },
  { key: "android", label: "Android", description: "Build, kurulum, cihaz ve bağlantı işlemleri" },
  { key: "web", label: "Web / Deploy", description: "Site profilleri, deploy ve canlı doğrulama" },
  { key: "build", label: "Build / Release", description: "Binary ve APK/AAB üret; yayınlama ayrı" },
  { key: "fresh", label: "Temiz Başlangıç", description: "Fresh/clean flag ezberlemeden sonuç seç" },
  { key: "git", label: "Git", description: "Günlük güvenli Git işlemleri" },
  { key: "devtools", label: "Geliştirici Araçları", description: "Dev sunucuları, loglar ve tanılama" },
  { key: "history", label: "Son Çalıştırmalar", description: "Rapor, log ve tekrar çalıştırma" },
  { key: "npm", label: "npm Scriptleri", description: "package.json scriptlerini filtreleyerek çalıştır" },
];

export async function mainLoop(ui) {
  for (;;) {
    const choice = await ui.select({
      title: "Yardımcı Asistan — Geliştirici Konsolu v2",
      status: renderStatusBar(),
      items: MAIN.map((item) => ({
        label: item.label,
        description: item.description,
        searchText: `${item.key} ${item.label} ${item.description}`,
        value: item.key,
      })),
    });
    if (choice.action !== "pick") {
      if (choice.action === "exit" || await confirm(ui, "Geliştirici konsolundan çıkılsın mı?")) return;
      continue;
    }
    const key = choice.item.value;
    if (key === "search") await palette(ui);
    else if (key === "npm") await npmScriptRunner(ui);
    else if (key === "git") await gitSection(ui);
    else if (key === "history") await historySection(ui);
    else await sectionScreen(ui, key);
  }
}

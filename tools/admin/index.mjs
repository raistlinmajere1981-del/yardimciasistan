#!/usr/bin/env node
/**
 * Yardımcı Asistan — geliştirici/yönetici terminal konsolu.
 *
 * Kullanım:
 *   npm run admin                    interaktif konsol
 *   npm run admin -- --list           tüm task/workflow id'lerini listele
 *   npm run admin -- --run <id>       tek task çalıştır (non-interaktif)
 *   npm run admin -- --run <id> --yes tehlikeli işlem onayını geç (yalnız --run ile)
 *
 * Mevcut scriptleri yeniden yazmaz; merkezi task registry üzerinden
 * spawn(command, args) ile orkestre eder. Yeni build/test/deploy
 * sistemi değildir.
 */
import { TASKS, getTask } from "./config/tasks.mjs";
import { runBuiltin } from "./runners/builtins.mjs";
import { runCommand } from "./runners/exec.mjs";
import { runPreflight } from "./runners/preflight.mjs";
import { runSteps } from "./runners/workflow.mjs";
import { recordRun } from "./history.mjs";
import { currentVcs, createUI, executeEntry, mainLoop } from "./ui/menu.mjs";
import { getGitStatus } from "./ui/status.mjs";

function printHelp() {
  console.log(`Yardımcı Asistan Geliştirici Konsolu

Kullanım:
  npm run admin                  İnteraktif konsol
  npm run admin -- --list         Task/workflow listesi
  npm run admin -- --run <id>     Tek çalıştırma (çıktı yakalanır, özet yazdırılır)
  npm run admin -- --run <id> --yes  Onaylı işlemleri onaysız geç (dikkat)

Örnek:
  npm run admin -- --run dev-check
  npm run admin -- --run android-devices
`);
}

function listEntries() {
  for (const t of TASKS) {
    const extra = t.kind === "task" ? `$ ${t.command} ${(t.args ?? []).join(" ")}`.trim() : `${t.kind}:${(t.steps ?? []).join(",")}`;
    console.log(`${t.id}\t[${t.category}/${t.kind}]\t${t.title}\t${extra}`);
  }
}

async function runOnce(id, assumeYes) {
  const entry = getTask(id);
  if (!entry) {
    console.error(`Bilinmeyen id: ${id}\nListelemek için: npm run admin -- --list`);
    process.exitCode = 2;
    return;
  }
  if (entry.site === "blacksea") {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { BLACKSEA_ROOT } = await import("./lib/paths.mjs");
    if (!existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"))) {
      console.error(`BlackSea reposu bağlı değil: ${BLACKSEA_ROOT}`);
      process.exitCode = 1;
      return;
    }
  }
  if (entry.preflight) {
    const { formatPreflight } = await import("./runners/preflight.mjs");
    const pf = runPreflight(entry.preflight);
    console.log(formatPreflight(pf));
    if (!pf.ok) {
      console.error("Preflight başarısız; durduruldu.");
      process.exitCode = 1;
      return;
    }
  }
  if (entry.confirm && !assumeYes) {
    console.error(`Bu işlem onay gerektirir: ${entry.confirm}\n--yes ile geçilebilir ya da interaktif konsol kullanın.`);
    process.exitCode = 2;
    return;
  }
  const g = getGitStatus();
  const vcs = { branch: g.branch, commit: g.head };
  const started = Date.now();

  if (entry.kind === "group" || entry.kind === "workflow") {
    const res = await runSteps(entry, { onStep: (s) => console.log(`\n--- ${s.title} ---`) });
    console.log(`\n${res.summary}`);
    for (const r of res.results) console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.title}`);
    recordRun({ kind: entry.kind, refId: entry.id, title: entry.title, command: entry.kind, args: entry.steps, cwd: "repo", exitCode: res.exitCode, durationMs: Date.now() - started, branch: vcs.branch, commit: vcs.commit, fullLog: res.fullLog });
    process.exitCode = res.exitCode;
    return;
  }
  let raw;
  if (entry.kind === "builtin") {
    raw = await runBuiltin(entry.builtin);
  } else {
    raw = await runCommand({ command: entry.command, args: entry.args, cwd: entry.cwd ?? "repo", mode: "capture" });
  }
  if (raw.stdout) console.log(raw.stdout);
  if (raw.stderr) console.error(raw.stderr);
  console.log(`\n${raw.exitCode === 0 ? "PASS" : "FAIL"} (exit ${raw.exitCode})`);
  recordRun({ kind: entry.kind, refId: entry.id, title: entry.title, command: entry.command ?? `builtin:${entry.builtin}`, args: entry.args ?? [], cwd: entry.cwd ?? "repo", exitCode: raw.exitCode, durationMs: Date.now() - started, branch: vcs.branch, commit: vcs.commit, fullLog: `${raw.stdout ?? ""}${raw.stderr ? `\n[stderr]\n${raw.stderr}` : ""}` });
  process.exitCode = raw.exitCode;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.includes("--list")) {
    listEntries();
    return;
  }
  const runIdx = args.indexOf("--run");
  if (runIdx >= 0) {
    const id = args[runIdx + 1];
    if (!id) {
      console.error("--run için bir id gerekli.");
      process.exitCode = 2;
      return;
    }
    await runOnce(id, args.includes("--yes"));
    return;
  }
  if (!process.stdin.isTTY) {
    console.error("Etkileşimsiz terminalde --run <id> ya da --list kullanın.");
    process.exitCode = 2;
    return;
  }
  const ui = createUI();
  try {
    await mainLoop(ui);
  } catch (e) {
    // Ctrl+D / EOF ile çıkış: hata değil, sessizce kapat.
    if (!(e instanceof Error && e.name === "AbortError")) throw e;
  } finally {
    ui.close();
  }
  void currentVcs;
  void executeEntry;
}

await main();

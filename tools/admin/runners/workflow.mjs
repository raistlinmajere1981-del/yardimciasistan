import { getTask } from "../config/tasks.mjs";
import { runBuiltin } from "./builtins.mjs";
import { formatCmd, runCommand } from "./exec.mjs";

/**
 * Group/workflow çalıştırıcı.
 * stopOnError=true  (workflow): ilk hatada durur.
 * stopOnError=false (group): tüm adımlar çalışır, sonda özet çıkar.
 * Davranış tanımda açıktır; exit code gizlenmez.
 */
export function resolveStepCommand(step, extraArgs = []) {
  if (step.kind === "task") return { command: step.command, args: [...step.args, ...extraArgs] };
  return null;
}

export async function runSteps(entry, { onStep, extraArgsByStep = {} } = {}) {
  const steps = entry.steps ?? [];
  const results = [];
  let combined = "";
  let firstFailCode = 0;

  for (const stepId of steps) {
    const step = getTask(stepId);
    if (!step) {
      results.push({ id: stepId, title: stepId, exitCode: 2, pass: false, durationMs: 0, note: "tanımsız adım" });
      combined += `\n[adım tanımsız: ${stepId}]\n`;
      if (entry.stopOnError) { firstFailCode = 2; break; }
      continue;
    }
    // İç içe grup/workflow adımları düz çalıştırılır.
    if (step.kind === "group" || step.kind === "workflow") {
      const nested = await runSteps(step, { onStep, extraArgsByStep });
      results.push({ id: step.id, title: step.title, exitCode: nested.exitCode, pass: nested.exitCode === 0, durationMs: nested.durationMs, note: `${nested.results.length} alt adım`, nested: nested.results });
      combined += nested.fullLog;
      if (nested.exitCode !== 0 && entry.stopOnError) { firstFailCode = nested.exitCode; break; }
      if (nested.exitCode !== 0 && firstFailCode === 0) firstFailCode = nested.exitCode;
      continue;
    }
    onStep?.(step);
    const started = Date.now();
    let raw;
    if (step.kind === "builtin") {
      raw = await runBuiltin(step.builtin);
    } else {
      const cmd = resolveStepCommand(step, extraArgsByStep[step.id] ?? []);
      if (!cmd) {
        raw = { exitCode: 2, stdout: "", stderr: `çalıştırılamaz adım: ${step.id}`, durationMs: 0, timedOut: false };
      } else if (step.mode === "inherit") {
        raw = await runCommand({ command: cmd.command, args: cmd.args, cwd: step.cwd ?? "repo", mode: "inherit" });
        raw = { ...raw, stdout: "(etkileşimli çalıştı; çıktı yakalanmadı)", stderr: "" };
      } else {
        raw = await runCommand({ command: cmd.command, args: cmd.args, cwd: step.cwd ?? "repo", mode: "capture" });
      }
    }
    const durationMs = raw.durationMs || (Date.now() - started);
    const pass = raw.exitCode === 0;
    const title = step.title;
    results.push({ id: step.id, title, exitCode: raw.exitCode, pass, durationMs, cmd: step.kind === "task" ? formatCmd(step.command, [...step.args, ...(extraArgsByStep[step.id] ?? [])]) : `builtin:${step.builtin}` });
    combined += `\n===== ${title} [${pass ? "PASS" : "FAIL"}] (${(durationMs / 1000).toFixed(1)}s) =====\n`;
    if (raw.stdout) combined += `${raw.stdout}\n`;
    if (raw.stderr) combined += `[stderr]\n${raw.stderr}\n`;
    if (!pass && firstFailCode === 0) firstFailCode = raw.exitCode;
    if (!pass && entry.stopOnError) break;
  }

  const durationMs = results.reduce((n, r) => n + r.durationMs, 0);
  const exitCode = entry.stopOnError ? firstFailCode : (results.length > 0 && results.every((r) => r.pass) ? 0 : (firstFailCode || 1));
  const passed = results.filter((r) => r.pass).length;
  const summary = `${entry.title}: ${passed}/${results.length} adım PASS${entry.stopOnError ? " (ilk hatada dur)" : " (tümü çalıştı)"}`;
  return { exitCode, results, durationMs, fullLog: `${summary}\n${combined}`, summary };
}

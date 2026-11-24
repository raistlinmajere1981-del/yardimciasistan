import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, renameSync, rmSync, rmdirSync, writeFileSync, writeSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  VERIFICATION_CHECKS,
  VERIFICATION_PRESETS,
  createVerificationPlan,
  validateVerificationRegistry,
  verificationDomains
} from "./verification-registry.mjs";

const args = process.argv.slice(2);
const selection = parseSelection(args);
const validationErrors = validateVerificationRegistry();
if (validationErrors.length) {
  console.error("Doğrulama registry geçersiz:");
  for (const error of validationErrors) console.error(`- ${error}`);
  process.exit(1);
}

if (selection.list) {
  printList();
  process.exit(0);
}

let plan;
try {
  plan = createVerificationPlan({
    preset: selection.preset,
    domain: selection.domain,
    checkId: selection.checkId,
    includeManual: selection.includeManual,
    platform: process.platform
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (selection.planOnly) {
  printPlan(plan, selection);
  process.exit(0);
}

const started = new Date();
const reportDir = join(process.cwd(), "artifacts", "verify");
const reportPath = join(reportDir, `${stamp(started)}.json`);
const latestPath = join(reportDir, "latest.json");
const report = {
  schema_version: 1,
  started_at: started.toISOString(),
  finished_at: "",
  selection: {
    preset: selection.preset ?? null,
    domain: selection.domain ?? null,
    check_id: selection.checkId ?? null,
    include_manual: selection.includeManual
  },
  host: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version
  },
  result: "running",
  checks: []
};

mkdirSync(reportDir, { recursive: true });
console.log("\nYardımcı Asistan — Verify");
console.log(`Seçim: ${selectionLabel(selection)}`);
console.log(`Plan: ${plan.length} benzersiz kontrol\n`);

const results = new Map();
for (const [index, item] of plan.entries()) {
  const progress = `[${index + 1}/${plan.length}]`;
  const blockedBy = item.requires.filter((id) => {
    const dependency = results.get(id);
    return dependency && dependency.status !== "passed";
  });

  if (blockedBy.length) {
    const result = {
      id: item.id,
      label: item.label,
      status: "skipped",
      duration_ms: 0,
      exit_code: null,
      error: "",
      reason: `Prerequisite başarısız: ${blockedBy.join(", ")}`
    };
    results.set(item.id, result);
    report.checks.push(result);
    console.log(`- ${progress} [${item.id}] ${item.label} · ${result.reason}`);
    save();
    continue;
  }

  const result = await run(item, progress);
  results.set(item.id, result);
  report.checks.push(result);
  save();
}

const failed = report.checks.filter((item) => item.status === "failed");
const skipped = report.checks.filter((item) => item.status === "skipped");
const passed = report.checks.filter((item) => item.status === "passed");
report.finished_at = new Date().toISOString();
report.result = failed.length || skipped.length ? "failed" : "passed";
save();

console.log("\nVerify özeti");
console.log(`  Geçen: ${passed.length}`);
console.log(`  Kalan: ${failed.length}`);
console.log(`  Atlanan: ${skipped.length}`);
console.log(`  Rapor: ${reportPath}`);
for (const item of failed) console.log(`  ✗ ${item.label}`);
for (const item of skipped) console.log(`  - ${item.label} · ${item.reason}`);

if (report.result !== "passed") process.exitCode = 1;
else console.log("\nDoğrulama planı temiz.");

async function run(item, progress) {
  console.log(`\n▶ ${progress} [${item.id}] ${item.label}`);
  const startedAt = Date.now();
  const command = resolveCommand(item.command);
  // Keep the failing test's actual output, not just its exit code. Passing
  // checks discard their temporary logs so a 330-check release stays lean.
  const logsDir = join(reportDir, "failure-logs", stamp(started));
  mkdirSync(logsDir, { recursive: true, mode: 0o700 });
  const tempFile = join(logsDir, `${item.id}.partial.log`);
  const file = openSync(tempFile, "w", 0o600);
  let launchError;
  let completion;
  try {
    const child = spawn(command, item.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
      shell: false
    });
    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr]
    ]) {
      stream.on("data", (chunk) => {
        destination.write(chunk);
        writeSync(file, chunk);
      });
    }
    completion = await new Promise((resolve) => {
      child.once("error", (error) => { launchError = error; });
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    closeSync(file);
  }
  const duration = Date.now() - startedAt;
  const passed = completion?.code === 0 && !launchError;
  const result = {
    id: item.id,
    label: item.label,
    status: passed ? "passed" : "failed",
    duration_ms: duration,
    exit_code: typeof completion?.code === "number" ? completion.code : 1,
    error: launchError?.message ?? (completion?.signal ? `Sinyal: ${completion.signal}` : "")
  };
  if (passed) {
    rmSync(tempFile, { force: true });
    try { rmdirSync(logsDir); } catch { /* Earlier failed checks are retained. */ }
  } else {
    const failureLog = join(logsDir, `${item.id}.log`);
    renameSync(tempFile, failureLog);
    result.log_path = failureLog;
    console.error(`  Hata çıktısı: ${failureLog}`);
  }
  console.log(`${passed ? "✓" : "✗"} ${progress} ${item.label} (${duration} ms)`);
  return result;
}

function resolveCommand(command) {
  if (command === "node") return process.execPath;
  if (command === "npm" && process.platform === "win32") return "npm.cmd";
  return command;
}

function parseSelection(argv) {
  const state = {
    preset: null,
    domain: null,
    checkId: null,
    includeManual: false,
    planOnly: false,
    list: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--preset") state.preset = requireValue(argv, ++index, "--preset");
    else if (value === "--domain") state.domain = requireValue(argv, ++index, "--domain");
    else if (value === "--check") state.checkId = requireValue(argv, ++index, "--check");
    else if (value === "--include-manual") state.includeManual = true;
    else if (value === "--plan") state.planOnly = true;
    else if (value === "--list") state.list = true;
    else throw new Error(`Bilinmeyen argüman: ${value}`);
  }

  if (!state.list && !state.preset && !state.domain && !state.checkId) {
    throw new Error("Seçim gerekli: --preset <ad>, --domain <ad> veya --check <id>.");
  }
  return state;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} için değer gerekli.`);
  return value;
}

function printList() {
  console.log("Presetler:");
  for (const preset of VERIFICATION_PRESETS) console.log(`  ${preset}`);
  console.log("\nDomainler:");
  for (const domain of verificationDomains()) console.log(`  ${domain}`);
  console.log("\nKontroller:");
  for (const item of VERIFICATION_CHECKS) {
    const manual = item.manual ? " · manual" : "";
    const platforms = item.platforms ? ` · ${item.platforms.join(",")}` : "";
    console.log(`  ${item.id} · ${item.domains.join(",")} · ${item.label}${manual}${platforms}`);
  }
}

function printPlan(items, currentSelection) {
  console.log(`Verify planı — ${selectionLabel(currentSelection)}`);
  for (const [index, item] of items.entries()) {
    console.log(`${String(index + 1).padStart(3, " ")}. ${item.id} · ${item.label}`);
  }
  console.log(`\nToplam: ${items.length} benzersiz kontrol`);
}

function selectionLabel(value) {
  if (value.preset) return `preset=${value.preset}`;
  if (value.domain) return `domain=${value.domain}`;
  return `check=${value.checkId}`;
}

function save() {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(reportPath, json);
  writeFileSync(latestPath, json);
}

function stamp(date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

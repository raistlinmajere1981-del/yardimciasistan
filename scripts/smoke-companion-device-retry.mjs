import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Isolated two-process Companion outbox check. Never installs, configures or
// clears the customer app; no hosting or LAN server is contacted. Phase 1 makes
// a simulated transport cut, the script force-stops the isolated package, and
// phase 2 must reload the exact action from SharedPreferences in a new process.
const packageName = "com.yardimciasistan.android.uifamily";
const runner = `${packageName}/com.yardimciasistan.android.CompanionRetryFixture$Runner`;
const fixtureBuild = mkdtempSync(join(tmpdir(), "ya-companion-retry-fixture-"));
let installed = false;
let restoreSleep = false;
const devices = run("adb", ["devices"]).split(/\r?\n/).filter(line => /\tdevice$/.test(line)).map(line => line.split("\t")[0]);
const serial = process.env.ANDROID_SERIAL || (devices.length === 1 ? devices[0] : "");
assert.ok(serial && devices.includes(serial), "Tek bağlı ADB cihazı veya ANDROID_SERIAL gerekli.");
const adb = args => run("adb", ["-s", serial, ...args]);
const stamp = () => new Date().toISOString();
try {
  assert.equal(adb(["shell", "pm", "list", "packages", packageName]).trim(), "", "Önceki fixture kurulumu var; üzerine yazılmadı.");
  const sdk = Number(adb(["shell", "getprop", "ro.build.version.sdk"]).trim());
  assert.ok(sdk >= 27, "Android 8.1+ cihaz gerekli.");
  console.log(`[${stamp()}] building isolated fixture (SDK ${sdk})`);
  run(process.execPath, ["scripts/run-android-gradle.mjs", "-I", resolve("scripts/fixtures/android-native-ui/fixture.init.gradle"),
    `-Dyardimci.uiFamilyBuild=${fixtureBuild}`, "assembleDebug", "--offline"], true);
  const apk = join(fixtureBuild, "outputs/apk/debug/yardimci-asistan-debug.apk");
  adb(["install", "-t", apk]);
  installed = true;
  restoreSleep = /mWakefulness=Asleep/.test(adb(["shell", "dumpsys", "power"]));
  if (restoreSleep) adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);

  console.log(`[${stamp()}] phase 1: persist before simulated transport cut`);
  const phase1 = adb(["shell", "am", "instrument", "-w", "-r", "-e", "retry_phase", "1", `'${runner}'`]);
  console.log(phase1.trim());
  assert.match(phase1, /companion-retry-phase1-ok:/);
  assert.match(phase1, /actions=1/);
  assert.match(phase1, /pending_after_simulated_cut=1/);
  assert.match(phase1, /INSTRUMENTATION_CODE: -1/);

  adb(["shell", "am", "force-stop", packageName]);
  console.log(`[${stamp()}] force-stopped ${packageName}; phase 2 starts a new process`);

  const phase2 = adb(["shell", "am", "instrument", "-w", "-r", "-e", "retry_phase", "2", `'${runner}'`]);
  console.log(phase2.trim());
  assert.match(phase2, /companion-retry-phase2-ok:/);
  assert.match(phase2, /reloaded_actions=1/);
  assert.match(phase2, /exact_payload=true/);
  assert.match(phase2, /forged_receipt_rejected=true/);
  assert.match(phase2, /exact_receipt_validated=true/);
  assert.match(phase2, /actions_after=0/);
  assert.match(phase2, /INSTRUMENTATION_CODE: -1/);

  const output = resolve("artifacts/android-companion-device-retry");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "result.txt"), `Device SDK: ${sdk}\nPhase 1 ${stamp()}\n${phase1}\n\nPhase 2 ${stamp()}\n${phase2}`);
  console.log(`[${stamp()}] PASS companion device retry: persisted action survived force-stop; exact payload reloaded; forged receipt rejected; validated receipt recorded and dequeued once; isolated fixture removed; production packages untouched`);
} finally {
  try {
    if (installed) adb(["uninstall", packageName]);
  } finally {
    try {
      if (restoreSleep) adb(["shell", "input", "keyevent", "KEYCODE_SLEEP"]);
    } finally {
      rmSync(fixtureBuild, { recursive: true, force: true });
    }
  }
}

function run(command, args, inherit = false) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: inherit ? "inherit" : "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed:\n${result.stderr || result.stdout || ""}`);
  return result.stdout || "";
}
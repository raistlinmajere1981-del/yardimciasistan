import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Explicit manual fixture: never installs/reconfigures Companion or a real dealer account.
const packageName = "com.yardimciasistan.dealer.fixture";
const build = mkdtempSync(join(tmpdir(), "ya-dealer-native-"));
const devices = run("adb", ["devices"]).split(/\r?\n/).filter(line => /\tdevice$/.test(line)).map(line => line.split("\t")[0]);
const serial = process.env.ANDROID_SERIAL || (devices.length === 1 ? devices[0] : "");
assert.ok(serial && devices.includes(serial), "Tek bağlı ADB cihazı veya ANDROID_SERIAL gerekli.");
const adb = args => run("adb", ["-s", serial, ...args]);
let installed = false, restoreSleep = false;
try {
  assert.equal(adb(["shell", "pm", "list", "packages", packageName]).trim(), "", "Önceki fixture kurulumu korunur; üzerine yazılmaz.");
  const sdk = Number(adb(["shell", "getprop", "ro.build.version.sdk"]).trim()); assert.ok(sdk >= 26);
  run(process.execPath, ["scripts/run-android-gradle.mjs", "--dealer", "--offline", "-I", resolve("scripts/fixtures/dealer-android/fixture.init.gradle"), `-Dyardimci.dealerFixtureBuild=${build}`, "assembleDebug"], true);
  adb(["install", "-t", join(build, "outputs/apk/debug/yardimci-asistan-bayi-debug.apk")]); installed = true;
  restoreSleep = /mWakefulness=Asleep/.test(adb(["shell", "dumpsys", "power"]));
  if (restoreSleep) adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
  const result = adb(["shell", "am", "instrument", "-w", "-r", `${packageName}/com.yardimciasistan.dealer.DealerDeviceFixture`]);
  const output = resolve("artifacts/dealer-android"); mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "native-fixture.txt"), `Device SDK: ${sdk}\nSynthetic cache only; no live server or real account.\n${result}`);
  assert.match(result, /dealer-native-device-ok:/); assert.match(result, /INSTRUMENTATION_CODE: -1/);
  console.log(result.trim());
} finally {
  try { if (installed) adb(["uninstall", packageName]); }
  finally {
    try { adb(["shell", "input", "keyevent", "KEYCODE_HOME"]); if (restoreSleep) adb(["shell", "input", "keyevent", "KEYCODE_SLEEP"]); }
    finally { rmSync(build, { recursive: true, force: true }); }
  }
}
function run(command, args, inherit = false) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: inherit ? "inherit" : "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command}: ${result.stderr || result.stdout || ""}`); return result.stdout || "";
}

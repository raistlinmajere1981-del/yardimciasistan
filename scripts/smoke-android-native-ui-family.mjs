import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// This manual check never installs/reconfigures the customer application or connects to hosting.
const packageName = "com.yardimciasistan.android.uifamily";
const fixtureBuild = mkdtempSync(join(tmpdir(), "ya-native-ui-fixture-"));
let installed = false;
let restoreSleep = false;
const devices = run("adb", ["devices"]).split(/\r?\n/).filter(line => /\tdevice$/.test(line)).map(line => line.split("\t")[0]);
const serial = process.env.ANDROID_SERIAL || (devices.length === 1 ? devices[0] : "");
assert.ok(serial && devices.includes(serial), "Tek bağlı ADB cihazı veya ANDROID_SERIAL gerekli.");
const adb = args => run("adb", ["-s", serial, ...args]);
try {
  assert.equal(adb(["shell", "pm", "list", "packages", packageName]).trim(), "", "Önceki fixture kurulumu var; üzerine yazılmadı.");
  const sdk = Number(adb(["shell", "getprop", "ro.build.version.sdk"]).trim());
  assert.ok(sdk >= 27, "Android 8.1+ cihaz gerekli.");
  run(process.execPath, ["scripts/run-android-gradle.mjs", "-I", resolve("scripts/fixtures/android-native-ui/fixture.init.gradle"),
    `-Dyardimci.uiFamilyBuild=${fixtureBuild}`, "assembleDebug", "--offline"], true);
  const apk = join(fixtureBuild, "outputs/apk/debug/yardimci-asistan-debug.apk");
  adb(["install", "-t", apk]);
  installed = true;
  // An asleep Activity does not deliver STARTED-scoped permission callbacks.
  // Wake only for instrumentation, then restore the device's previous sleep state.
  restoreSleep = /mWakefulness=Asleep/.test(adb(["shell", "dumpsys", "power"]));
  if (restoreSleep) adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
  const result = adb(["shell", "am", "instrument", "-w", "-r", `'${packageName}/com.yardimciasistan.android.NativeUiFamilyFixture$Runner'`]);
  const output = resolve("artifacts/android-native-ui-family");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "result.txt"), `Device SDK: ${sdk}\n${result}`);
  assert.match(result, /native-ui-family-ok:/);
  assert.match(result, /INSTRUMENTATION_CODE: -1/);
  console.log(result.trim());
  console.log(`android-native-ui-family-device-ok (SDK ${sdk}; isolated fixture; production app untouched)`);
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

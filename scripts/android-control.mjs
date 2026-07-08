import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(repoRoot, "artifacts", "android-control");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const keyAliases = {
  back: "KEYCODE_BACK",
  home: "KEYCODE_HOME",
  enter: "KEYCODE_ENTER",
  wake: "KEYCODE_WAKEUP",
  power: "KEYCODE_POWER",
  menu: "KEYCODE_MENU",
  tab: "KEYCODE_TAB"
};

const { command, args, serial } = parseArgs(process.argv.slice(2));

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "mirror") {
    runMirror(args, serial);
    return;
  }

  ensureAdbDevice(serial);

  if (command === "info") {
    printInfo(serial);
  } else if (command === "launch") {
    adb(serial, ["shell", "am", "start", "-n", `${packageName}/${activityName}`]);
  } else if (command === "wake") {
    adb(serial, ["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
  } else if (command === "screenshot") {
    captureScreenshot(args[0], serial);
  } else if (command === "dump") {
    dumpUi(args[0], serial);
  } else if (command === "tap") {
    tap(args, serial);
  } else if (command === "swipe") {
    swipe(args, serial);
  } else if (command === "text") {
    typeText(args, serial);
  } else if (command === "key") {
    keyEvent(args, serial);
  } else {
    throw new Error(`Bilinmeyen komut: ${command}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    serial: process.env.ANDROID_SERIAL ?? "",
    command: "",
    args: []
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--serial" || arg === "-s") {
      parsed.serial = rawArgs[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--serial=")) {
      parsed.serial = arg.slice("--serial=".length);
    } else if (!parsed.command) {
      parsed.command = arg;
    } else {
      parsed.args.push(arg);
    }
  }

  return parsed;
}

function ensureAdbDevice(serial) {
  const result = adb(serial, ["devices"], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "adb devices çalışmadı.");
  }

  const devices = result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [deviceSerial, state] = line.split(/\s+/);
      return { serial: deviceSerial, state };
    })
    .filter((device) => device.state === "device");

  if (serial) {
    if (!devices.some((device) => device.serial === serial)) {
      throw new Error(`ADB cihazı bulunamadı: ${serial}`);
    }
    return;
  }

  if (devices.length === 0) {
    throw new Error("ADB cihazı bulunamadı. Telefon bağlı ve USB hata ayıklama açık olmalı.");
  }

  if (devices.length > 1) {
    throw new Error("Birden fazla ADB cihazı var. --serial <cihaz> ile seçim yapın.");
  }
}

function printInfo(serial) {
  console.log(adb(serial, ["devices", "-l"], { capture: true }).stdout.trim());
  console.log(adb(serial, ["shell", "wm", "size"], { capture: true }).stdout.trim());
  console.log(adb(serial, ["shell", "wm", "density"], { capture: true }).stdout.trim());

  const focus = adb(serial, ["shell", "dumpsys", "window"], { capture: true, allowFailure: true }).stdout
    .split("\n")
    .find((line) => line.includes("mCurrentFocus") || line.includes("mFocusedApp"));

  if (focus) {
    console.log(focus.trim());
  }
}

function captureScreenshot(fileName, serial) {
  ensureArtifactDir();
  const outputPath = resolveArtifactPath(fileName || `screen-${timestamp()}.png`, ".png");
  const result = adb(serial, ["exec-out", "screencap", "-p"], {
    binary: true,
    capture: true,
    maxBuffer: 24 * 1024 * 1024
  });

  writeFileSync(outputPath, result.stdout);
  console.log(`android-screenshot: ${outputPath}`);
}

function dumpUi(fileName, serial) {
  ensureArtifactDir();
  adb(serial, ["shell", "uiautomator", "dump", "/sdcard/window.xml"]);
  const outputPath = resolveArtifactPath(fileName || `ui-${timestamp()}.xml`, ".xml");
  const result = adb(serial, ["exec-out", "cat", "/sdcard/window.xml"], {
    capture: true,
    maxBuffer: 8 * 1024 * 1024
  });

  writeFileSync(outputPath, result.stdout);
  console.log(`android-ui-dump: ${outputPath}`);
}

function tap(values, serial) {
  const [x, y] = parseNumbers(values, 2, "Kullanım: npm run android:control -- tap <x> <y>");
  adb(serial, ["shell", "input", "tap", String(x), String(y)]);
}

function swipe(values, serial) {
  const [x1, y1, x2, y2, duration = 300] = parseNumbers(values, 4, "Kullanım: npm run android:control -- swipe <x1> <y1> <x2> <y2> [ms]");
  adb(serial, ["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(duration)]);
}

function typeText(values, serial) {
  const text = values.join(" ");
  if (!text.trim()) {
    throw new Error("Kullanım: npm run android:control -- text \"metin\"");
  }

  adb(serial, ["shell", "input", "text", escapeInputText(text)]);
}

function keyEvent(values, serial) {
  const rawKey = values[0] ?? "";
  const key = keyAliases[rawKey.toLowerCase()] ?? rawKey;
  if (!key) {
    throw new Error("Kullanım: npm run android:control -- key <back|home|enter|KEYCODE_...>");
  }

  adb(serial, ["shell", "input", "keyevent", key]);
}

function runMirror(values, serial) {
  const extraArgs = values.length > 0 ? values : ["--stay-awake", "--turn-screen-off=false"];
  const args = serial ? ["--serial", serial, ...extraArgs] : extraArgs;
  const child = spawn("scrcpy", args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.once("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function adb(serial, args, options = {}) {
  const adbArgs = serial && args[0] !== "devices" ? ["-s", serial, ...args] : args;
  const result = spawnSync("adb", adbArgs, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`adb ${adbArgs.join(" ")} başarısız oldu.\n${formatOutput(result)}`.trim());
  }

  if (!options.capture && result.stdout?.toString().trim()) {
    console.log(result.stdout.toString().trim());
  }

  if (!options.capture && result.stderr?.toString().trim()) {
    console.error(result.stderr.toString().trim());
  }

  return result;
}

function parseNumbers(values, minCount, usage) {
  if (values.length < minCount) {
    throw new Error(usage);
  }

  const parsed = values.map((value) => Number(value));
  if (parsed.some((value) => !Number.isFinite(value))) {
    throw new Error(usage);
  }

  return parsed.map((value) => Math.trunc(value));
}

function ensureArtifactDir() {
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }
}

function resolveArtifactPath(fileName, extension) {
  const normalized = fileName.endsWith(extension) ? fileName : `${fileName}${extension}`;
  if (normalized.includes("/") || normalized.includes("\\")) {
    return resolve(normalized);
  }

  return join(artifactDir, normalized);
}

function escapeInputText(value) {
  return value
    .replace(/%/g, "%25")
    .replace(/\s/g, "%s")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

function formatOutput(result) {
  return `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function printHelp() {
  console.log(`Android kontrol komutları:

npm run android:control -- info
npm run android:control -- launch
npm run android:control -- screenshot [dosya.png]
npm run android:control -- dump [dosya.xml]
npm run android:control -- tap <x> <y>
npm run android:control -- swipe <x1> <y1> <x2> <y2> [ms]
npm run android:control -- text "metin"
npm run android:control -- key <back|home|enter|wake|KEYCODE_...>
npm run android:mirror

Birden fazla cihaz varsa --serial <cihaz> kullanın.`);
}

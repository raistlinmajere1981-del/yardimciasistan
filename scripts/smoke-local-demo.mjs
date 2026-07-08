import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
let currentChild = null;

process.once("SIGINT", () => stopAndExit(130));
process.once("SIGTERM", () => stopAndExit(143));

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const steps = [];

  if (!options.skipDoctor) {
    steps.push(step("Ortam doktoru", "npm", ["run", "doctor"]));
  }

  steps.push(step("Yerel web laboratuvarı", "npm", ["run", "smoke:local-lab"]));
  steps.push(step("Web/PC veri demo akışı", "npm", ["run", "smoke:demo-flow"]));
  steps.push(step("Desktop UI demo akışı", "npm", ["run", "smoke:desktop-renderer"]));

  if (options.skipAndroid) {
    steps.push(step("Android hosting hazırlığı", "npm", ["run", "smoke:android-hosting"]));
  } else {
    const device = ensureAdbDevice();
    console.log(`Android cihaz: ${device}`);

    if (!options.noAndroidBuild) {
      steps.push(step("Android APK build", "npm", ["run", "build:android"]));
    }

    steps.push(step("Android gerçek cihaz UI", "node", [
      "scripts/smoke-android-device-ui.mjs",
      "--no-build",
      "--hold-ms",
      String(options.androidHoldMs)
    ]));
  }

  const startedAt = Date.now();

  for (let index = 0; index < steps.length; index += 1) {
    const current = steps[index];
    console.log(`\n[${index + 1}/${steps.length}] ${current.label}`);
    await run(current);
  }

  console.log(`\nlocal-demo-smoke-ok: ${steps.length} adım ${formatDuration(Date.now() - startedAt)} içinde geçti.`);
}

function parseArgs(args) {
  const parsed = {
    androidHoldMs: 30000,
    help: false,
    noAndroidBuild: false,
    skipAndroid: false,
    skipDoctor: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--skip-android") {
      parsed.skipAndroid = true;
    } else if (arg === "--skip-doctor") {
      parsed.skipDoctor = true;
    } else if (arg === "--no-android-build") {
      parsed.noAndroidBuild = true;
    } else if (arg.startsWith("--android-hold-ms=")) {
      parsed.androidHoldMs = Number(arg.slice("--android-hold-ms=".length));
    } else if (arg === "--android-hold-ms") {
      parsed.androidHoldMs = Number(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  if (!Number.isInteger(parsed.androidHoldMs) || parsed.androidHoldMs < 8000 || parsed.androidHoldMs > 300000) {
    throw new Error("--android-hold-ms 8000-300000 ms arasında sayısal olmalı.");
  }

  return parsed;
}

function step(label, command, args) {
  return { label, command, args };
}

function run({ label, command, args }) {
  return new Promise((resolveStep, rejectStep) => {
    currentChild = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    currentChild.once("exit", (code, signal) => {
      currentChild = null;
      if (code === 0) {
        resolveStep();
        return;
      }

      const status = signal ? `signal ${signal}` : `exit ${code ?? 1}`;
      rejectStep(new Error(`${label} başarısız oldu (${status}).`));
    });
  });
}

function ensureAdbDevice() {
  const result = spawnSync("adb", ["devices"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(`adb devices çalışmadı. Android testi için adb hazır olmalı veya --skip-android kullanılmalı.\n${formatOutput(result)}`);
  }

  const devices = result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.state === "device");

  if (devices.length === 0) {
    throw new Error("ADB cihazı bulunamadı. Telefon bağlı, kilitsiz ve USB hata ayıklama açık olmalı. Telefonsuz prova için --skip-android kullanılabilir.");
  }

  const selectedSerial = process.env.ANDROID_SERIAL;
  if (selectedSerial) {
    const selected = devices.find((device) => device.serial === selectedSerial);
    if (!selected) {
      throw new Error(`ANDROID_SERIAL cihazı bulunamadı: ${selectedSerial}`);
    }
    return selected.serial;
  }

  if (devices.length > 1) {
    throw new Error("Birden fazla ADB cihazı var. ANDROID_SERIAL ile cihaz seçilmeli.");
  }

  return devices[0].serial;
}

function printHelp() {
  console.log(`Kullanım: npm run smoke:local-demo -- [seçenekler]

Seçenekler:
  --skip-android          Gerçek cihaz UI testi yerine Android hosting hazırlığını çalıştırır.
  --skip-doctor           Ortam doktoru adımını atlar.
  --no-android-build      Android UI testi öncesi APK build adımını atlar.
  --android-hold-ms <ms>  Android phone-test sunucusunu canlı tutma süresi. Varsayılan: 30000.
`);
}

function formatOutput(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) {
    return `${remainder}s`;
  }
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function stopAndExit(code) {
  if (currentChild && currentChild.exitCode === null) {
    currentChild.kill();
  }
  process.exit(code);
}

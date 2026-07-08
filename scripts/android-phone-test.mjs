import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const syncSecret = "change-this-secret";
const outputApk = join(repoRoot, "apps", "android-app", "build", "outputs", "apk", "debug", "yardimci-asistan-debug.apk");
const webModuleRoot = join(repoRoot, "firm-template", "web-module");
const requestsFile = join(webModuleRoot, "data", "requests.json");
const syncStateFile = join(webModuleRoot, "data", "sync-state.json");
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
const demoRequestsFile = join(repoRoot, "demo-data", "web-module-requests.json");

const options = parseArgs(process.argv.slice(2));
const backups = new Map([
  [requestsFile, readFileSync(requestsFile, "utf8")],
  [syncStateFile, readFileSync(syncStateFile, "utf8")],
  [conversationsFile, readFileSync(conversationsFile, "utf8")]
]);

let phpServer = null;
let phpOutput = "";
let cleaned = false;

process.once("SIGINT", () => stopAndExit(0));
process.once("SIGTERM", () => stopAndExit(0));

try {
  await main();
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  const port = await getAvailablePort(options.port, options.host);
  const localBaseUrl = `http://127.0.0.1:${port}`;
  const lanUrls = getLanUrls(port);
  const primaryLanUrl = lanUrls[0] ?? localBaseUrl;

  seedDemoData();

  if (!options.noBuild) {
    run("npm", ["run", "build:android"]);
  }

  if (!existsSync(outputApk) && !options.noAdb) {
    throw new Error(`APK bulunamadı: ${outputApk}`);
  }

  phpServer = spawn("php", ["-S", `${options.host}:${port}`, "-t", webModuleRoot], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  phpServer.stdout.on("data", collectPhpOutput);
  phpServer.stderr.on("data", collectPhpOutput);

  await waitForServer(localBaseUrl);
  await verifyAndroidSummary(localBaseUrl);

  const adbResult = options.noAdb ? { state: "skipped" } : installAndLaunchWithAdb(port, primaryLanUrl);
  printReady({ port, localBaseUrl, lanUrls, adbResult });

  if (options.once) {
    cleanup();
    return;
  }

  await waitUntilStopped();
}

function parseArgs(args) {
  const parsed = {
    host: "0.0.0.0",
    port: 8080,
    noAdb: false,
    noBuild: false,
    noReverse: false,
    keepData: false,
    once: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-adb") {
      parsed.noAdb = true;
    } else if (arg === "--no-build") {
      parsed.noBuild = true;
    } else if (arg === "--no-reverse") {
      parsed.noReverse = true;
    } else if (arg === "--keep-data") {
      parsed.keepData = true;
    } else if (arg === "--once") {
      parsed.once = true;
    } else if (arg.startsWith("--port=")) {
      parsed.port = Number(arg.slice("--port=".length));
    } else if (arg === "--port") {
      parsed.port = Number(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length);
    } else if (arg === "--host") {
      parsed.host = args[index + 1] ?? parsed.host;
      index += 1;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    throw new Error("Port 1-65535 arasında sayısal olmalı.");
  }

  return parsed;
}

function seedDemoData() {
  const requests = JSON.parse(readFileSync(demoRequestsFile, "utf8"));
  writeJson(requestsFile, requests);
  writeJson(conversationsFile, []);
  writeJson(syncStateFile, {
    demo_seeded_at: new Date().toISOString(),
    last_request_pull_at: "",
    last_request_mark_at: "",
    last_android_summary_at: "",
    last_request_status_update_at: "",
    last_menu_publish_at: "",
    updated_at: new Date().toISOString()
  });
}

function installAndLaunchWithAdb(port, primaryLanUrl) {
  const devices = getAdbDevices();
  if (devices.length === 0) {
    return { state: "missing" };
  }

  const device = devices[0];
  let deviceBaseUrl = primaryLanUrl;
  let reverse = false;

  if (!options.noReverse) {
    const reverseResult = runAdb(device.serial, ["reverse", `tcp:${port}`, `tcp:${port}`], { allowFailure: true });
    reverse = reverseResult.status === 0;
    if (reverse) {
      deviceBaseUrl = `http://127.0.0.1:${port}`;
    }
  }

  installApk(device.serial);
  runAdb(device.serial, [
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--es",
    "ya_web_module_url",
    deviceBaseUrl,
    "--es",
    "ya_sync_secret",
    syncSecret
  ]);

  return {
    state: "launched",
    serial: device.serial,
    url: deviceBaseUrl,
    reverse
  };
}

function installApk(serial) {
  let result = runAdb(serial, ["install", "-r", outputApk], { allowFailure: true });
  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0 && output.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
    runAdb(serial, ["uninstall", packageName], { allowFailure: true });
    result = runAdb(serial, ["install", "-r", outputApk], { allowFailure: true });
  }

  if (result.status !== 0) {
    throw new Error(`APK kurulamadı.\n${result.stdout}${result.stderr}`.trim());
  }
}

function getAdbDevices() {
  const result = run("adb", ["devices"], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.state === "device");
}

function printReady({ port, localBaseUrl, lanUrls, adbResult }) {
  console.log("android-phone-test-ready");
  console.log(`PHP sunucusu: ${options.host}:${port}`);
  console.log(`Yerel kontrol: ${localBaseUrl}/api/sync.php`);
  console.log(`Sync anahtarı: ${syncSecret}`);
  console.log(`Demo kayıt: 3 web talebi`);

  if (lanUrls.length > 0) {
    console.log("Telefon LAN adresleri:");
    for (const url of lanUrls) {
      console.log(`- ${url}`);
    }
  } else {
    console.log("LAN IP bulunamadı. Telefon testi için aynı ağdaki PC IP adresini kullanın.");
  }

  if (adbResult.state === "launched") {
    console.log(`ADB cihazı: ${adbResult.serial}`);
    console.log(`Uygulama açıldı: ${adbResult.url}`);
    console.log(`ADB reverse: ${adbResult.reverse ? "aktif" : "pasif"}`);
  } else if (adbResult.state === "missing") {
    console.log(`ADB cihazı bulunamadı. APK: ${outputApk}`);
    console.log(`Manuel başlatma örneği: adb shell am start -n ${packageName}/${activityName} --es ya_web_module_url ${lanUrls[0] ?? localBaseUrl} --es ya_sync_secret ${syncSecret}`);
  } else {
    console.log("ADB adımı atlandı.");
  }

  if (!options.once) {
    console.log("Sunucu açık. Bitirmek ve verileri geri almak için Ctrl+C kullanın.");
  }
}

async function verifyAndroidSummary(baseUrl) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "android_summary",
      sync_secret: syncSecret,
      limit: 10
    })
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.message ?? "Android özeti doğrulanamadı.");
  }

  if ((json.summary?.request_count ?? 0) < 3) {
    throw new Error("Android özeti beklenen demo taleplerini döndürmedi.");
  }
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (phpServer.exitCode !== null) {
      throw new Error(`PHP sunucusu erken kapandı.\n${phpOutput.trim()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/menu.php`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(100);
  }

  throw new Error(`PHP sunucusu hazır olmadı.\n${phpOutput.trim()}`);
}

function getLanUrls(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

function getAvailablePort(preferredPort, host) {
  return probePort(preferredPort, host).catch(() => probePort(0, host));
}

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      server.close(() => resolve(resolvedPort));
    });
  });
}

function waitUntilStopped() {
  return new Promise((resolve) => {
    phpServer.once("exit", () => {
      cleanup();
      resolve();
    });
  });
}

function collectPhpOutput(chunk) {
  phpOutput += chunk.toString();
  if (phpOutput.length > 20000) {
    phpOutput = phpOutput.slice(-10000);
  }
}

function runAdb(serial, args, options = {}) {
  return run("adb", ["-s", serial, ...args], options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} başarısız oldu.\n${result.stdout}${result.stderr}`.trim());
  }

  if (!options.capture && result.stdout?.trim()) {
    console.log(result.stdout.trim());
  }

  if (!options.capture && result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }

  return result;
}

function cleanup() {
  if (cleaned) {
    return;
  }

  cleaned = true;

  if (phpServer && phpServer.exitCode === null) {
    phpServer.kill();
  }

  if (!options.keepData) {
    for (const [path, contents] of backups) {
      writeFileSync(path, contents);
    }
  }
}

function stopAndExit(code) {
  cleanup();
  process.exit(code);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const webModuleRoot = join(repoRoot, "firm-template", "web-module");
const businessConfig = JSON.parse(readFileSync(join(webModuleRoot, "config", "business.json"), "utf8"));
const syncSecret = String(businessConfig.sync_secret ?? "").trim();
const outputApk = join(repoRoot, "apps", "android-app", "build", "outputs", "apk", "debug", "yardimci-asistan-debug.apk");
const generatedConnectionDefaultsFile = join(repoRoot, "apps", "android-app", "build", "generated", "source", "connection", "com", "yardimciasistan", "android", "ConnectionDefaults.java");
const demoAndroidSnapshotFile = join(repoRoot, "demo-data", "android-operations-snapshot.json");
const verificationDeviceId = "android-phone-smoke";
const defaultPhonePermissions = [
  "room.view",
  "room.update_status",
  "daily_task.view",
  "daily_task.complete",
  "daily_task.reopen",
  "table.view",
  "table.update_status",
  "table_order.view",
  "table_order.open",
  "table_order.add_item",
  "table_order.update_item",
  "table_order.remove_item",
  "table_order.set_preparing",
  "table_order.set_served",
  "table_order.set_payment_waiting",
  "menu.view",
  "menu.stock_view"
];
const runtimeFiles = [
  "yardimci-asistan.sqlite",
  "yardimci-asistan.sqlite-wal",
  "yardimci-asistan.sqlite-shm"
].map((file) => join(webModuleRoot, "data", file));

const options = parseArgs(process.argv.slice(2));
const managedFiles = [...runtimeFiles];
const backups = new Map(managedFiles.filter((path) => existsSync(path)).map((path) => [path, readFileSync(path)]));

let phpServer = null;
let phpOutput = "";
let cleaned = false;
let activeAdbSerial = "";

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
  const connectedDevice = options.noAdb ? null : getAdbDevices()[0] ?? null;
  const installedDeviceId = connectedDevice ? readInstalledDeviceId(connectedDevice.serial) : "";

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
  await seedDemoData([verificationDeviceId, installedDeviceId].filter(Boolean), localBaseUrl);
  await verifyAndroidSummary(localBaseUrl, verificationDeviceId);

  const adbResult = options.noAdb ? { state: "skipped" } : installAndLaunchWithAdb(port, primaryLanUrl);
  printReady({ port, localBaseUrl, lanUrls, adbResult });

  if (options.once) {
    if (options.holdMs > 0) {
      console.log(`Sunucu ${options.holdMs} ms daha açık tutuluyor.`);
      await delay(options.holdMs);
    }

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
    once: false,
    holdMs: 0
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
    } else if (arg.startsWith("--hold-ms=")) {
      parsed.holdMs = Number(arg.slice("--hold-ms=".length));
    } else if (arg === "--hold-ms") {
      parsed.holdMs = Number(args[index + 1]);
      index += 1;
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

  if (!Number.isInteger(parsed.holdMs) || parsed.holdMs < 0 || parsed.holdMs > 900000) {
    throw new Error("Bekleme süresi 0-900000 ms arasında sayısal olmalı.");
  }

  return parsed;
}

async function seedDemoData(approvedDeviceIds, baseUrl) {
  for (const path of runtimeFiles) {
    rmSync(path, { force: true });
  }
  const androidSnapshot = JSON.parse(readFileSync(demoAndroidSnapshotFile, "utf8"));
  androidSnapshot.androidPermissions = Object.fromEntries(approvedDeviceIds.map((deviceId) => [
    deviceId,
    {
      role: "staff",
      is_active: true,
      permissions: defaultPhonePermissions
    }
  ]));
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "android-phone-test",
      source_revision: 1,
      idempotency_key: "android-phone-test:1",
      snapshot: androidSnapshot
    })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message ?? "Demo Android snapshot yayınlanamadı.");
  }
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
  activeAdbSerial = device.serial;
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
    syncSecret,
    "--ez",
    "ya_allow_debug_connection_override",
    "true"
  ]);

  return {
    state: "launched",
    serial: device.serial,
    url: deviceBaseUrl,
    reverse
  };
}

function installApk(serial) {
  const deviceIdBeforeUpdate = readInstalledDeviceId(serial);
  const result = runAdb(serial, ["install", "-r", outputApk], { allowFailure: true });
  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0 && output.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
    throw new Error([
      "APK mevcut uygulamayla aynı imzayı kullanmıyor; telefon verilerini korumak için uygulama kaldırılmadı.",
      "Aynı imzalama anahtarıyla yeniden derleyin. Uygulamayı kaldırmak cihaz ayarlarını ve eski telefon kimliğini silebilir."
    ].join("\n"));
  }

  if (result.status !== 0) {
    throw new Error(`APK kurulamadı.\n${result.stdout}${result.stderr}`.trim());
  }

  const deviceIdAfterUpdate = readInstalledDeviceId(serial);
  if (deviceIdBeforeUpdate && deviceIdAfterUpdate && deviceIdBeforeUpdate !== deviceIdAfterUpdate) {
    throw new Error("APK güncellemesi sırasında telefon kimliği değişti.");
  }
}

function readInstalledDeviceId(serial) {
  const result = runAdb(serial, [
    "shell",
    "run-as",
    packageName,
    "cat",
    "shared_prefs/yardimci_asistan_android.xml"
  ], { allowFailure: true, capture: true });
  if (result.status !== 0) {
    return "";
  }
  const match = result.stdout.match(/<string name="device_id">([^<]+)<\/string>/);
  return match ? match[1].trim() : "";
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
  console.log(`Sync anahtarı: ${syncSecret ? `yapılandırıldı (${syncSecret.length} karakter)` : "eksik"}`);
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
    console.log(`Manuel başlatma örneği: adb shell am start -n ${packageName}/${activityName} --es ya_web_module_url ${lanUrls[0] ?? localBaseUrl} --es ya_sync_secret '<sync-secret>'`);
  } else {
    console.log("ADB adımı atlandı.");
  }

  if (!options.once) {
    console.log("Sunucu açık. Bitirmek ve verileri geri almak için Ctrl+C kullanın.");
  }
}

async function verifyAndroidSummary(baseUrl, deviceId) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "android_summary",
      device_id: deviceId,
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
  if ((json.rooms?.length ?? 0) < 2 || (json.tables?.length ?? 0) < 2 || (json.table_orders?.length ?? 0) < 1) {
    throw new Error("Android operasyon snapshot'ı oda, masa ve aktif adisyon verisini döndürmedi.");
  }
  if ((json.menu?.items?.length ?? 0) < 3 || (json.messages?.length ?? 0) < 1) {
    throw new Error("Android operasyon snapshot'ı menü ve hazır mesaj verisini döndürmedi.");
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

  restoreEmbeddedConnection();

  if (phpServer && phpServer.exitCode === null) {
    phpServer.kill();
  }

  if (!options.keepData) {
    for (const path of managedFiles) {
      rmSync(path, { force: true });
    }
    for (const [path, contents] of backups) {
      writeFileSync(path, contents);
    }
  }
}

function restoreEmbeddedConnection() {
  if (!activeAdbSerial || !embeddedConnectionIsLocked()) {
    return;
  }
  const serial = activeAdbSerial;
  activeAdbSerial = "";
  runAdb(serial, ["shell", "am", "force-stop", packageName], { allowFailure: true, capture: true });
  runAdb(serial, ["shell", "am", "start", "-n", `${packageName}/${activityName}`], { allowFailure: true, capture: true });
}

function embeddedConnectionIsLocked() {
  return existsSync(generatedConnectionDefaultsFile)
      && readFileSync(generatedConnectionDefaultsFile, "utf8").includes("LOCK_EMBEDDED_CONNECTION = true");
}

function stopAndExit(code) {
  cleanup();
  process.exit(code);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

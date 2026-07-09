import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(repoRoot, "artifacts", "android-device-ui");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const syncSecret = "change-this-secret";

const options = parseArgs(process.argv.slice(2));
let phoneTest = null;

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
  ensureArtifactDir();
  ensureAdbDevice();

  phoneTest = startPhoneTest();
  await waitForReady(phoneTest, options.readyTimeoutMs);
  const baseUrl = getPhoneTestBaseUrl(phoneTest.output);
  prepareAppForUi(baseUrl);
  await delay(options.settleMs);
  scrollToTop();

  let topXml = dumpUi("top.xml");
  captureScreenshot("top.png");
  assertContains(topXml, ["Yardımcı Asistan", "Firma web modülünden canlı özet", "Canlı Veriyi Çek", "Yeni Talepler"]);

  const buttonBounds = findBoundsByText(topXml, "Canlı Veriyi Çek");
  tap(centerOf(buttonBounds));
  await waitForUiText("Canlı veri alındı", 12000);

  topXml = dumpUi("after-refresh.xml");
  captureScreenshot("after-refresh.png");
  assertContains(topXml, ["Canlı veri alındı", "Toplam Web Kaydı"]);

  swipe(360, 1120, 360, 260, 450);
  await delay(700);
  swipe(360, 1120, 360, 260, 450);
  await delay(700);

  const requestsXml = dumpUi("requests.xml");
  captureScreenshot("requests.png");
  assertContains(requestsXml, ["Canlı müşteri talepleri", "3 talep görüntüleniyor", "Demo Aile"]);

  tap(centerOf(findBoundsByText(requestsXml, "Demo Aile")));
  await delay(500);
  swipe(360, 1120, 360, 260, 450);
  await delay(700);
  swipe(360, 1120, 360, 260, 450);
  await delay(700);

  const detailXml = dumpUi("request-detail.xml");
  captureScreenshot("request-detail.png");
  assertContains(detailXml, ["Demo Aile", "Cevaplandı"]);

  tap(centerOf(findBoundsByText(detailXml, "Cevaplandı")));
  await waitForRequestStatus(baseUrl, "request_demo_web_001", "answered", 12000);
  const answeredXml = dumpUi("answered.xml");
  captureScreenshot("answered.png");
  assertContains(answeredXml, ["Demo Aile", "Cevaplandı"]);

  console.log("android-device-ui-smoke-ok");
  cleanup();
  await waitForPhoneTestExit();
}

function parseArgs(args) {
  const parsed = {
    holdMs: 30000,
    readyTimeoutMs: 45000,
    settleMs: 1800,
    noBuild: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-build") {
      parsed.noBuild = true;
    } else if (arg.startsWith("--hold-ms=")) {
      parsed.holdMs = Number(arg.slice("--hold-ms=".length));
    } else if (arg === "--hold-ms") {
      parsed.holdMs = Number(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--settle-ms=")) {
      parsed.settleMs = Number(arg.slice("--settle-ms=".length));
    } else if (arg === "--settle-ms") {
      parsed.settleMs = Number(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  for (const [name, value] of Object.entries({
    holdMs: parsed.holdMs,
    readyTimeoutMs: parsed.readyTimeoutMs,
    settleMs: parsed.settleMs
  })) {
    if (!Number.isInteger(value) || value < 0 || value > 300000) {
      throw new Error(`${name} 0-300000 ms arasında sayısal olmalı.`);
    }
  }

  if (parsed.holdMs < 8000) {
    throw new Error("--hold-ms Android UI smoke için en az 8000 olmalı.");
  }

  return parsed;
}

function startPhoneTest() {
  const args = ["scripts/android-phone-test.mjs", "--once", "--hold-ms", String(options.holdMs)];
  if (options.noBuild) {
    args.push("--no-build");
  }

  const child = spawn("node", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.output = "";
  child.stdout.on("data", (chunk) => collectPhoneOutput(child, chunk));
  child.stderr.on("data", (chunk) => collectPhoneOutput(child, chunk));
  return child;
}

function collectPhoneOutput(child, chunk) {
  const text = chunk.toString();
  child.output += text;
  if (child.output.length > 40000) {
    child.output = child.output.slice(-20000);
  }

  process.stdout.write(prefixLines("android-phone-test", text));
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`android-phone-test hazır olmadı.\n${child.output.trim()}`));
    }, timeoutMs);

    const interval = setInterval(() => {
      if (child.output.includes("android-phone-test-ready")) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 100);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      clearInterval(interval);
      if (!child.output.includes("android-phone-test-ready")) {
        reject(new Error(`android-phone-test erken kapandı (${code ?? 0}).\n${child.output.trim()}`));
      }
    });
  });
}

function getPhoneTestBaseUrl(output) {
  const match = output.match(/Yerel kontrol:\s+(http:\/\/127\.0\.0\.1:\d+)\/api\/sync\.php/);
  if (!match) {
    throw new Error(`android-phone-test yerel kontrol adresi bulunamadı.\n${output.trim()}`);
  }

  return match[1];
}

function ensureAdbDevice() {
  const result = adb(["devices"], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "adb devices çalışmadı.");
  }

  const devices = result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\sdevice(\s|$)/.test(line));

  if (devices.length === 0) {
    throw new Error("ADB cihazı bulunamadı. Telefon bağlı, kilitsiz ve USB hata ayıklama açık olmalı.");
  }
}

function dumpUi(fileName) {
  adb(["shell", "uiautomator", "dump", "/sdcard/window.xml"]);
  const outputPath = join(artifactDir, fileName);
  const result = adb(["exec-out", "cat", "/sdcard/window.xml"], {
    capture: true,
    maxBuffer: 8 * 1024 * 1024
  });
  writeFileSync(outputPath, result.stdout);
  return readFileSync(outputPath, "utf8");
}

function captureScreenshot(fileName) {
  const outputPath = join(artifactDir, fileName);
  const result = adb(["exec-out", "screencap", "-p"], {
    binary: true,
    capture: true,
    maxBuffer: 24 * 1024 * 1024
  });
  writeFileSync(outputPath, result.stdout);
}

function tap(point) {
  adb(["shell", "input", "tap", String(point.x), String(point.y)]);
}

function swipe(x1, y1, x2, y2, durationMs) {
  adb(["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(durationMs)]);
}

function prepareAppForUi(baseUrl) {
  adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], { allowFailure: true });
  adb(["shell", "wm", "dismiss-keyguard"], { allowFailure: true });
  adb(["shell", "input", "keyevent", "KEYCODE_MENU"], { allowFailure: true });
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"], { allowFailure: true });
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--es",
    "ya_web_module_url",
    baseUrl,
    "--es",
    "ya_sync_secret",
    syncSecret
  ]);
}

function scrollToTop() {
  for (let index = 0; index < 3; index += 1) {
    swipe(360, 300, 360, 1120, 300);
  }
}

async function waitForUiText(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const xml = dumpUi("wait.xml");
    if (xml.includes(text)) {
      return;
    }
    await delay(500);
  }

  throw new Error(`Android UI metni beklenirken zaman aşımı: ${text}`);
}

async function waitForRequestStatus(baseUrl, requestId, expectedStatus, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
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
    const request = json.requests?.find((candidate) => candidate.id === requestId);
    if (request?.status === expectedStatus) {
      return;
    }

    await delay(500);
  }

  throw new Error(`${requestId} beklenen duruma geçmedi: ${expectedStatus}`);
}

function findBoundsByText(xml, text) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`text="${escapeXmlAttribute(text)}"`));
  if (!node) {
    throw new Error(`UI node bulunamadı: ${text}`);
  }

  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    throw new Error(`UI node bounds bulunamadı: ${text}`);
  }

  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function centerOf(bounds) {
  return {
    x: Math.trunc((bounds.left + bounds.right) / 2),
    y: Math.trunc((bounds.top + bounds.bottom) / 2)
  };
}

function assertContains(xml, texts) {
  const missing = texts.filter((text) => !xml.includes(text));
  if (missing.length > 0) {
    throw new Error(`Android UI beklenen metinleri içermiyor: ${missing.join(", ")}`);
  }
}

function adb(args, options = {}) {
  const result = spawnSync("adb", args, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(" ")} başarısız oldu.\n${formatOutput(result)}`.trim());
  }

  return result;
}

function ensureArtifactDir() {
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }
}

function prefixLines(name, text) {
  return text
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" || part === "" ? part : `[${name}] ${part}`))
    .join("");
}

function escapeXmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatOutput(result) {
  return `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
}

function cleanup() {
  if (phoneTest && phoneTest.exitCode === null) {
    phoneTest.kill();
  }
}

function waitForPhoneTestExit() {
  return new Promise((resolve) => {
    if (!phoneTest || phoneTest.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, 3000);
    phoneTest.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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

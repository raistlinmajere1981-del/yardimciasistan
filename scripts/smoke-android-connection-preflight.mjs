import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-android-preflight-"));
const webModuleRoot = join(tempRoot, "web-module");
const syncSecret = "android-preflight-smoke-secret-67890";
const preflight = join(process.cwd(), "scripts", "preflight-android-connection.mjs");

cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
for (const runtimeFile of [
  "yardimci-asistan.sqlite",
  "yardimci-asistan.sqlite-wal",
  "yardimci-asistan.sqlite-shm"
]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}

const businessFile = join(webModuleRoot, "config", "business.json");
const business = JSON.parse(readFileSync(businessFile, "utf8"));
business.sync_secret = syncSecret;
writeFileSync(businessFile, `${JSON.stringify(business, null, 2)}\n`);

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
// Neutralize the developer's real connection.local.json so the empty-secret
// case cannot fall back to it. Restored in the finally block below.
const localConnectionPath = join(process.cwd(), "apps", "android-app", "connection.local.json");
const stashedConnectionPath = `${localConnectionPath}.preflight-smoke-bak`;
const hadLocalConnection = existsSync(localConnectionPath);
if (hadLocalConnection) {
  renameSync(localConnectionPath, stashedConnectionPath);
}
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitForUrl(`${baseUrl}/api/menu.php`);

  const baseEnv = {
    ...process.env,
    YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD: "",
    YARDIMCI_ASISTAN_ANDROID_ALLOW_EMBEDDED_SYNC_SECRET: "",
    YARDIMCI_ASISTAN_ANDROID_SKIP_CONNECTION_PREFLIGHT: "",
    YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL: baseUrl,
    YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: ""
  };

  // 1. Correct secret passes and never appears in output.
  const okResult = runPreflight({ ...baseEnv, YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: syncSecret });
  assert.equal(okResult.status, 0, formatOutput(okResult));
  assert.match(formatOutput(okResult), /preflight başarılı/);
  assert.equal(formatOutput(okResult).includes(syncSecret), false, "Secret loglara sızmamalı.");

  // 2. Wrong secret fails with an actionable message and no leak.
  const wrongResult = runPreflight({ ...baseEnv, YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: "stale-bootstrap-secret-12" });
  assert.notEqual(wrongResult.status, 0, "Yanlış anahtar preflight geçmemeli.");
  assert.match(formatOutput(wrongResult), /connection\.local\.json/);
  assert.equal(formatOutput(wrongResult).includes("stale-bootstrap-secret-12"), false, "Secret loglara sızmamalı.");

  // 3. Release builds embed no secret, so preflight stays green.
  const releaseResult = runPreflight({
    ...baseEnv,
    YARDIMCI_ASISTAN_ANDROID_RELEASE_BUILD: "1",
    YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: syncSecret
  });
  assert.equal(releaseResult.status, 0, formatOutput(releaseResult));
  assert.match(formatOutput(releaseResult), /atlandı/);

  // 4. Empty secret also skips without network access.
  const emptyResult = runPreflight(baseEnv);
  assert.equal(emptyResult.status, 0, formatOutput(emptyResult));

  // 5. Unreachable host fails closed unless the explicit opt-out is set.
  const closedEnv = {
    ...baseEnv,
    YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL: "http://127.0.0.1:1",
    YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET: syncSecret
  };
  const closedResult = runPreflight(closedEnv);
  assert.notEqual(closedResult.status, 0, "Erişilemeyen host sessizce geçmemeli.");
  const optOutResult = runPreflight({
    ...closedEnv,
    YARDIMCI_ASISTAN_ANDROID_SKIP_CONNECTION_PREFLIGHT: "1"
  });
  assert.equal(optOutResult.status, 0, formatOutput(optOutResult));
  assert.match(formatOutput(optOutResult), /atlandı/);

  console.log("android-connection-preflight-smoke-ok: match passes, mismatch and offline fail closed");
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
  if (hadLocalConnection) {
    renameSync(stashedConnectionPath, localConnectionPath);
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

function runPreflight(env) {
  return spawnSync(process.execPath, [preflight], {
    cwd: process.cwd(),
    encoding: "utf8",
    env
  });
}

function formatOutput(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // PHP server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}

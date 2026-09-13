import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-web-form-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
const syncSecret = "pilot-web-smoke-secret";
const businessConfigFile = join(webModuleRoot, "config", "business.json");
const businessConfig = JSON.parse(readFileSync(businessConfigFile, "utf8"));
businessConfig.sync_secret = syncSecret;
writeFileSync(businessConfigFile, `${JSON.stringify(businessConfig, null, 2)}\n`);
for (const runtimeFile of [
  "yardimci-asistan.sqlite",
  "yardimci-asistan.sqlite-wal",
  "yardimci-asistan.sqlite-shm"
]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(`${baseUrl}/api/menu.php`);

  const methodResponse = await fetch(`${baseUrl}/api/request.php`);
  assert.equal(methodResponse.status, 405);
  assert.equal((await methodResponse.json()).ok, false);

  const emptyResponse = await postRequest({});
  assert.equal(emptyResponse.status, 422);
  const emptyResult = await emptyResponse.json();
  assert.equal(emptyResult.ok, false);
  assert.ok(emptyResult.errors.some((error) => error.field === "customer_name"));
  assert.ok(emptyResult.errors.some((error) => error.field === "customer_phone"));
  assert.ok(emptyResult.errors.some((error) => error.field === "date_text"));
  assert.ok(emptyResult.errors.some((error) => error.field === "guest_count"));

  const missingPhoneResponse = await postRequest({
    request_type: "pension_reservation",
    customer_name: "Demo Misafir",
    date_text: "18 Temmuz",
    guest_count: 2
  });
  assert.equal(missingPhoneResponse.status, 422);
  const missingPhoneResult = await missingPhoneResponse.json();
  assert.ok(missingPhoneResult.errors.some((error) => error.field === "customer_phone"));

  const wrongPhoneResponse = await postRequest({
    request_type: "pension_reservation",
    customer_name: "Demo Misafir",
    customer_phone: "123",
    date_text: "18 Temmuz",
    guest_count: 2
  });
  assert.equal(wrongPhoneResponse.status, 422);
  const wrongPhoneResult = await wrongPhoneResponse.json();
  assert.ok(wrongPhoneResult.errors.some((error) => error.field === "customer_phone"));

  const pensionResponse = await postRequest({
    request_type: "pension_reservation",
    customer_name: "Demo Aile",
    customer_phone: "0555 111 22 33",
    date_text: "18-20 Temmuz",
    start_date: "2026-07-18",
    end_date: "2026-07-20",
    guest_count: 3,
    adult_count: 2,
    child_count: 1,
    message: "Balkonlu oda ve ek yatak uygun mu?"
  });
  assert.equal(pensionResponse.status, 201);
  const pensionResult = await pensionResponse.json();
  assert.equal(pensionResult.ok, true);
  assert.match(pensionResult.request_id, /^request_/);
  assert.equal(pensionResult.whatsapp_phone, "905551112233");
  assert.match(pensionResult.whatsapp_message, /Pansiyon rezervasyonu/);
  assert.match(pensionResult.whatsapp_message, /Lütfen bilgileri kontrol edip gönder tuşuna basın\./);

  const restaurantResponse = await postRequest({
    request_type: "restaurant_reservation",
    customer_name: "Demo Masa",
    customer_phone: "+90 555 111 22 44",
    date_text: "Bu akşam",
    start_date: "2026-07-18",
    time: "20:00",
    guest_count: 5,
    message: "Bahçede masa rica ediyoruz.",
    whatsapp_message: "Hazır restoran mesajı"
  });
  assert.equal(restaurantResponse.status, 201);
  const restaurantResult = await restaurantResponse.json();
  assert.equal(restaurantResult.ok, true);
  assert.equal(restaurantResult.whatsapp_message, "Hazır restoran mesajı");

  const syncResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({ action: "pull_requests", after_seq: 0, limit: 10 })
  });
  assert.equal(syncResponse.status, 200);
  const syncResult = await syncResponse.json();
  const records = syncResult.requests;
  assert.equal(records.length, 2);
  assert.equal(records[0].request_type, "pension_reservation");
  assert.equal(records[0].customer_phone, "+905551112233");
  assert.equal(records[0].sync_status, "pending");
  assert.equal(records[1].request_type, "restaurant_reservation");
  assert.equal(records[1].time, "20:00");

  for (let index = 0; index < 3; index += 1) {
    const allowedInvalid = await postRequest({});
    assert.equal(allowedInvalid.status, 422, "İlk sekiz POST doğrulama katmanına ulaşabilmeli");
  }
  const limitedResponse = await postRequest({});
  assert.equal(limitedResponse.status, 429, "Aynı istemciden aşırı talep sunucuda sınırlandırılmalı");
  const limitedResult = await limitedResponse.json();
  assert.equal(limitedResult.code, "rate_limited");
  assert.ok(Number(limitedResult.retry_after_seconds) > 0);
  assert.ok(Number(limitedResponse.headers.get("retry-after")) > 0);

  const oversizedResponse = await fetch(`${baseUrl}/api/request.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(70_000) })
  });
  assert.equal(oversizedResponse.status, 413, "Aşırı büyük public payload erken reddedilmeli");
  assert.equal((await oversizedResponse.json()).code, "payload_too_large");

  console.log(`web-form-api-ok: ${records.length} requests saved, abuse and payload guards verified`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

async function postRequest(data) {
  return fetch(`${baseUrl}/api/request.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
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
      // Server is still starting.
    }

    await delay(100);
  }

  throw new Error(`PHP server did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

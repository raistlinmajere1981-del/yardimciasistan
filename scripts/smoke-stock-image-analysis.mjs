import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const secret = "stock-image-smoke-secret-12345";
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-stock-image-"));
const webRoot = join(tempRoot, "web-module");
const uploadRoot = join(tempRoot, "uploads");
cpSync(join(process.cwd(), "firm-template", "web-module"), webRoot, { recursive: true });
mkdirSync(uploadRoot, { recursive: true });
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webRoot, "data", runtimeFile), { force: true });
}
const businessPath = join(webRoot, "config", "business.json");
const business = JSON.parse(readFileSync(businessPath, "utf8"));
business.sync_secret = secret;
writeFileSync(businessPath, `${JSON.stringify(business, null, 2)}\n`);

const providerPort = await freePort();
const providerRequests = [];
const provider = http.createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  providerRequests.push(JSON.parse(body));
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          document: {
            supplier_name: "Smoke Tedarik",
            invoice_number: "INV-42",
            invoice_date: "2026-07-22",
            document_confidence: "high"
          },
          lines: [
            {
              raw_text: "COCA COLA 330 ML 24 AD",
              matched_menu_item_id: "item-cola",
              matched_menu_item_name: "Provider adını değiştiremez",
              suggested_quantity: 24,
              source_quantity_text: "24 AD",
              confidence: "high",
              needs_review_reason: null
            },
            {
              raw_text: "MADEN SUYU 1 KOLI",
              matched_menu_item_id: "item-soda",
              matched_menu_item_name: "Soda",
              suggested_quantity: 999,
              source_quantity_text: "1 KOLI",
              confidence: "medium",
              needs_review_reason: null
            },
            {
              raw_text: "NAKLİYE BEDELİ 2",
              matched_menu_item_id: "invented-item",
              matched_menu_item_name: "İcat edilen ürün",
              suggested_quantity: 2,
              source_quantity_text: "2",
              confidence: "low",
              needs_review_reason: null
            }
          ]
        })
      }
    }]
  }));
});
await listen(provider, providerPort);

const aiLocalPath = join(webRoot, "config", "ai.local.php");
writeAiConfig("openai");
const phpPort = await freePort();
const php = spawn("php", [
  "-d", `upload_tmp_dir=${uploadRoot}`,
  "-d", "upload_max_filesize=12M",
  "-d", "post_max_size=13M",
  "-S", `127.0.0.1:${phpPort}`,
  "-t", webRoot
], { stdio: ["ignore", "pipe", "pipe"] });
let phpOutput = "";
php.stdout.on("data", (chunk) => { phpOutput += chunk.toString(); });
php.stderr.on("data", (chunk) => { phpOutput += chunk.toString(); });
const baseUrl = `http://127.0.0.1:${phpPort}`;

try {
  await waitForUrl(`${baseUrl}/api/stock-image-analysis.php`);
  const candidates = [
    { id: "item-cola", name: "Kola", category: "İçecekler", current_stock: 10 },
    { id: "item-soda", name: "Soda", category: "İçecekler", current_stock: 5 }
  ];
  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

  const missingAuth = await analyze({ bytes: pngBytes, mime: "image/png", candidates, includeAuth: false });
  assert.equal(missingAuth.status, 401);
  assert.equal((await missingAuth.json()).code, "unauthorized");

  const unsupported = await analyze({ bytes: Buffer.from("not an image"), mime: "text/plain", candidates });
  assert.equal(unsupported.status, 415);
  assert.equal((await unsupported.json()).message, "Desteklenmeyen dosya türü.");

  const oversized = await analyze({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1, 0x41), mime: "image/png", candidates });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).message, "Görsel çok büyük.");

  const forbiddenAndroid = await analyze({
    bytes: pngBytes,
    mime: "image/png",
    candidates,
    source: "android",
    deviceId: "android-stock-smoke"
  });
  assert.equal(forbiddenAndroid.status, 403);
  assert.match((await forbiddenAndroid.json()).message, /stok güncelleme yetkisi yok/i);

  const snapshotPublication = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "stock-image-smoke",
      snapshot: {
        summary: {}, daily_tasks: [], requests: [], customers: [], reservations: [], rooms: [], tables: [],
        menu: { categories: [], items: [], updated_at: "2026-07-22T12:00:00+03:00" },
        trackedStockItems: candidates.map((item) => ({
          menu_item_id: item.id,
          name: item.name,
          category: item.category,
          price: 10,
          stock_quantity: item.current_stock,
          stock_min_quantity: 1,
          hide_when_out_of_stock: false,
          stock_status: "in_stock"
        })),
        appliedStockImageHashes: [], table_orders: [], messages: [],
        androidPermissions: {
          "android-stock-smoke": {
            role: "admin",
            is_active: true,
            permissions: ["menu.stock_view", "menu.stock_update"]
          }
        },
        updated_at: "2026-07-22T12:00:00+03:00"
      }
    })
  });
  assert.equal(snapshotPublication.status, 200);
  const androidValid = await analyze({
    bytes: pngBytes,
    mime: "image/png",
    candidates: [...candidates, { id: "client-only-item", name: "İstemci ürünü", category: "Sahte", current_stock: 9 }],
    source: "android",
    deviceId: "android-stock-smoke"
  });
  assert.equal(androidValid.status, 200);
  assert.equal(JSON.stringify(providerRequests[0]).includes("client-only-item"), false, "Android candidates must be intersected with the hosted snapshot");

  const mismatchedHash = await analyze({ bytes: pngBytes, mime: "image/png", candidates, imageHash: "f".repeat(64) });
  assert.equal(mismatchedHash.status, 422);
  assert.equal((await mismatchedHash.json()).code, "image_hash_mismatch");

  const valid = await analyze({ bytes: pngBytes, mime: "image/png", candidates });
  assert.equal(valid.status, 200);
  const payload = await valid.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.image_hash, createHash("sha256").update(pngBytes).digest("hex"));
  assert.equal(payload.analysis.document.supplier_name, "Smoke Tedarik");
  assert.deepEqual(payload.analysis.lines[0], {
    raw_text: "COCA COLA 330 ML 24 AD",
    matched_menu_item_id: "item-cola",
    matched_menu_item_name: "Kola",
    suggested_quantity: 24,
    source_quantity_text: "24 AD",
    confidence: "high",
    needs_review_reason: null
  });
  assert.equal(payload.analysis.lines[1].matched_menu_item_id, "item-soda");
  assert.equal(payload.analysis.lines[1].suggested_quantity, null, "Koli must never be guessed into units");
  assert.match(payload.analysis.lines[1].needs_review_reason, /Koli, paket, kg veya litre/i);
  assert.equal(payload.analysis.lines[2].matched_menu_item_id, null, "Ids outside the candidate allowlist must be removed");
  assert.equal(payload.analysis.lines[2].matched_menu_item_name, null);
  assert.ok(providerRequests.at(-1).messages[1].content.some((part) => part.type === "image_url"));

  writeAiConfig("custom");
  const unsupportedProvider = await analyze({ bytes: pngBytes, mime: "image/png", candidates });
  assert.equal(unsupportedProvider.status, 422);
  assert.equal((await unsupportedProvider.json()).message, "Mevcut AI hizmeti görsel analizini desteklemiyor.");

  await waitFor(() => readdirSync(uploadRoot).length === 0, 2_000);
  assert.deepEqual(readdirSync(uploadRoot), [], "Temporary multipart files must be removed after success and failure");
  console.log("stock-image-analysis-smoke-ok: auth, mime, size, cleanup, allowlist and ambiguity rules verified");
} catch (error) {
  if (phpOutput.trim()) console.error(phpOutput.trim());
  throw error;
} finally {
  php.kill();
  await close(provider);
  rmSync(tempRoot, { recursive: true, force: true });
}

function writeAiConfig(service) {
  writeFileSync(aiLocalPath, `<?php\ndeclare(strict_types=1);\nreturn ${phpExport({
    enabled: true,
    provider: "openai_compatible",
    service,
    base_url: `http://127.0.0.1:${providerPort}/v1`,
    model: "gpt-4o-mini",
    api_key: "mock-provider-key",
    timeout_seconds: 15
  })};\n`);
}

function phpExport(value) {
  return `array (\n${Object.entries(value).map(([key, item]) => `  '${key}' => ${typeof item === "boolean" ? (item ? "true" : "false") : typeof item === "number" ? item : `'${String(item).replaceAll("'", "\\'")}'`},`).join("\n")}\n)`;
}

async function analyze({ bytes, mime, candidates, includeAuth = true, source = "desktop", deviceId = "", imageHash = "" }) {
  const importId = `stock_import_smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const form = new FormData();
  form.append("source", source);
  form.append("device_id", deviceId);
  form.append("import_id", importId);
  form.append("image_hash", imageHash || createHash("sha256").update(bytes).digest("hex"));
  form.append("menu_items", JSON.stringify(candidates));
  form.append("image", new Blob([bytes], { type: mime }), "document.bin");
  return fetch(`${baseUrl}/api/stock-image-analysis.php`, {
    method: "POST",
    headers: includeAuth ? { "X-YA-Sync-Secret": secret } : {},
    body: form
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function waitForUrl(url) {
  await waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.status > 0;
    } catch {
      return false;
    }
  }, 5_000);
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for condition");
}

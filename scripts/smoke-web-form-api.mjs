import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
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
businessConfig.profile_id = "pension_restaurant";
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
    customer_phone: "+44 7911 123456",
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
  assert.equal(restaurantResult.whatsapp_phone, "447911123456");

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
  assert.equal(records[1].customer_phone, "+447911123456");
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

  const php = code => {
    const result=spawnSync('php',['-r',`require $argv[1]; ${code}`,join(webModuleRoot,'lib/public-request-submission.php')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return result.stdout;
  };
  const resetGuard=()=>php('ya_storage_open()->exec("DELETE FROM public_request_guard_events");');
  resetGuard();
  const intent={idempotency_key:'public-request-key-A',request_type:'pension_reservation',customer_name:'Replay Guest',
    customer_phone:'0555 111 22 33',start_date:'2030-07-18',end_date:'2030-07-20',guest_count:2,message:'Quiet room'};
  assert.equal((await postRequest({...intent,idempotency_key:null})).status,422,'key is mandatory');
  await postRequest(intent); // discard successful response (lost response)
  const retry=await (await postRequest(intent)).json();
  const normalized=await (await postRequest({...intent,customer_phone:'+90 (555) 111 22 33',customer_name:'  Replay   Guest ',
    date_text:'different localized display',whatsapp_message:'transport noise',message:'Quiet room\r\n'})).json();
  assert.deepEqual(normalized,retry,'normalized retry returns exact original receipt');
  const conflict=await postRequest({...intent,message:'Different request'});assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).code,'idempotency_conflict');
  resetGuard();
  const concurrent=await Promise.all(Array.from({length:4},async()=>{const r=await postRequest(intent);assert.equal(r.status,201);return r.json();}));
  for(const result of concurrent)assert.deepEqual(result,retry);
  assert.equal(Number(php(`echo ya_storage_open()->query("SELECT COUNT(*) FROM web_requests WHERE id='${retry.request_id}'")->fetchColumn();`)),1);
  const distinct=await (await postRequest({...intent,idempotency_key:'public-request-key-B'})).json();
  assert.notEqual(distinct.request_id,retry.request_id,'new key permits a new logical submission');
  const before=php('echo json_encode([ya_storage_open()->query("SELECT COUNT(*) FROM web_requests")->fetchColumn(),ya_storage_open()->query("SELECT COUNT(*) FROM web_request_submission_receipts")->fetchColumn()]);');
  php(`ya_storage_open()->exec("CREATE TRIGGER fail_request_receipt BEFORE INSERT ON web_request_submission_receipts BEGIN SELECT RAISE(ABORT, 'injected'); END");`);
  assert.equal((await postRequest({...intent,idempotency_key:'public-request-key-rollback'})).status,500);
  assert.equal(php('echo json_encode([ya_storage_open()->query("SELECT COUNT(*) FROM web_requests")->fetchColumn(),ya_storage_open()->query("SELECT COUNT(*) FROM web_request_submission_receipts")->fetchColumn()]);'),before,'queue insert rolls back with failed receipt');
  php('ya_storage_open()->exec("DROP TRIGGER fail_request_receipt");');
  assert.equal((await postRequest({...intent,idempotency_key:'public-request-key-rollback'})).status,201);

  // Separate PHP processes contend for the SQLite write lock, not merely the
  // development HTTP server's single request loop.
  const canonical=JSON.parse(php(`echo ya_storage_open()->query("SELECT payload_json FROM web_requests WHERE id='${retry.request_id}'")->fetchColumn();`));
  const contender=()=>new Promise((resolve,reject)=>{
    const worker=spawn('php',['-r',`require $argv[1]; $r=json_decode($argv[2],true); $r['id']='request_'.bin2hex(random_bytes(16)); echo json_encode(ya_public_request_submit('public-request-concurrent', $r, ['ok'=>true,'request_id'=>$r['id']], ''));`,join(webModuleRoot,'lib/public-request-submission.php'),JSON.stringify(canonical)]);
    let output='',errors='';worker.stdout.on('data',b=>output+=b);worker.stderr.on('data',b=>errors+=b);
    worker.on('error',reject);worker.on('exit',code=>code===0?resolve(JSON.parse(output)):reject(new Error(errors)));
  });
  const workers=await Promise.all([contender(),contender(),contender()]);
  for(const result of workers)assert.deepEqual(result,workers[0]);
  const require=createRequire(import.meta.url),{DesktopDatabase}=require('../apps/desktop-app/dist-electron/database.js');
  const desktop=new DesktopDatabase({appPath:join(process.cwd(),'apps/desktop-app'),userDataPath:join(tempRoot,'desktop')});
  desktop.initialize();assert.equal(desktop.saveInitialSetup(createSmokeSetupInput({businessName:'Request ingress',phone:'',whatsapp:'',webModuleUrl:baseUrl,syncSecret,servicePreferences:{whatsapp:false,android:false}})).ok,true);
  const pull=async()=>{const r=await fetch(`${baseUrl}/api/sync.php`,{method:'POST',headers:{'Content-Type':'application/json','X-YA-Sync-Secret':syncSecret},body:JSON.stringify({action:'pull_requests',after_seq:0,limit:100})});return (await r.json()).requests;};
  const ingress=await pull();assert.equal(ingress.filter(r=>r.id===retry.request_id).length,1);
  const local=new DatabaseSync(desktop.databasePath);
  try {
    desktop.upsertRequests(ingress);
    local.prepare("UPDATE requests SET status='waiting_owner', priority='high', assigned_to='owner', ai_summary='local decision' WHERE id=?").run(retry.request_id);
    desktop.upsertRequests(await pull()); // ack loss / replay
    assert.equal(local.prepare('SELECT COUNT(*) AS n FROM requests WHERE id=?').get(retry.request_id).n,1);
    const row=local.prepare('SELECT status,priority,assigned_to,ai_summary FROM requests WHERE id=?').get(retry.request_id);
    assert.deepEqual({...row},{status:'waiting_owner',priority:'high',assigned_to:'owner',ai_summary:'local decision'});
  } finally {local.close();desktop.close();}

  console.log('web-form-api-ok: guards, normalized exact-receipt retry, conflicts, concurrent writers, transaction rollback and Desktop owner-preserving replay');
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
    body: JSON.stringify({idempotency_key:randomUUID(),...data})
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

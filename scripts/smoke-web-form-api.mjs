import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";
import process from "node:process";

const capabilitiesOnly = process.argv.includes("--capabilities-only");
assert.ok(process.argv.slice(2).every(arg => arg === "--capabilities-only"), "Use --capabilities-only or no arguments");
const fixtureClientId = "web-form-contract-desktop";
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-web-form-"));
const webModuleRoot = join(tempRoot, "web-module");
const moduleSource = join(process.cwd(), "firm-template", "web-module");
cpSync(moduleSource, webModuleRoot, { recursive: true, filter: path => {
  const name = relative(moduleSource, path).replaceAll("\\", "/");
  return (!name.startsWith("data/") && !name.startsWith("media/") && !name.includes(".local."))
    || ["data/.htaccess", "media/.htaccess"].includes(name);
} });
const syncSecret = "pilot-web-smoke-secret";
const businessConfigFile = join(webModuleRoot, "config", "business.json");
const businessConfig = {id: "web-form-fixture", display_name: "Form contract", sync_secret: syncSecret, profile_id: "pension_restaurant", public_surfaces: [], allowed_origins: []};
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

  await activateFixtureSource(baseUrl, syncSecret, fixtureClientId);
  if (capabilitiesOnly) {
    writeFileSync(join(webModuleRoot, "config", "ai.local.php"), "<?php return ['enabled' => false];\n");
    await exerciseCapabilityContracts();
    console.log("web-form-capability-contract-ok: missing publication, shared policy parity, optional reservations, generic requests, chat HTTP/DB OFF/ON/fallback/withdrawal and Desktop clock publication");
  } else {
  await publishSnapshot(["core.customers", "customer.requests", "accommodation.rooms", "accommodation.reservations", "food_service.tables", "food_service.reservations"]);
  const emptyResponse = await postRequest({request_type: "breakfast_request"});
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
  }
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

async function publish(body) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify(publicationEnvelope(body, fixtureClientId))
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

async function publishSnapshot(capabilities) {
  return publish({ action: "publish_android_snapshot", snapshot: { business_capabilities: capabilities } });
}

async function exerciseCapabilityContracts() {
  // Compile only the existing policy, public producer and HTTP transport into a
  // disposable fixture. This mode never invokes a Desktop/demo build or provider.
  const sourceOutput = join(tempRoot, "desktop-public-contract");
  mkdirSync(sourceOutput);
  const sourceFiles = ["business-capabilities", "business-public-profile", "business-ai-policy", "business-ai-context", "capability-policy"];
  for (const name of sourceFiles) {
    const source = readFileSync(`packages/shared/types/${name}.ts`, "utf8");
    writeFileSync(join(sourceOutput, `${name}.js`), ts.transpileModule(source, {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
    }).outputText);
  }
  writeFileSync(join(sourceOutput, "hosting-transport.js"), ts.transpileModule(readFileSync("packages/sync-core/hosting-transport.ts", "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText);
  const requireSource = createRequire(import.meta.url);
  const canonical = {...requireSource(join(sourceOutput, "capability-policy.js")), ...requireSource(join(sourceOutput, "business-ai-context.js")),
    ...requireSource(join(sourceOutput, "hosting-transport.js"))};
  const php = code => {
    const result = spawnSync("php", ["-r", `require $argv[1]; ${code}`, join(webModuleRoot, "lib/public-request-policy.php")], {encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const clearGuard = () => php('if (ya_storage_open()->query("SELECT name FROM sqlite_master WHERE name = \'public_request_guard_events\'")->fetchColumn()) ya_storage_open()->exec("DELETE FROM public_request_guard_events");');
  const countRequests = () => Number(php('echo ya_storage_open()->query("SELECT COUNT(*) FROM web_requests")->fetchColumn();'));
  const publicBusiness = async () => (await (await fetch(`${baseUrl}/api/business.php`)).json()).business;
  const requirements = JSON.parse(php('echo json_encode(ya_public_request_type_requirements());'));
  for (const [type, requirement] of Object.entries(requirements)) {
    assert.equal(requirement, canonical.getRequestTypeRequiredCapability(type), `${type} must retain the shared policy requirement`);
  }
  const makeRequest = type => ({ request_type: type, customer_name: "Synthetic request", customer_phone: "+44 7911 123456", guest_count: 1,
    message: "Synthetic question", ...(type === "pension_reservation" ? { start_date: "2030-07-18", end_date: "2030-07-20" } : {}),
    ...(type === "restaurant_reservation" ? { start_date: "2030-07-18", time: "18:30" } : {}),
    ...(type === "breakfast_request" ? { date_text: "2030-07-18" } : {}) });
  let contextRevision = 0;
  const publishContext = async (caps, overrides = {}) => {
    const context = canonical.createBusinessAiContext({ businessName: "Synthetic business", profileId: "pension_restaurant",
      phone: "", whatsapp: "+44 7911 123456", email: "", address: "", enabledCapabilities: caps,
      publicProfile: { mapDisplayMode: "manual", googleMapsEmbedUrl: "", latitude: null, longitude: null, description: "", aboutText: "",
        directionsNote: "", policyNote: "", paymentNote: "", languages: [], features: [], socialLinks: [],
        checkInTime: "14:10", checkOutTime: "11:20", breakfastStartTime: "07:30", breakfastEndTime: "10:40" } });
    Object.assign(context, overrides);
    contextRevision++;
    const result = await canonical.pushBusinessContext({ baseUrl, syncSecret, clientId: fixtureClientId, sourceEpoch: 1,
      sourceRevision: contextRevision, idempotencyKey: `web-form-context-${contextRevision}`, context });
    assert.equal(result.ok, true, result.message);
    return context;
  };
  for (const profileId of ["pension_restaurant", "pension", "restaurant", "market"]) {
    await publishContext([], { profileId });
    const business = await publicBusiness();
    assert.equal(business.requests_enabled, false, `Missing publication must not grant requests for ${profileId}`);
    assert.equal(business.ai_enabled, false);
    assert.equal(business.whatsapp_enabled, false);
    assert.deepEqual(business.request_types, []);
    const response = await postRequest(makeRequest("general_info"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "requests_disabled");
  }
  assert.equal(countRequests(), 0, "Missing capability publication cannot enqueue requests");
  assert.deepEqual((await publicBusiness()).public_surfaces, [], "A profile never grants an unpublished surface");

  await publishSnapshot(["core.customers", "customer.requests", "accommodation.rooms", "accommodation.reservations", "food_service.tables", "food_service.reservations"]);
  businessConfig.public_surfaces = ["accommodation", "rooms", "food_service", "restaurant", "tables", "menu", "qr_menu", "store", "catalog", "online_sales"];
  writeFileSync(businessConfigFile, JSON.stringify(businessConfig));
  await publish({action: "publish_room_catalog", room_catalog: {enabled: true, rooms: [{id: "fixture-room", name: "Published room"}]}});
  await publish({action: "publish_table_catalog", table_catalog: {enabled: true, tables: [{id: "fixture-table", name: "Published table"}]}});
  assert.deepEqual((await publicBusiness()).public_surfaces, ["rooms", "restaurant"]);
  await publish({action: "publish_room_catalog", room_catalog: {enabled: false, rooms: [{id: "fixture-room", name: "Stale room"}]}});
  await publish({action: "publish_table_catalog", table_catalog: {enabled: false, tables: [{id: "fixture-table", name: "Stale table"}]}});
  const withdrawnSurfaces = await publicBusiness();
  assert.deepEqual(withdrawnSurfaces.public_surfaces, [], "Legacy aliases from config cannot restore withdrawn publications");
  assert.ok(withdrawnSurfaces.request_types.includes("pension_reservation"), "Surface withdrawal does not invent a capability withdrawal");
  businessConfig.public_surfaces = [];
  writeFileSync(businessConfigFile, JSON.stringify(businessConfig));

  const generic = ["core.customers", "customer.requests"];
  const cases = [[], ["customer.requests"], generic, [...generic, "service.ai"],
    [...generic, "accommodation.rooms", "food_service.tables"],
    [...generic, "accommodation.rooms", "accommodation.reservations"],
    [...generic, "food_service.tables", "food_service.reservations", "channel.qr_menu"],
    [...generic, "commerce.wholesale"]];
  for (const caps of cases) {
    await publishSnapshot(caps);
    const business = await publicBusiness();
    const allowedTypes = Object.keys(requirements).filter(type => type !== "dealer_application" && canonical.isRequestTypeAvailable(caps, type));
    assert.deepEqual([...business.request_types].sort(), allowedTypes.sort());
    assert.equal(business.requests_enabled, canonical.isRequestTypeAvailable(caps, "general_info"));
    assert.equal(business.ai_enabled, caps.includes("service.ai"));
    const chat = await fetch(`${baseUrl}/api/chat.php`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({message: ""})});
    assert.equal(chat.status, caps.includes("service.ai") ? 422 : 403, "Chat entry uses the independent AI capability before any provider call");
    for (const type of Object.keys(requirements)) {
      clearGuard();
      const before = countRequests();
      const response = await postRequest(makeRequest(type));
      const result = await response.json();
      const allowed = allowedTypes.includes(type);
      assert.equal(response.status, allowed ? 201 : 403, `${type}: ${JSON.stringify(caps)} ${JSON.stringify(result)}`);
      assert.equal(countRequests(), before + (allowed ? 1 : 0), "Denied mutation must not write a request");
    }
  }

  const chatRequest = async (type, allowed, expectedType = type) => {
    clearGuard();
    const before = countRequests();
    const response = await fetch(`${baseUrl}/api/chat.php`, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: "Sentetik bilgi sorusu", create_request: true, request_type: type,
        customer_name: "Synthetic chat", customer_phone: "0555 111 22 33"})});
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.ok, true);
    assert.ok(result.answer.length > 0, "AI conversation remains available independently of request permission");
    assert.equal(result.request_created, allowed, `${type}: ${JSON.stringify(result)}`);
    assert.equal(countRequests(), before + (allowed ? 1 : 0), "Denied Chat intent must enqueue zero new requests, including general_info fallbacks");
    const conversation = JSON.parse(readFileSync(join(webModuleRoot, "data/ai-conversations.json"), "utf8")).at(-1);
    assert.equal(conversation.id, result.conversation_id);
    assert.equal(conversation.request_id, result.request_id);
    if (allowed) {
      const saved = JSON.parse(php(`echo json_encode(ya_storage_get_request(${JSON.stringify(result.request_id)}));`));
      assert.equal(saved.request_type, expectedType);
      assert.equal(saved.source, "web_ai");
    } else {
      assert.equal(result.request_id, "");
      assert.notEqual(conversation.status, "converted_to_request");
    }
  };
  for (const caps of [["service.ai"], ["service.ai", "customer.requests"], ["service.ai", "core.customers"]]) {
    await publishSnapshot(caps);
    await publishContext(caps);
    assert.deepEqual((await publicBusiness()).request_types, []);
    await chatRequest("general_info", false);
  }
  for (const [type, domain, reservation] of [
    ["pension_reservation", "accommodation.rooms", "accommodation.reservations"],
    ["restaurant_reservation", "food_service.tables", "food_service.reservations"]
  ]) {
    const off = [...generic, "service.ai", domain];
    await publishContext(off);
    await publishSnapshot(off);
    assert.ok(!(await publicBusiness()).request_types.includes(type));
    await chatRequest(type, false); // Talking about the domain remains allowed.
    await publishContext([...off, reservation]);
    await publishSnapshot([...off, reservation]);
    assert.ok((await publicBusiness()).request_types.includes(type));
    await chatRequest(type, true);
    await publishSnapshot(off); // Leave the AI context stale and withdraw only persisted runtime permission.
    await chatRequest(type, false);
  }
  await publishContext(["service.ai"]); // Unsupported room intent would be downgraded to general_info by AI policy.
  await publishSnapshot(["service.ai"]);
  await chatRequest("pension_reservation", false);
  await chatRequest("unsupported_type", false);
  await publishContext([...generic, "service.ai"]);
  await publishSnapshot([...generic, "service.ai"]);
  await chatRequest("pension_reservation", false, "general_info"); // Global ON cannot rescue a denied reservation through fallback.
  await chatRequest("general_info", true);
  await chatRequest("unsupported_type", true, "general_info");
  await publishSnapshot(["service.ai"]);
  await chatRequest("general_info", false);

  await publishSnapshot([...generic, "accommodation.rooms", "service.whatsapp"]);
  const context = await publishContext([...generic, "accommodation.rooms", "service.whatsapp"]);
  const business = await publicBusiness();
  const clockFields = { check_in_time: "checkInTime", check_out_time: "checkOutTime", breakfast_start_time: "breakfastStartTime", breakfast_end_time: "breakfastEndTime" };
  for (const [publicField, desktopField] of Object.entries(clockFields)) assert.equal(business[publicField], context[desktopField]);
  assert.equal(business.whatsapp_enabled, true);
  assert.equal(business.ai_enabled, false, "Requests/WhatsApp do not require AI");

  // Runtime withdrawal must suppress stale published contact and room clocks.
  await publishSnapshot([]);
  const withdrawn = await publicBusiness();
  assert.deepEqual(withdrawn.request_types, []);
  assert.equal(withdrawn.whatsapp_enabled, false);
  for (const field of Object.keys(clockFields)) assert.equal(withdrawn[field], "");
  assert.equal((await postRequest(makeRequest("general_info"))).status, 403);
  await publishSnapshot([...generic, "accommodation.rooms"]);
  await publishContext([...generic, "accommodation.rooms"], {checkInTime: "", checkOutTime: "", breakfastStartTime: "", breakfastEndTime: ""});
  const empty = await publicBusiness();
  for (const field of Object.keys(clockFields)) assert.equal(empty[field], "");
  await publishContext([...generic, "accommodation.rooms"], {checkInTime: "99:99", checkOutTime: "24:10"});
  const invalid = await publicBusiness();
  assert.equal(invalid.check_in_time, ""); assert.equal(invalid.check_out_time, "");
  await publishSnapshot([...generic, "service.whatsapp"]);
  await publishContext([...generic, "service.whatsapp"], {whatsappEnabled: false});
  assert.equal((await publicBusiness()).whatsapp_enabled, false, "Capability alone cannot override the published contact preference");
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

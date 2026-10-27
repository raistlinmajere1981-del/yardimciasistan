import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

// Runs only Hosting PHP/current SQLite schema; no Desktop build or external provider.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'ya-account-receipt-'));
const hosting = join(root, 'module');
const env = {...process.env};
for (const key of Object.keys(env)) if (key.startsWith('YA_ACCOUNT_')) delete env[key];
let server;
try {
  cpSync(join(repo, 'firm-template/web-module'), hosting, {recursive: true, filter: path => !/(?:^|\/)(?:data|vendor|node_modules)(?:\/|$)/.test(path) && !/(?:^|\/)config\/[^/]*\.local\.[^/]+$/.test(path)});
  const helper = join(root, 'fixture.php');
  writeFileSync(helper, `<?php
require $argv[1] . '/lib/customer-account.php';
$db = ya_storage_open();
$accountA = '11111111-1111-4111-8111-111111111111';
$accountB = '22222222-2222-4222-8222-222222222222';
$access = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$action = $argv[2];
if ($action === 'seed') {
  $now = time();
  foreach (['A' => $accountA, 'B' => $accountB] as $label => $id) {
    $db->prepare('INSERT INTO customer_accounts (id,email,full_name,email_verified,created_at) VALUES (?,?,?,1,?)')->execute([$id, strtolower($label).'@example.test', 'Fixture '.$label, $now]);
    $db->prepare('INSERT INTO customer_account_sessions VALUES (?,?,?,1,?,?,?,?,0)')->execute([hash('sha256',str_repeat($label,43)), hash('sha256',str_repeat(strtolower($label),43)), $id, 'web', $now, $now+3600, $now+7200]);
  }
  $db->prepare('INSERT INTO dealer_access VALUES (?,?,?, ?,1,1,1,1)')->execute([$access, 'fixture-ref-a', $accountA, 'Fixture A']);
  $publication = ['version'=>3, 'online_sales_enabled'=>true];
  $db->prepare('INSERT INTO publications VALUES (?, ?,1,?,1,1,?,?)')->execute(['dealer_access_private','fixture',hash('sha256',json_encode($publication)),json_encode($publication),date(DATE_ATOM)]);
  foreach ([['customer',$accountA,'retail_receipt_key_A_123','retail-a'], ['dealer',$access,'dealer_receipt_key_A_123','dealer-a'], ['customer',$accountB,'retail_receipt_key_B_123','retail-b']] as [$kind,$owner,$key,$id]) {
    $response = ['ok'=>true,'order_id'=>$id,'accepted_at'=>date(DATE_ATOM),'quoted_total'=>42.50,'currency'=>'TRY'];
    ya_storage_insert_web_order_submission_receipt(hash('sha256',$kind.':'.$owner.':'.$key),hash('sha256','fixture-'.$id),$response);
    ya_storage_enqueue_web_order(['id'=>$id,'kind'=>$kind,'accountId'=>$owner,'dealerAccessId'=>$owner,'accessRevision'=>1,'buyer'=>['name'=>'Fixture','phone'=>'5550000000'],'items'=>[['productId'=>'fixture-product','quantity'=>1]],'delivery'=>['method'=>'pickup'],'createdAt'=>$response['accepted_at']]);
  }
} elseif ($action === 'demote') {
  $db->exec('UPDATE dealer_access SET enabled = 0');
} elseif ($action === 'unbind') {
  $db->exec('DELETE FROM dealer_access');
} elseif ($action === 'disable' || $action === 'enable') {
  $publication = ['version'=>3,'online_sales_enabled'=>$action === 'enable'];
  $db->prepare('UPDATE publications SET payload_json = ? WHERE name = ?')->execute([json_encode($publication),'dealer_access_private']);
} elseif ($action !== 'snapshot') throw new RuntimeException('invalid_fixture_action');
$result = [];
foreach (['web_orders','web_order_submission_receipts','customer_accounts','customer_account_sessions'] as $table) $result[$table] = $db->query('SELECT * FROM '.$table.' ORDER BY 1')->fetchAll();
echo json_encode($result, JSON_THROW_ON_ERROR);
`);
  function fixture(action) {
    const result = spawnSync('php', [helper, hosting, action], {encoding: 'utf8', env});
    assert.equal(result.status, 0, `Fixture ${action}: ${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  const original = fixture('seed');
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  env.YA_ACCOUNT_SITE_URL = `${origin}/account/`;
  env.YA_ACCOUNT_MODULE_URL = origin;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', hosting], {env, stdio: ['ignore', 'ignore', 'pipe']});
  let logs = '';
  server.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-4000); });
  server.on('error', error => { logs += error.message; });
  let started = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`${origin}/api/account/config.php`, {signal: AbortSignal.timeout(500)}); if (response.ok) { started = true; break; } } catch {}
    await delay(50);
  }
  assert.ok(started, `PHP fixture failed to start: ${logs}`);
  async function request({account = 'A', key = 'retail_receipt_key_A_123', body, headers = {}, method = 'POST'} = {}) {
    const response = await fetch(`${origin}/api/account/receipt.php`, {method, headers: {'Content-Type': 'application/json', 'X-YA-Account': '1', Origin: origin, ...(account ? {Cookie: `ya_account_session=${account.repeat(43)}`} : {}), ...headers}, ...(method === 'GET' ? {} : {body: JSON.stringify(body === undefined ? {idempotencyKey: key} : body)})});
    return {status: response.status, value: await response.json()};
  }
  async function reject(options, status, code) {
    const result = await request(options); assert.equal(result.status, status); assert.equal(result.value.code, code);
  }
  await reject({account: null}, 401, 'login_required');
  await reject({account: 'Z'}, 401, 'login_required');
  await reject({method: 'GET'}, 405, 'post_required');
  await reject({headers: {'X-YA-Account': ''}}, 403, 'csrf_failed');
  await reject({headers: {Origin: 'https://foreign.example'}}, 403, 'csrf_failed');
  await reject({headers: {'Sec-Fetch-Site': 'cross-site'}}, 403, 'csrf_failed');
  await reject({headers: {'Content-Type': 'text/plain'}}, 403, 'csrf_failed');
  await reject({body: {}}, 422, 'invalid_idempotency_key');
  for (const key of ['short', 'x'.repeat(129), 'invalid/key_123456789', 123]) await reject({key}, 422, 'invalid_idempotency_key');
  const retail = await request(); assert.equal(retail.status, 200); assert.equal(retail.value.receipt.order_id, 'retail-a');
  const dealer = await request({key: 'dealer_receipt_key_A_123'}); assert.equal(dealer.status, 200); assert.equal(dealer.value.receipt.order_id, 'dealer-a');
  const ownB = await request({account: 'B', key: 'retail_receipt_key_B_123'}); assert.equal(ownB.value.receipt.order_id, 'retail-b');
  for (const key of ['retail_receipt_key_A_123', 'dealer_receipt_key_A_123']) {
    const foreign = await request({account: 'B', key, body: {idempotencyKey: key, accountId: '11111111-1111-4111-8111-111111111111', dealerAccessId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});
    assert.equal(foreign.status, 200); assert.equal(foreign.value.receipt, null);
  }
  assert.equal((await request({key: 'retail_receipt_key_B_123'})).value.receipt, null);
  assert.equal((await request({key: 'unknown_receipt_key_123'})).value.receipt, null);
  fixture('demote');
  const session = await fetch(`${origin}/api/account/session.php`, {headers: {Cookie: `ya_account_session=${'A'.repeat(43)}`}});
  assert.equal(session.status, 200); assert.equal((await session.json()).account.dealer, null);
  assert.equal((await request({key: 'dealer_receipt_key_A_123'})).value.receipt.order_id, 'dealer-a');
  fixture('disable'); await reject({}, 403, 'online_sales_disabled'); fixture('enable');
  fixture('unbind');
  assert.equal((await request({key: 'dealer_receipt_key_A_123'})).value.receipt, null);
  assert.equal((await request()).value.receipt.order_id, 'retail-a');
  // Receipt recovery must leave accepted intake, receipts, credentials and sessions intact.
  assert.deepEqual(fixture('snapshot'), original);
  console.log('PASS account order receipt: real PHP/SQLite auth, CSRF, ownership, demotion, capability, missing binding and read-only recovery.');
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM'); await exited;
  }
  rmSync(root, {recursive: true, force: true});
}

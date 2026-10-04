import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
const root = mkdtempSync(join(tmpdir(), 'messaging-webhook-'));
mkdirSync(join(root, 'api')); mkdirSync(join(root, 'lib')); mkdirSync(join(root, 'config'));
for (const file of ['api/whatsapp-webhook.php','api/business-messaging-status.php','lib/business-messaging.php','lib/storage.php']) cpSync(join(process.cwd(), 'firm-template/web-module', file), join(root, file));
const syncSecret = 'sync-fixture-private', appSecret = 'app-fixture-private', verifyToken = 'verify-fixture-private';
writeFileSync(join(root, 'config/business.json'), JSON.stringify({ sync_secret: syncSecret }));
const port = await new Promise((resolve, reject) => { const socket = http.createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: ['ignore','ignore','ignore'], env: { ...process.env, YA_WHATSAPP_VERIFY_TOKEN: verifyToken, YA_WHATSAPP_APP_SECRET: appSecret } });
const url = `http://127.0.0.1:${port}/api/whatsapp-webhook.php`;
const accountKey = createHash('sha256').update('1001:2002').digest('hex');
const queueUrl = `http://127.0.0.1:${port}/api/business-messaging-status.php?account_key=${accountKey}`;
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1001', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '2002' }, statuses: [{ id: 'wamid.fixture', status: 'delivered', timestamp: String(Math.floor(Date.now()/1000)), recipient_id: '905550000000' }], messages: [{ text: { body: 'INBOUND_PRIVATE' } }] } }] }] });
const signature = (value) => `sha256=${createHmac('sha256', appSecret).update(value).digest('hex')}`;
const post = (value, sig = signature(value)) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: value });
try {
  for (let attempt = 0;; attempt++) { try { if ((await fetch(url)).status === 403) break; } catch {} if (attempt > 100) throw new Error('PHP startup failed'); await new Promise((resolve) => setTimeout(resolve, 30)); }
  const challenge = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=98765`); assert.equal(challenge.status, 200); assert.equal(await challenge.text(), '98765');
  assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=98765`)).status, 403);
  assert.equal((await fetch(url, { method: 'PUT' })).status, 405);
  assert.equal((await post(body, 'sha256='+'0'.repeat(64))).status, 401);
  assert.equal((await post('{broken')).status, 400);
  assert.equal((await post('x'.repeat(1048577))).status, 413);
  assert.equal((await post(body)).status, 200); assert.equal((await post(body)).status, 200);
  assert.equal((await fetch(queueUrl, { method: 'POST', headers: { 'X-YA-Sync-Secret': syncSecret }, body: JSON.stringify({ ack: ['invalid'] }) })).status, 400);
  assert.equal((await fetch(queueUrl)).status, 401);
  const pull = await fetch(queueUrl, { headers: { 'X-YA-Sync-Secret': syncSecret } }); assert.equal(pull.status, 200);
  const payload = await pull.json(); assert.equal(payload.statuses.length, 1); assert.equal(payload.statuses[0].status, 'delivered');
  assert.ok(!JSON.stringify(payload).includes('905550000000')); assert.ok(!JSON.stringify(payload).includes('INBOUND_PRIVATE'));
  assert.equal((await fetch(queueUrl, { method: 'POST', headers: { 'X-YA-Sync-Secret': syncSecret }, body: JSON.stringify({ ack: [payload.statuses[0].seq] }) })).status, 200);
  assert.equal((await post(body)).status, 200); assert.equal((await (await fetch(queueUrl, { headers: { 'X-YA-Sync-Secret': syncSecret } })).json()).statuses.length, 0);
  const storage = spawnSync('php', ['-r', "require $argv[1]; echo ya_storage_open()->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();", join(root, 'lib/storage.php')], { encoding: 'utf8' }); assert.equal(storage.status, 0); assert.equal(storage.stdout, '0');
  console.log('Business messaging live local hosting endpoints: verification, signature rejection, bounds, authenticated pull/ACK and independent order queue passed.');
} finally { server.kill(); await new Promise((resolve) => server.once('exit', resolve)); rmSync(root, { recursive: true, force: true }); }

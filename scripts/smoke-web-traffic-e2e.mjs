import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from '@playwright/test';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';

const host = 'shop.example';
const root = mkdtempSync(join(tmpdir(), 'ya-traffic-e2e-'));
const moduleDir = join(root, 'web-module');
const dataFile = join(moduleDir, 'data', 'yardimci-asistan.sqlite');
const configFile = join(moduleDir, 'config', 'business.json');
const processes = [];
let browser;
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));

async function freePort() {
  const probe = createServer();
  await new Promise(done => probe.listen(0, '127.0.0.1', done));
  const value = probe.address().port;
  await new Promise(done => probe.close(done));
  return value;
}

function writeConfig(trafficEnabled) {
  writeFileSync(configFile, JSON.stringify({
    id: 'fixture', name: 'Fixture', display_name: 'Fixture', profile_id: 'market',
    sync_secret: 'fixture-sync-secret', allowed_origins: [],
    ...(trafficEnabled === undefined ? {} : {traffic_enabled: trafficEnabled})
  }, null, 2));
}

async function startPhp(port) {
  const server = spawn('php', ['-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-S', `127.0.0.1:${port}`, '-t', root], {stdio: 'ignore'});
  processes.push(server);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/web-module/api/traffic.php`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      if (response.status > 0) return;
    } catch {}
    if (server.exitCode !== null) throw new Error('PHP server exited');
    await pause(25);
  }
  throw new Error('PHP server startup timed out');
}

function rows(database, sql) {
  return database.prepare(sql).all();
}

try {
  mkdirSync(join(root, 'assets'), {recursive: true});
  cpSync(resolve('firm-template/web-module'), moduleDir, {recursive: true});
  cpSync(resolve('web-site-template/public/assets/core/traffic.mjs'), join(root, 'assets', 'traffic.mjs'));
  writeFileSync(join(root, 'index.html'), `<!doctype html><html><head><title>Traffic fixture</title></head><body>
<h1 id="fixture-title">ready</h1>
<script type="module">
  import {bootTraffic} from '/assets/traffic.mjs';
  window.trafficStarted = bootTraffic({apiBasePath: '/web-module', features: {traffic: true}});
</script></body></html>`);
  writeConfig();

  const port = await freePort();
  await startPhp(port);
  const origin = `http://${host}:${port}`;
  browser = await launchChromiumForSmoke(chromium, {
    headless: true,
    args: [`--host-resolver-rules=MAP ${host} 127.0.0.1`, '--no-proxy-server']
  });
  // This fixture deliberately simulates an ordinary browser. Browser automation and
  // headless user agents are filtered by the production tracker/server.
  const page = await browser.newPage({userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'});
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', {get: () => false}));
  const captured = [];
  page.on('request', request => {
    if (request.url().endsWith('/web-module/api/traffic.php') && request.method() === 'POST') captured.push(request.postDataJSON());
  });
  await page.goto(`${origin}/?page=menu&category=cat_1&utm_source=private`);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(() => window.trafficStarted), true, 'site boot starts one beacon');
  assert.equal(captured.length, 1, 'one same-origin page view beacon');
  assert.equal(captured[0].page, 'menu');
  assert.equal(captured[0].item, 'cat_1');
  assert.equal(JSON.stringify(captured[0]).includes('private'), false, 'full query is never sent');

  // Same idempotency key retried by the browser must not create a second view.
  const replay = await page.evaluate(async ([url, body]) => {
    const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
    return {status: response.status, text: await response.text()};
  }, [`${origin}/web-module/api/traffic.php`, JSON.stringify(captured[0])]);
  assert.equal(replay.status, 204);

  const snapshot = async (days, secret = 'fixture-sync-secret') => {
    const response = await fetch(`http://127.0.0.1:${port}/web-module/api/sync.php`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(secret ? {'X-YA-Sync-Secret': secret} : {})},
      body: JSON.stringify({action: 'traffic_snapshot', days})
    });
    return {status: response.status, body: await response.json()};
  };
  const authorized = await snapshot(7);
  assert.equal(authorized.status, 200, 'authorized snapshot');
  assert.equal(authorized.body.enabled, true);
  assert.equal(authorized.body.sessions, 1, 'duplicate retry is counted once');
  assert.equal(authorized.body.views, 1);
  assert.ok(authorized.body.daily.some(day => day.views === 1));
  assert.deepEqual(authorized.body.conversions, {requests: 0, orders: 0});
  const thirty = await snapshot(30);
  assert.equal(thirty.status, 200);
  assert.equal(thirty.body.days, 30);
  const unauthorized = await snapshot(7, '');
  assert.equal(unauthorized.status, 401, 'snapshot requires sync secret');

  const sqlite = new DatabaseSync(dataFile);
  sqlite.exec("INSERT INTO traffic_daily (day, views, intents, created_at, updated_at) VALUES ('2020-01-01', 9, 9, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')");
  sqlite.close();
  const freshView = {...captured[0], session: 'session_retention_1', id: 'event_retention_1'};
  await page.evaluate(async ([url, body]) => {
    await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  }, [`${origin}/web-module/api/traffic.php`, JSON.stringify(freshView)]);
  const afterRetention = new DatabaseSync(dataFile);
  assert.equal(rows(afterRetention, "SELECT COUNT(*) AS count FROM traffic_daily WHERE day = '2020-01-01'")[0].count, 0, '90-day retention prunes old daily rows');
  const allTrafficText = JSON.stringify([
    ...rows(afterRetention, 'SELECT * FROM traffic_daily'),
    ...rows(afterRetention, 'SELECT * FROM traffic_pages'),
    ...rows(afterRetention, 'SELECT * FROM traffic_sources'),
    ...rows(afterRetention, 'SELECT * FROM traffic_sessions')
  ]);
  for (const forbidden of ['shop.example', '127.0.0.1', 'utm_source', 'private', '@', 'http://', 'https://']) {
    assert.equal(allTrafficText.includes(forbidden), false, `raw ${forbidden} must not be stored`);
  }
  assert.equal(rows(afterRetention, 'SELECT COUNT(*) AS count FROM traffic_events')[0].count > 0, true, 'dedupe keys are hashes only');
  afterRetention.close();

  // JavaScript failure never breaks the page or throws into site boot.
  const failure = await page.evaluate(async () => {
    const {startTraffic} = await import('/assets/traffic.mjs');
    let threw = false, started = false;
    try {
      started = startTraffic({features: {traffic: true}}, {fetch: () => { throw new Error('offline'); }});
    } catch { threw = true; }
    return {started, threw, title: document.title};
  });
  assert.deepEqual(failure, {started: true, threw: false, title: 'Traffic fixture'});

  // Operator setting off: the endpoint silently records nothing.
  writeConfig(false);
  const beforeDisabled = (await snapshot(7)).body;
  await page.reload();
  await page.waitForLoadState('networkidle');
  await pause(150);
  const disabled = await snapshot(7);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.enabled, false, 'snapshot exposes the disabled setting');
  assert.equal(disabled.body.views, beforeDisabled.views, 'disabled collection writes no new view');

  // Published business context is authoritative over the static config.
  writeConfig(true);
  const publication = new DatabaseSync(dataFile);
  publication.prepare(`INSERT INTO publications (name, source_client_id, source_epoch, payload_hash, source_revision, server_revision, payload_json, updated_at)
    VALUES ('business_context', 'fixture-client', 1, 'hash', 1, 1, ?, '2026-11-02T00:00:00Z')
    ON CONFLICT(name) DO UPDATE SET payload_json = excluded.payload_json`)
    .run(JSON.stringify({traffic_enabled: false, features: []}));
  publication.close();
  const publishedOff = await snapshot(7);
  assert.equal(publishedOff.body.enabled, false, 'publication traffic_enabled false controls the report');
  const disabledView = await page.evaluate(async ([url, body]) => (await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body})).status,
    [`${origin}/web-module/api/traffic.php`, JSON.stringify({...captured[0], session: 'session_published_off', id: 'event_published_off'})]);
  assert.equal(disabledView, 204, 'disabled endpoint stays a silent no-op');

  console.log('web-traffic-e2e-ok: same-origin view once, retry dedupe, 401, 7/30, retention, disabled, publication switch, no raw PII, JS failure isolation');
} finally {
  await browser?.close().catch(() => {});
  for (const process of processes) process.kill('SIGTERM');
  rmSync(root, {recursive: true, force: true});
}

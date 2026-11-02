import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { probeUrl, getLiveWebVersion } = require('../apps/admin-control-center/dist-electron/electron/services/overview-service.js');

async function mockFetch(implementation, testBody) {
  const before = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => { calls++; return implementation(calls, ...args); };
  try { await testBody(() => calls); }
  finally { globalThis.fetch = before; }
}

test('admin first opening retries a transient connection failure and reports a healthy site', async () => {
  await mockFetch(count => count === 1 ? Promise.reject(new TypeError('cold TLS')) : new Response('ok', { status: 200 }), async calls => {
    const result = await probeUrl('https://blacksea.example.test');
    assert.equal(result.status, 'ready');
    assert.equal(result.detail, 'HTTP 200');
    assert.equal(calls(), 2);
  });
});

test('admin first opening retries a transient version request failure', async () => {
  await mockFetch(count => count === 1 ? Promise.reject(new TypeError('connection reset')) :
    new Response(JSON.stringify({ok:true,web_module_version:'2.2.0'}),{status:200}), async calls => {
      const {version,check} = await getLiveWebVersion('https://blacksea.example.test/api/version.php','2.2.0');
      assert.equal(version,'2.2.0');
      assert.equal(check.status,'ready');
      assert.equal(calls(),2);
    });
});

test('HTTP 503 is a real failure and never disguised as a transient success', async () => {
  await mockFetch(() => new Response('unavailable',{status:503}), async calls => {
    const result = await probeUrl('https://blacksea.example.test');
    assert.equal(result.status,'error');
    assert.equal(result.detail,'HTTP 503');
    assert.equal(calls(),1);
  });
});

test('permanent connectivity failure remains an error after bounded retry', async () => {
  await mockFetch(() => Promise.reject(new TypeError('offline')),async calls => {
    const result = await probeUrl('https://blacksea.example.test');
    assert.equal(result.status,'error');
    assert.match(result.detail,/offline/);
    assert.equal(calls(),2);
  });
});

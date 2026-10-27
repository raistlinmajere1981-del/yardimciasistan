import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source = await readFile(new URL('../../web-site-template/public/assets/core/account-session.js', import.meta.url), 'utf8');
const account = dealer => ({id: 'a', fullName: 'A', email: 'a@example.test', methods: ['password'], dealer});
function fixture(fetcher, values = new Map()) {
  const events = {}, documentEvents = {};
  const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const document = {hidden: false, getElementById: () => null, addEventListener: (key, fn) => documentEvents[key] = fn};
  const context = {document, navigator: {onLine: true}, location: {origin: 'https://test.example'}, URL, AbortSignal, crypto: {randomUUID: () => 'nonce'}, sessionStorage: storage, localStorage: storage, setInterval() {}, fetch: fetcher};
  context.window = {...context, addEventListener: (key, fn) => events[key] = fn};
  vm.runInNewContext(source, context);
  return {owner: context.window.YaAccount, events, documentEvents, document, values};
}
const response = (status, value) => ({status, ok: status >= 200 && status < 300, json: async () => value});
test('identity verification retains generation; demotion and hidden fence private responses', async () => {
  let current = account({access_id: 'dealer-a', display_name: 'A'}), resolveOrders;
  const f = fixture(async url => url.pathname.endsWith('/orders.php') ? new Promise(resolve => resolveOrders = resolve) : response(200, {account: current}));
  await f.owner.ready;
  const generation = f.owner.state.generation;
  await f.owner.refresh(); assert.equal(f.owner.state.generation, generation);
  const old = f.owner.request('orders');
  current = account(null); await f.owner.refresh();
  assert.equal(f.owner.state.generation, generation + 1);
  resolveOrders(response(200, {orders: [{order_id: 'private'}]}));
  await assert.rejects(old, /account_state_changed/);
  let notified; f.owner.subscribe(state => notified = state);
  f.document.hidden = true; f.documentEvents.visibilitychange();
  assert.equal(notified.account, null); assert.equal(notified.status, 'unavailable');
});
test('malformed 403 clears authenticated state; failed logout remains blocked until successful explicit login', async () => {
  let sessionCalls = 0;
  const f = fixture(async url => {
    if (url.pathname.endsWith('/logout-all.php')) throw new Error('offline');
    if (url.pathname.endsWith('/orders.php')) return {status: 403, ok: false, json: async () => {throw new Error('malformed');}};
    if (url.pathname.endsWith('/session.php')) sessionCalls++;
    return response(200, {account: account(null)});
  });
  await f.owner.ready;
  await assert.rejects(f.owner.request('orders')); assert.equal(f.owner.state.account, null);
  await f.owner.refresh();
  await assert.rejects(f.owner.logout(true));
  assert.equal(f.owner.state.status, 'unavailable');
  const count = sessionCalls; await f.owner.refresh(); f.owner.unlock(); await f.owner.refresh();
  assert.equal(sessionCalls, count); assert.equal(f.owner.state.account, null);
  await f.owner.request('login', {}); f.owner.unlock(); await f.owner.refresh();
  assert.equal(f.owner.state.status, 'authenticated');
});
test('session 401 rotates once; public config survives identity verification', async () => {
  let sessions = 0, rotations = 0, resolveConfig;
  const f = fixture(async url => {
    if (url.pathname.endsWith('/config.php')) return new Promise(resolve => resolveConfig = resolve);
    if (url.pathname.endsWith('/refresh.php')) { rotations++; return response(200, {ok: true}); }
    if (++sessions === 1) return response(401, {code: 'login_required'});
    return response(200, {account: account(null)});
  });
  const config = f.owner.request('config');
  await f.owner.ready;
  resolveConfig(response(200, {enabled: true}));
  assert.equal((await config).enabled, true); assert.equal(rotations, 1); assert.equal(sessions, 2);
});
test('cross-tab logout closes a verified view and rejects its late order history even when remote logout fails', async () => {
  let resolveOrders, calls = 0;
  const f = fixture(async url => {
    if (url.pathname.endsWith('/orders.php')) return new Promise(resolve => resolveOrders = resolve);
    calls++;
    return response(200, {account: account(null)});
  });
  const otherTab = fixture(async url => {
    if (url.pathname.endsWith('/logout.php')) throw new Error('network failure');
    return response(200, {account: account(null)});
  });
  await Promise.all([f.owner.ready, otherTab.owner.ready]);
  const history = f.owner.request('orders');
  await assert.rejects(otherTab.owner.logout(), /network failure/);
  f.events.storage({key: 'ya:account:/yardimci-asistan:change', newValue: JSON.stringify({action: 'logout', nonce: 'test'})});
  assert.equal(f.owner.state.status, 'unavailable'); assert.equal(f.owner.state.account, null);
  resolveOrders(response(200, {orders: [{order_id: 'private'}]}));
  await assert.rejects(history, /account_state_changed/);
  const previousCalls = calls; await f.owner.refresh();
  assert.equal(calls, previousCalls); assert.equal(f.owner.state.account, null);
});
test('HTTP success with application failure cannot authenticate or unlock private views', async () => {
  let rejectReply = false;
  const f = fixture(async () => rejectReply ? response(200, {ok: false, code: 'account_unavailable'}) : response(200, {account: account(null)}));
  await f.owner.ready;
  rejectReply = true;
  await assert.rejects(f.owner.request('profile', {fullName: 'B'}), /account_unavailable/);
  assert.equal(f.owner.state.status, 'unavailable'); assert.equal(f.owner.state.account, null);
  await assert.rejects(f.owner.request('login', {})); f.owner.unlock();
  assert.equal(f.owner.state.account, null);
  await f.owner.refresh(); assert.equal(f.owner.state.status, 'unavailable');
});
test('guest state follows confirmed logout only, including cross-tab completion', async () => {
  let finishLogout;
  const f = fixture(async url => url.pathname.endsWith('/logout.php') ? new Promise(resolve => finishLogout = resolve) : response(200, {account: account(null)}));
  await f.owner.ready;
  const logout = f.owner.logout();
  assert.equal(f.owner.state.status, 'unavailable'); assert.equal(f.owner.state.account, null);
  finishLogout(response(200, {ok: true})); await logout;
  assert.equal(f.owner.state.status, 'guest');
  f.events.storage({key: 'ya:account:/yardimci-asistan:change', newValue: JSON.stringify({action: 'logout'})});
  assert.equal(f.owner.state.status, 'unavailable');
  f.events.storage({key: 'ya:account:/yardimci-asistan:change', newValue: JSON.stringify({action: 'logout-complete'})});
  assert.equal(f.owner.state.status, 'guest');
  f.events.storage({key: 'ya:account:/yardimci-asistan:change', newValue: JSON.stringify({action: 'changed'})});
  assert.equal(f.owner.state.status, 'unavailable');
});

test('reload preserves uncertain logout as unavailable until explicit successful login', async () => {
  const f = fixture(async url => {
    if (url.pathname.endsWith('/logout.php')) throw new Error('offline');
    return response(200, {account: account(null)});
  });
  await f.owner.ready; await assert.rejects(f.owner.logout());
  let sessionCalls = 0;
  const reloaded = fixture(async url => {
    if (url.pathname.endsWith('/session.php')) sessionCalls++;
    return response(200, {account: account(null)});
  }, f.values);
  await reloaded.owner.ready;
  assert.equal(reloaded.owner.state.status, 'unavailable'); assert.equal(sessionCalls, 0);
  await reloaded.owner.request('login', {}); reloaded.owner.unlock(); await reloaded.owner.refresh();
  assert.equal(reloaded.owner.state.status, 'authenticated'); assert.equal(sessionCalls, 1);
});

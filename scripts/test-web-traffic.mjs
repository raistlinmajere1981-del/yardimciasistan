import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySource, resolvePage, intentFromAnchor, startTraffic} from '../web-site-template/public/assets/core/traffic.mjs';

function fixture(url = 'https://shop.example/?page=rooms&id=room_1&secret=ignored', overrides = {}) {
  const calls = [];
  const storage = new Map();
  const root = {};
  const listeners = [];
  const document = {
    visibilityState: 'visible',
    referrer: 'https://www.google.com/search?q=private',
    documentElement: {dataset: {}},
    addEventListener: (name, handler) => listeners.push({name, handler})
  };
  const runtime = {
    document,
    location: new URL(url),
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch: (endpoint, options) => {
      calls.push({endpoint, options, payload: JSON.parse(options.body)});
      return Promise.resolve({ok: true});
    },
    crypto: globalThis.crypto,
    window: {top: root, self: root},
    navigator: {},
    ...overrides
  };
  return {runtime, calls, storage, document, listeners};
}

test('classifies referrer into a coarse source only', () => {
  assert.equal(classifySource('', 'https://shop.example'), 'direct');
  assert.equal(classifySource('https://shop.example/about', 'https://shop.example'), 'direct');
  assert.equal(classifySource('https://www.google.com/search?q=secret', 'https://shop.example'), 'search');
  assert.equal(classifySource('https://instagram.com/p/secret', 'https://shop.example'), 'social');
  assert.equal(classifySource('https://partner.example/article', 'https://shop.example'), 'referral');
  assert.equal(classifySource('not a url', 'https://shop.example'), 'direct');
});

test('derives only allowlisted canonical pages and published ids', () => {
  assert.deepEqual(resolvePage('https://shop.example/?page=rooms&id=room_1&q=secret'), {page: 'rooms', item: 'room_1'});
  assert.deepEqual(resolvePage('https://shop.example/?page=menu&category=cat_1&q=secret'), {page: 'menu', item: 'cat_1'});
  assert.deepEqual(resolvePage('https://shop.example/?page=catalog&category=cat_1'), {page: 'catalog', item: 'cat_1'});
  assert.deepEqual(resolvePage('https://shop.example/?page=home'), {page: 'home', item: ''});
  assert.deepEqual(resolvePage('https://shop.example/'), {page: 'home', item: ''});
  assert.equal(resolvePage('https://shop.example/?page=account'), null);
  assert.equal(resolvePage('https://shop.example/?page=../admin'), null);
  assert.equal(resolvePage('https://shop.example/?page=rooms&id=../secret'), null);
  assert.equal(resolvePage('https://shop.example/?page=menu&category=../secret'), null);
});

test('recognises only explicit CTA anchors', () => {
  assert.equal(intentFromAnchor('tel:+905551112233'), 'intent_call');
  assert.equal(intentFromAnchor('https://wa.me/905551112233?text=secret'), 'intent_contact');
  assert.equal(intentFromAnchor('https://maps.google.com/?q=secret'), 'intent_route');
  assert.equal(intentFromAnchor('https://shop.example/catalog'), null);
  assert.equal(intentFromAnchor('/catalog', 'contact'), 'intent_contact');
});

test('posts one low-detail view with a rolling session token', async () => {
  const {runtime, calls, storage} = fixture();
  assert.equal(startTraffic({apiBasePath: '/yardimci-asistan'}, runtime), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, '/yardimci-asistan/api/traffic.php');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.deepEqual({...calls[0].payload, session: 'ignored', id: 'ignored'}, {
    event: 'view', page: 'rooms', item: 'room_1', src: 'search', session: 'ignored', id: 'ignored'
  });
  assert.match(calls[0].payload.session, /^[A-Za-z0-9_-]{8,120}$/);
  assert.match(calls[0].payload.id, /^[A-Za-z0-9_-]{8,120}$/);
  assert.equal(JSON.stringify(calls[0].payload).includes('secret'), false);
  const stored = JSON.parse(storage.get('ya-traffic-session'));
  assert.equal(stored.id, calls[0].payload.session);
  assert.ok(Date.now() - stored.seen < 5000);

  const second = fixture();
  second.storage.set('ya-traffic-session', JSON.stringify(stored));
  startTraffic({apiBasePath: '/yardimci-asistan'}, second.runtime);
  assert.equal(second.calls[0].payload.session, stored.id, 'same 30-minute session');
});

test('records explicit CTA click without global keyboard tracking', () => {
  const {runtime, calls, listeners, document} = fixture();
  startTraffic({apiBasePath: '/yardimci-asistan'}, runtime);
  const click = listeners.find(listener => listener.name === 'click');
  assert.ok(click);
  click.handler({
    target: {closest: () => ({getAttribute: () => 'tel:+905551112233', dataset: {trafficIntent: 'call'}})}
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.event, 'intent_call');
  assert.equal(listeners.some(listener => listener.name === 'keydown'), false);
  assert.equal(document.visibilityState, 'visible');
});

test('never tracks hidden pages, local/test hosts, previews or iframes', () => {
  const hidden = fixture();
  hidden.runtime.document.visibilityState = 'hidden';
  assert.equal(startTraffic({}, hidden.runtime), false);
  assert.equal(hidden.calls.length, 0);

  for (const url of ['http://localhost:8080/?page=home', 'http://127.0.0.1/?page=home', 'https://shop.test/?page=home', 'https://shop.example/?page=home&preview=1']) {
    const blocked = fixture(url);
    assert.equal(startTraffic({}, blocked.runtime), false, url);
    assert.equal(blocked.calls.length, 0);
  }

  const iframe = fixture();
  iframe.runtime.window = {top: {}, self: {}};
  assert.equal(startTraffic({}, iframe.runtime), false);
  assert.equal(iframe.calls.length, 0);

  const preview = fixture();
  preview.runtime.document.documentElement.dataset.preview = 'true';
  assert.equal(startTraffic({}, preview.runtime), false);
});

test('network failure is swallowed and never breaks site boot', async () => {
  const {runtime} = fixture('https://shop.example/?page=home', {
    fetch: () => Promise.reject(new Error('offline'))
  });
  assert.equal(startTraffic({}, runtime), true);
  await new Promise(resolve => setImmediate(resolve));

  const throwing = fixture('https://shop.example/?page=home', {
    fetch: () => { throw new Error('sync fetch failure'); }
  });
  assert.equal(startTraffic({}, throwing.runtime), true);
  assert.equal(startTraffic({features: {traffic: false}}, fixture().runtime), false);
});

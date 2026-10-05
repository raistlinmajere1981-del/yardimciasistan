const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNexaPresence, resolveNexaAsset } = require('../dist/index.js');

function harness() {
  let id = 0;
  const timers = new Map();
  const presence = createNexaPresence({
    schedule(callback) { timers.set(++id, callback); return id; },
    cancel(handle) { timers.delete(handle); },
  });
  presence.setActive(true);
  return { presence, timers, advance() { for (const [key, callback] of [...timers]) { timers.delete(key); callback(); } } };
}

test('Nexa finite response/success/error reactions and invisible timer cleanup', () => {
  const { presence: p, timers, advance } = harness();
  assert.equal(p.getState(), 'ready');
  const reply = p.begin(); assert.equal(p.getState(), 'thinking');
  reply('response'); assert.equal(p.getState(), 'speaking');
  advance(); assert.equal(p.getState(), 'ready');
  p.begin()('success'); assert.equal(p.getState(), 'pleased');
  p.setActive(false); assert.equal(p.getState(), 'ready'); assert.equal(timers.size, 0);
  p.begin()('response'); assert.equal(p.getState(), 'ready'); assert.equal(timers.size, 0);
  p.begin()('error'); assert.equal(p.getState(), 'concerned'); assert.equal(timers.size, 0);
});

test('Nexa concurrent and cancelled completions cannot replace latest outcome', () => {
  const { presence: p, advance } = harness();
  const older = p.begin(); const newer = p.begin();
  newer('response'); assert.equal(p.getState(), 'thinking');
  older('error'); assert.equal(p.getState(), 'speaking');
  older('error'); advance(); assert.equal(p.getState(), 'ready');
  const abandoned = p.begin(); p.reset(); const current = p.begin();
  abandoned('error'); assert.equal(p.getState(), 'thinking');
  current('cancel'); assert.equal(p.getState(), 'ready');
  const old = p.begin(); p.reset(); p.begin()('response');
  advance(); old('error'); assert.equal(p.getState(), 'ready');
});

test('Nexa resolves state aliases through authoritative manifest and rejects missing selection', () => {
  const manifest = { runtime: { stateAliases: { pleased: 'success' } }, assets: [
    { usage: 'state', state: 'success', dimensions: { width: 48 }, theme: 'independent', assetPath: 'chosen.webp' },
  ] };
  assert.equal(resolveNexaAsset(manifest, { usage: 'state', state: 'pleased', width: 48 }).assetPath, 'chosen.webp');
  assert.throws(() => resolveNexaAsset(manifest, { usage: 'state', state: 'ready' }), /Nexa asset missing/);
});

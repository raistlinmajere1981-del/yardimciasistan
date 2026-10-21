const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNexaPresence, createNexaBehavior, resolveNexaAsset, nexaStatusMessages } = require('../dist/index.js');

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

test('Desktop reaction messages expire, pending work stays active, and hidden reactions release timers', () => {
  const timers = new Map();
  let serial = 0;
  const p = createNexaPresence({
    schedule(callback, delay) { timers.set(++serial, { callback, delay }); return serial; },
    cancel(id) { timers.delete(id); },
  }, { response: 2200, success: 1800, error: 3200 });
  p.setActive(true);
  for (const [outcome, state, delay] of [['response', 'speaking', 2200], ['success', 'pleased', 1800], ['error', 'concerned', 3200]]) {
    const settle = p.begin();
    assert.equal(p.getState(), 'thinking'); assert.equal(timers.size, 0);
    settle(outcome); assert.equal(p.getState(), state);
    assert.ok(nexaStatusMessages[state]);
    const [id, timer] = [...timers][0];
    assert.equal(timer.delay, delay); timers.delete(id); timer.callback();
    assert.equal(p.getState(), 'ready'); assert.equal(nexaStatusMessages.ready, '');
  }
  p.begin()('error'); p.setActive(false);
  assert.equal(p.getState(), 'ready'); assert.equal(timers.size, 0);
  p.begin()('error'); assert.equal(p.getState(), 'ready'); assert.equal(timers.size, 0);
  p.setActive(true); p.begin()('success');
  const pending = p.begin(); assert.equal(timers.size, 0);
  p.setActive(false); assert.equal(p.getState(), 'thinking');
  pending('cancel'); assert.equal(p.getState(), 'ready');
});

test('Recording owners and concurrent AI work have deterministic precedence and cancellation', () => {
  const { presence: p, timers } = harness();
  const stopFirst = p.beginListening(), stopSecond = p.beginListening();
  assert.equal(p.getState(), 'listening'); assert.equal(timers.size, 0);
  const complete = p.begin(); assert.equal(p.getState(), 'thinking');
  stopFirst(); complete('response'); assert.equal(p.getState(), 'listening');
  stopSecond(); assert.equal(p.getState(), 'ready');
  stopSecond(); assert.equal(p.getState(), 'ready');
  const abandoned = p.beginListening(); p.reset();
  const current = p.beginListening(); abandoned(); assert.equal(p.getState(), 'listening');
  current(); assert.equal(p.getState(), 'ready');
});

test('Natural gestures are bounded, varied, sometimes chained, with long quiet intervals and double blinks', () => {
  let seed = 71;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const behavior = createNexaBehavior(random);
  const gestures = [], starts = [], blinkStarts = [];
  let moving = false, blinking = false, lastMovement = 0, maxQuiet = 0;
  for (let now = 0; now <= 600000; now += 30) {
    const g = behavior.sample(now, 'ready');
    const active = Math.abs(g.gazeX) + Math.abs(g.gazeY) + Math.abs(g.tilt) > .01;
    if (active && !moving) {
      gestures.push(g.tilt < 0 ? 'curious-left' : g.tilt > 0 ? 'curious-right' : g.gazeX < 0 ? 'left' : g.gazeX > 0 ? 'right' : g.gazeY < 0 ? 'up' : 'down');
      starts.push(now); maxQuiet = Math.max(maxQuiet, now - lastMovement);
    }
    if (active) lastMovement = now;
    if (g.blink > 0 && !blinking) blinkStarts.push(now);
    moving = active; blinking = g.blink > 0;
    assert.ok(Math.abs(g.gazeX) <= 3 && Math.abs(g.gazeY) <= 2.5 && Math.abs(g.tilt) <= 2.5);
    assert.ok(g.blink >= 0 && g.blink <= 1);
  }
  assert.equal(new Set(gestures).size, 6);
  assert.ok(gestures.every((g, i) => i === 0 || g !== gestures[i - 1]));
  assert.ok(maxQuiet >= 22000);
  assert.ok(starts.some((n, i) => i > 0 && n - starts[i - 1] < 3400));
  assert.ok(blinkStarts.some((n, i) => i > 0 && n - blinkStarts[i - 1] < 400));
  assert.ok(new Set(blinkStarts.slice(1).map((n, i) => n - blinkStarts[i])).size > 10);
});

test('Interactions never interrupt active work, repeated presses are throttled, reset drops old gestures', () => {
  const b = createNexaBehavior(() => .5);
  b.react('hover', 0, 'ready');
  assert.ok(b.sample(400, 'ready').tilt < 0);
  b.react('press', 400, 'ready');
  assert.ok(b.sample(500, 'ready').surprise > 0);
  b.react('press', 600, 'ready');
  assert.equal(b.sample(1400, 'ready').surprise, 0);
  for (const state of ['thinking', 'listening', 'speaking', 'pleased', 'concerned']) {
    b.react('press', 1500, state);
    const sample = b.sample(1600, state);
    assert.equal(sample.gazeX + sample.gazeY + sample.tilt + sample.nod + sample.surprise + sample.smile, 0);
  }
  b.reset(); assert.equal(b.sample(0, 'ready').tilt, 0);
});

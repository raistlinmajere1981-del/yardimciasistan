// One scheduler for every overlay. No timer/rAF remains when the last scene stops.
export function createTicker(clock = {
  now: () => performance.now(),
  frame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
  delay: (callback, ms) => setTimeout(callback, ms),
  cancelDelay: id => clearTimeout(id),
}) {
  const clients = new Map();
  let frame = null, timer = null;
  function cancel() {
    if (frame !== null) clock.cancelFrame(frame);
    if (timer !== null) clock.cancelDelay(timer);
    frame = timer = null;
  }
  function schedule() {
    if (!clients.size || frame !== null || timer !== null) return;
    const due = Math.min(...[...clients.values()].map(client => client.due));
    const wait = Math.max(0, due - clock.now() - 2);
    timer = clock.delay(() => {
      timer = null;
      frame = clock.frame(tick);
    }, wait);
  }
  function tick(now) {
    frame = null;
    for (const [callback, client] of [...clients]) {
      if (!clients.has(callback) || now + 1 < client.due) continue;
      const elapsed = client.last === null ? 1000 / client.fps : now - client.last;
      client.last = now;
      client.due += 1000 / client.fps;
      if (client.due < now) client.due = now + 1000 / client.fps;
      // A slow or resumed tab never fast-forwards effects by a large time jump.
      try { callback(Math.min(elapsed / 1000, 0.1), now); }
      catch (error) { clients.delete(callback); globalThis.reportError?.(error); }
    }
    schedule();
  }
  return {
    add(callback, fps = 24) {
      if (!Number.isFinite(fps) || fps < 1 || fps > 60) throw new RangeError('fps must be 1–60');
      clients.set(callback, {fps, last: null, due: clock.now()});
      schedule();
      return () => { clients.delete(callback); if (!clients.size) cancel(); };
    },
    get activeCount() { return clients.size; },
    get scheduled() { return frame !== null || timer !== null; },
  };
}
export const ticker = createTicker();

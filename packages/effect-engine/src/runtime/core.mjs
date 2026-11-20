import {ticker} from './ticker.mjs';
import {seededRandom} from './random.mjs';
import {photoTransform, projectedBounds} from './coordinates.mjs';

const hostOwners = new WeakMap();
function acquireHost(host) {
  let entry = hostOwners.get(host);
  if (!entry) {
    entry = {count: 0, position: host.style.position, changed: getComputedStyle(host).position === 'static'};
    if (entry.changed) host.style.position = 'relative';
    hostOwners.set(host, entry);
  }
  entry.count++;
  return () => {
    if (--entry.count) return;
    if (entry.changed && host.style.position === 'relative') host.style.position = entry.position;
    hostOwners.delete(host);
  };
}

/** Effects implement update(dt), render(ctx, frame), optional destroy()/inspect().
 * Config and effect factories are supplied by the caller; core knows no effect names.
 */
export function createOverlay(image, config, {host = image.parentElement?.tagName === 'PICTURE' ? image.parentElement.parentElement : image.parentElement, enabled = true} = {}) {
  if (!host || image.tagName !== 'IMG' || !host.contains(image)) throw new TypeError('An <img> inside its overlay host is required');
  if (!Array.isArray(config.effects)) throw new TypeError('Supply an effects array');
  const releaseHost = acquireHost(host);
  const canvas = document.createElement('canvas');
  canvas.className = 'canvas-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {position: 'absolute', pointerEvents: 'none', zIndex: '1', display: 'none'});
  host.append(canvas);
  const ctx = canvas.getContext('2d', {alpha: true});
  if (!ctx) { canvas.remove(); releaseHost(); throw new Error('Canvas 2D unavailable'); }
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const policy = config.performance || {};
  const constrained = connection?.saveData === true || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  let fps = Math.min(60, Math.max(1, constrained ? policy.lowPowerFps || 18 : policy.fps || 24));
  let dprLimit = constrained ? policy.lowPowerDpr || 1 : policy.maxDpr || 1.5;
  const effects = [];
  try {
    config.effects.forEach((effect, index) => effects.push(effect.create({random: seededRandom(`${config.seed ?? 1}:${effect.seed ?? index}`), params: effect.params || {}})));
  } catch (error) {
    effects.forEach(effect => effect.destroy?.());
    canvas.remove(); releaseHost();
    throw error;
  }
  let disposed = false, visible = false, pageActive = true, ready = false, unsubscribe = null, everConnected = image.isConnected;
  let transform, bounds, dpr, elapsed = 0, frames = 0, cost = 0, totalCost = 0, slowFrames = 0, paused = false;
  const removers = [];
  const listen = (target, event, callback) => {
    target?.addEventListener(event, callback);
    removers.push(() => target?.removeEventListener(event, callback));
  };
  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function stop() {
    unsubscribe?.();
    unsubscribe = null;
    canvas.style.display = 'none';
    clear();
  }
  function sync() {
    const run = !disposed && !paused && enabled && ready && visible && pageActive && !document.hidden && !media.matches;
    if (!run) {
      // Visibility and canvas resize can clear a paused frame; repaint without advancing time.
      if (paused && ready && visible && enabled && !disposed && !media.matches && pageActive && !document.hidden) { unsubscribe?.(); unsubscribe = null; canvas.style.display = 'block'; draw(0); }
      else stop();
      return;
    }
    if (!unsubscribe) { canvas.style.display = 'block'; unsubscribe = ticker.add(draw, fps); }
  }
  function draw(dt) {
    // Also gate the scheduled frame: preference/visibility can change between
    // scheduling and event delivery (including lazy media updates in headless).
    if (document.hidden || media.matches || !pageActive || !enabled) { sync(); return; }
    // Detached hosts release everything on their next scheduled frame.
    if (!image.isConnected || !host.isConnected) { destroy(); return; }
    const start = performance.now();
    elapsed += dt;
    clear();
    ctx.setTransform(dpr * transform.sx, 0, 0, dpr * transform.sy, dpr * (transform.x - bounds.left), dpr * (transform.y - bounds.top));
    const frame = {elapsed, transform, view: transform.view, pixelScale: Math.min(transform.sx, transform.sy)};
    for (const effect of effects) {
      ctx.save();
      try { effect.update(dt); effect.render(ctx, frame); }
      catch (error) { destroy(); throw error; }
      finally { ctx.restore(); }
    }
    frames++;
    cost = performance.now() - start;
    totalCost += cost;
    // Site opt-in: sustained slow rendering falls back to the unchanged photograph.
    if (policy.staticFallbackCost && cost > policy.staticFallbackCost && slowFrames >= 40) {
      image.dataset.water = 'static-performance';
      image.dispatchEvent(new Event('water-static-fallback'));
      destroy();
      return;
    }
    // Sustained expensive drawing lowers resolution and cadence once, without
    // polling audio or adding a second scheduler.
    slowFrames = cost > 6 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames >= 30 && fps > 15) {
      fps = 15; dprLimit = 1; slowFrames = 0;
      stop(); resize();
    }
  }
  function resize() {
    if (disposed) return;
    if (everConnected && (!image.isConnected || !host.isConnected)) { destroy(); return; }
    everConnected ||= image.isConnected;
    ready = false;
    if (!image.complete || !image.naturalWidth || !image.isConnected) { sync(); return; }
    const rect = image.getBoundingClientRect(), parent = host.getBoundingClientRect();
    const style = getComputedStyle(image);
    const paddingLeft = parseFloat(style.paddingLeft), paddingTop = parseFloat(style.paddingTop);
    const box = {
      left: rect.left + parseFloat(style.borderLeftWidth) + paddingLeft,
      top: rect.top + parseFloat(style.borderTopWidth) + paddingTop,
      width: rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - paddingLeft - parseFloat(style.paddingRight),
      height: rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - paddingTop - parseFloat(style.paddingBottom),
    };
    if (!box.width || !box.height) { sync(); return; }
    const photo = config.photo || {width: image.naturalWidth, height: image.naturalHeight};
    const source = photo.sources?.find(source => image.currentSrc.includes(source.match));
    const crop = source?.crop || {x: 0, y: 0, width: photo.width, height: photo.height};
    transform = photoTransform({width: box.width, height: box.height, crop, fit: style.objectFit, objectPosition: style.objectPosition, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight});
    bounds = projectedBounds(config.bounds || {x: 0, y: 0, width: photo.width, height: photo.height}, transform, box.width, box.height);
    dpr = Math.min(devicePixelRatio || 1, dprLimit);
    // Hard pixel budget even for huge displays; only the effect rectangle allocates pixels.
    dpr = Math.min(dpr, Math.sqrt((policy.maxPixels || 1200000) / Math.max(1, bounds.width * bounds.height)));
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    Object.assign(canvas.style, {left: `${box.left - parent.left - host.clientLeft + host.scrollLeft + bounds.left}px`, top: `${box.top - parent.top - host.clientTop + host.scrollTop + bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`});
    ready = bounds.width > 0 && bounds.height > 0;
    sync();
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    if (everConnected && (!image.isConnected || !host.isConnected)) { destroy(); return; }
    visible = entry.isIntersecting; sync();
  }) : null;
  observer?.observe(image);
  // Safe static fallback in browsers without viewport observation.
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(image);
  if (host !== image) resizeObserver?.observe(host);
  listen(window, 'resize', resize); // Also handles DPR changes and source breakpoints.
  listen(image, 'load', resize);
  listen(image, 'error', () => { ready = false; sync(); });
  listen(document, 'visibilitychange', sync);
  listen(media, 'change', sync);
  listen(window, 'pagehide', () => { pageActive = false; sync(); });
  listen(window, 'pageshow', () => { pageActive = true; resize(); }); // bfcache restore
  function destroy() {
    if (disposed) return;
    disposed = true;
    stop();
    observer?.disconnect(); resizeObserver?.disconnect();
    removers.forEach(remove => remove());
    effects.forEach(effect => effect.destroy?.());
    canvas.remove();
    canvas.width = canvas.height = 1;
    releaseHost();
  }
  try { resize(); } catch (error) { destroy(); throw error; }
  return {
    canvas, destroy, refresh: resize,
    setPaused(value) { if (!disposed) { paused = Boolean(value); sync(); } },
    // Deterministic test frame: reset via destroy/create before seeking backwards.
    renderAt(seconds = 0) {
      if (!ready || disposed || media.matches) return;
      if (!Number.isFinite(seconds) || seconds < elapsed || seconds > 60) throw new RangeError('renderAt requires elapsed ≤ seconds ≤ 60');
      paused = true; unsubscribe?.(); unsubscribe = null;
      canvas.style.display = 'block';
      while (seconds - elapsed > .000001) draw(Math.min(1/24, seconds - elapsed));
      if (!frames) draw(0);
    },
    setEnabled(value) { if (!disposed) { enabled = Boolean(value); sync(); } },
    inspect() { return {running: Boolean(unsubscribe), disposed, ready, visible, reducedMotion: media.matches, frames, elapsed, fps, dpr, pixelCount: canvas.width * canvas.height, costMs: cost, avgCostMs: frames ? totalCost / frames : 0, paused, transform, effects: effects.map(effect => effect.inspect?.())}; },
  };
}

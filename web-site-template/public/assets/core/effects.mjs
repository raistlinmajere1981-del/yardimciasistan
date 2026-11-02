/** Optional adapter only. The engine is the unchanged Efekt Atölyesi distribution. */
export function mountEffects(bindings, root = document) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const overlays = new Map();
  let generation = 0, active = true, disposed = false, abort = null;
  const safe = () => active && !disposed && !reduced.matches && !connection?.saveData
    && !(navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2)
    && !(navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
  // An explicit manifest binds by exact literal img src even without
  // modifying site HTML. Responsive srcset/currentSrc is not another target.
  const localPath = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[?#\\]/.test(value);
  function matchesSource(binding, node) {
    if (!localPath(binding?.source) || !node?.matches?.('img')) return false;
    const literal = node.getAttribute('src');
    if (!literal) return false;
    try {
      const url = new URL(literal, document.baseURI);
      return url.origin === location.origin && url.pathname === binding.source;
    } catch { return false; }
  }
  function target(binding, nodes) {
    if (!binding || typeof binding.slot !== 'string' || !localPath(binding.source)) return null;
    const matches = nodes.filter(node => matchesSource(binding, node));
    return matches.length === 1 ? matches[0] : null;
  }
  function stop() {
    generation++;
    abort?.abort(); abort = null;
    for (const [image, overlay] of overlays) { overlay.destroy(); image.dataset.effectState = 'static'; }
    overlays.clear();
  }
  async function sync() {
    stop();
    if (!safe()) return;
    const turn = generation;
    abort = new AbortController();
    const {signal} = abort;
    const nodes = [...root.querySelectorAll('img')];
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      const image = target(binding, nodes);
      if (!image || !image.complete || !image.naturalWidth) continue;
      image.dataset.effectState = 'static';
      try {
        const response = await fetch(binding.url, {cache: 'no-store', signal});
        if (!response.ok) continue;
        const source = await response.text();
        if (source.length > 25 * 1024 * 1024) continue;
        const candidate = JSON.parse(source);
        const visibleZones = new Set((candidate.zones || []).filter(zone => zone.visible === true).map(zone => zone.id));
        if (!Array.isArray(candidate.effects) || !candidate.effects.some(effect => effect.enabled === true && visibleZones.has(effect.zoneId))) continue;
        if (Math.abs(image.naturalWidth / image.naturalHeight - candidate.photo?.width / candidate.photo?.height) > .02) continue;
        if (turn !== generation || !safe() || !image.isConnected) return;
        // No target, scene, active layer or motion permission: no runtime import at all.
        const [{importProject}, {compileScene, createOverlay}] = await Promise.all([
          import('../vendor/effect-engine/src/model/project.mjs'),
          import('../vendor/effect-engine/src/runtime/index.mjs'),
        ]);
        if (turn !== generation || !safe() || !image.isConnected) return;
        const compiled = compileScene(importProject(source));
        if (!compiled.effects.length) continue;
        compiled.performance.staticFallbackCost = 18;
        const overlay = createOverlay(image, compiled);
        overlays.set(image, overlay);
        image.dataset.effectState = 'animated';
      } catch {
        // Static <img> stays intact for every failure. Raw engine errors are not UI copy.
        if (turn === generation) image.dataset.effectState = 'static';
      }
    }
  }
  const loaded = event => { if (event.target.matches?.('img') && (bindings?.some?.(binding => matchesSource(binding, event.target)))) void sync(); };
  const fallback = event => { if (event.target.matches?.('img') && (overlays.has(event.target))) event.target.dataset.effectState = 'static'; };
  const pagehide = () => { active = false; stop(); };
  const pageshow = () => { active = true; void sync(); };
  root.addEventListener('load', loaded, true);
  root.addEventListener('water-static-fallback', fallback, true);
  reduced.addEventListener('change', sync);
  connection?.addEventListener?.('change', sync);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  void sync();
  return () => {
    disposed = true; stop();
    root.removeEventListener('load', loaded, true);
    root.removeEventListener('water-static-fallback', fallback, true);
    reduced.removeEventListener('change', sync);
    connection?.removeEventListener?.('change', sync);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
  };
}

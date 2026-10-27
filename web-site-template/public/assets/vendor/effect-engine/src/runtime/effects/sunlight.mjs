import {polygonSampler} from '../polygon-sampling.mjs';
import {between} from '../random.mjs';

function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// Small reflections on moving water. No full-photo tint, flare or lighting mask.
export function createSunlight({random, params}) {
  let enabled = Boolean(params.enabled), opacity = params.opacity, count = params.count;
  let active = 0, disposed = false;
  const glints = [];
  const samplePolygon = polygonSampler(params.waterArea);
  // Studio adaptation: clip facets and drift to any user polygon, including concave zones.
  const mask = new Path2D();
  params.waterArea.forEach(([x,y],i) => i ? mask.lineTo(x,y) : mask.moveTo(x,y));
  mask.closePath();
  const weight = params.regions.reduce((sum, region) => sum + region.weight, 0);
  function spawn(initial = false) {
    for (let attempt = 0; attempt < 80; attempt++) {
      let pick = random() * weight;
      const region = params.regions.find(r => (pick -= r.weight) <= 0) ?? params.regions.at(-1);
      const angle = random() * Math.PI * 2, radius = random() ** 0.65;
      const candidate = attempt < 40
        ? [region.center[0] + Math.cos(angle) * radius * region.radius[0], region.center[1] + Math.sin(angle) * radius * region.radius[1]]
        : samplePolygon(random);
      const [x,y] = candidate;
      const length = between(random, ...region.length), life = between(random, ...params.life);
      const width = between(random, ...region.width), drift = between(random, ...params.drift);
      // Sample centers inside the zone; the polygon mask contains moving facets.
      if (!inside(x, y, params.waterArea)) continue;
      const path = new Path2D();
      path.moveTo(-length / 2, 0);
      path.quadraticCurveTo(0, between(random, -width, width), length / 2, 0);
      return {x, y, length, width, life, drift, path, age: initial ? life * random() : 0,
        strength: between(random, 0.4, 1), phase: random() * Math.PI * 2};
    }
    return null;
  }
  function resize() {
    glints.length = Math.min(glints.length, count);
    while (glints.length < count) {
      const glint = spawn(true);
      if (!glint) break;
      glints.push(glint);
    }
  }
  if (enabled) resize();
  return {
    // Preview controls adjust this effect without resetting the wave simulation.
    configure(options) {
      if (disposed) return;
      enabled = Boolean(options.enabled);
      opacity = options.opacity ?? opacity;
      count = options.count ?? count;
      if (enabled) resize();
      else { glints.length = 0; active = 0; }
    },
    update(dt) {
      if (!enabled || disposed) return;
      for (let i = 0; i < glints.length; i++) {
        glints[i].age += dt;
        if (glints[i].age >= glints[i].life) {
          const next = spawn();
          if (next) glints[i] = next;
          else { glints.splice(i, 1); i--; }
        }
      }
    },
    render(ctx) {
      active = 0;
      if (!enabled || disposed) return;
      ctx.save();
      ctx.clip(mask);
      ctx.strokeStyle = params.color;
      ctx.lineCap = 'round';
      for (const glint of glints) {
        const progress = glint.age / glint.life;
        const envelope = Math.sin(progress * Math.PI) ** 2;
        if (envelope < 0.02) continue;
        const ripple = 0.8 + Math.sin(progress * Math.PI * 2 + glint.phase) * 0.2;
        ctx.save();
        ctx.translate(glint.x + progress * glint.drift, glint.y);
        ctx.scale(ripple, 1);
        ctx.globalAlpha = opacity * glint.strength * envelope;
        ctx.lineWidth = glint.width;
        ctx.stroke(glint.path);
        ctx.restore();
        active++;
      }
      ctx.restore();
    },
    inspect: () => ({type: 'sunlight', enabled, opacity, count: glints.length, active,
      glints: glints.map(({x, y, age, life}) => ({x, y, age, life}))}),
    destroy() { disposed = true; glints.length = 0; active = 0; },
  };
}

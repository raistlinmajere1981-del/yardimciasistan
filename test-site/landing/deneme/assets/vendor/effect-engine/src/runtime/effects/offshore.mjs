import {between} from '../random.mjs';

const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// Quiet wind-driven facets, with perspective and occasional local breaking.
// One small shared texture; no per-frame allocation, image sampling or blur.
export function createOffshore({random, params}) {
  let enabled = params.enabled !== false, disposed = false, active = 0;
  const patches = [];
  const sprite = document.createElement('canvas');
  sprite.width = 128; sprite.height = 64;
  const paint = sprite.getContext('2d');
  paint.save(); paint.translate(64, 16); paint.scale(62, 14);
  const soft = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
  soft.addColorStop(0, 'rgba(255,255,255,0.7)');
  soft.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  soft.addColorStop(1, 'rgba(255,255,255,0)');
  paint.fillStyle = soft; paint.fillRect(-1, -1, 2, 2); paint.restore();
  paint.fillStyle = '#fff';
  // Unequal, separated islands, not a solid dash.
  for (let i = 0; i < 15; i++) {
    const x = 9 + i * 7.8;
    paint.globalAlpha = between(random, 0.25, 0.75) * Math.sin((i + 1) / 16 * Math.PI);
    paint.beginPath();
    paint.ellipse(x, 47 + between(random, -2, 2), between(random, 1.5, 4), between(random, 0.5, 1.5), 0, 0, Math.PI * 2);
    paint.fill();
  }
  paint.globalAlpha = 1; paint.globalCompositeOperation = 'source-in';
  paint.fillRect(0, 0, sprite.width, sprite.height);
  // Cached non-shoreline wave crest. A dark, curved trough under an interrupted
  // pale leading edge moves with each patch; avoids a row of static white dashes.
  const crest = params.crestLines ? document.createElement('canvas') : null;
  if (crest) {
    crest.width = 128; crest.height = 48;
    const c = crest.getContext('2d');
    c.lineCap = 'round';
    const arc = (y, start, end, amp) => {
      c.beginPath();
      c.moveTo(start, y + amp * .3);
      c.bezierCurveTo(start + 15, y - amp * .7, end - 18, y - amp, end, y);
    };
    c.strokeStyle = 'rgba(16,65,72,.54)'; c.lineWidth = 6;
    arc(29, 6, 123, 12); c.stroke();
    c.strokeStyle = 'rgba(232,248,244,.82)'; c.lineWidth = 4.3;
    arc(23, 11, 66, 10); c.stroke();
    arc(22, 80, 122, 7); c.stroke();
    c.fillStyle = 'rgba(240,248,241,.73)';
    for (const [x,y,w] of [[17,21,4],[48,14,5],[86,19,3],[113,22,4]]) {
      c.beginPath(); c.ellipse(x,y,w,2,0,0,Math.PI*2); c.fill();
    }
  }
  const water = new Path2D();
  for (const area of params.areas) {
    water.moveTo(...area[0]);
    for (const point of area.slice(1)) water.lineTo(...point);
    water.closePath();
  }
  function spawn(initial = false) {
    for (let attempt = 0; attempt < 250; attempt++) {
      const x = between(random, params.bounds.x, params.bounds.x + params.bounds.width);
      const y = between(random, params.bounds.y, params.bounds.y + params.bounds.height);
      const depth = Math.max(0, Math.min(1, (y - params.horizon) / params.depthSpan));
      // More distant projected water contains fewer readable events per area.
      if (random() > (params.distribution === 'even' ? .72 : 0.16 + 0.84 * depth ** 1.3)) continue;
      const scale = params.distribution === 'even' ? .34 + .66 * depth : .16 + .84 * depth ** 1.4;
      const length = between(random, ...params.length) * scale;
      const height = between(random, params.crestLines ? 12 : 5, params.crestLines ? 22 : 10) * scale;
      const travel = between(random, ...params.travel) * scale;
      const dx = params.direction[0] * travel, dy = params.direction[1] * travel;
      const marginX = length * 0.6 + Math.abs(dx) + 2;
      const marginY = height * 0.7 + Math.abs(dy) + 3;
      if (!params.areas.some(area => [-1, 0, 1].every(xx => [-1, 0, 1].every(yy =>
        inside(x + xx * marginX, y + yy * marginY, area))))) continue;
      const life = between(random, ...params.life);
      const wait = between(random, ...params.wait) * (1.8 - depth);
      return {x, y, dx, dy, length, height, life, wait, depth, scale,
        age: initial ? between(random, -wait, life) : -wait,
        foam: params.breaking !== false && random() < (params.breakProbability ?? (0.05 + 0.4 * depth ** 1.3)),
        phase: random() * Math.PI * 2, strength: between(random, 0.55, 1)};
    }
    return null;
  }
  function populate() {
    while (patches.length < params.count) {
      const patch = spawn(true);
      if (!patch) break;
      patches.push(patch);
    }
  }
  if (enabled) populate();
  return {
    configure(options) {
      if (disposed) return;
      enabled = Boolean(options.enabled);
      if (enabled) populate();
      else { patches.length = 0; active = 0; }
    },
    update(dt) {
      if (!enabled || disposed) return;
      const step = dt * (params.speedScale ?? 1);
      for (let i = 0; i < patches.length; i++) {
        patches[i].age += step;
        if (patches[i].age >= patches[i].life) {
          const next = spawn();
          if (next) patches[i] = next;
          else { patches.splice(i, 1); i--; }
        }
      }
    },
    render(ctx) {
      active = 0;
      if (!enabled || disposed) return;
      ctx.save(); ctx.clip(water);
      for (const patch of patches) {
        if (patch.age <= 0 || patch.age >= patch.life) continue;
        const progress = patch.age / patch.life;
        const envelope = Math.sin(progress * Math.PI) ** 1.5;
        const strength = patch.strength * (params.distribution === 'even' ? .45 + .55 * patch.depth : .12 + .88 * patch.depth ** 1.2);
        const ripple = 0.88 + 0.12 * Math.sin(progress * Math.PI * 2 + patch.phase);
        ctx.save(); ctx.translate(patch.x + patch.dx * progress, patch.y + patch.dy * progress);
        ctx.globalAlpha = Math.min(1, params.opacity * envelope * strength * 1.05);
        ctx.drawImage(sprite, 0, 0, 128, 32, -patch.length / 2, -patch.height / 2, patch.length * ripple, patch.height);
        if (crest) {
          ctx.globalAlpha = Math.min(1, params.opacity * envelope * strength * 1.22);
          ctx.drawImage(crest, -patch.length / 2, -patch.height / 2,
            patch.length * ripple, patch.height);
        }
        if (patch.foam) {
          const breaking = smooth((progress - 0.18) / 0.22) * (1 - smooth((progress - 0.5) / 0.35));
          ctx.globalAlpha = Math.min(1, params.opacity * breaking * strength * 0.74);
          // Crop the transparent atlas padding: otherwise foam becomes subpixel
          // after perspective scaling and disappears at normal display size.
          ctx.drawImage(sprite, 0, 42, 128, 11, -patch.length * 0.45, -patch.height * 0.3,
            patch.length * 0.9 * ripple, patch.height * 0.6);
        }
        ctx.restore(); active++;
      }
      ctx.restore();
    },
    inspect: () => ({type: 'offshore', enabled, active, count: patches.length,
      cachedPixels: sprite.width * sprite.height + (crest ? crest.width * crest.height : 0),
      patches: patches.map(({x, y, dx, dy, age, life, depth, scale, length, foam}) =>
        ({x, y, dx, dy, age, life, depth, scale, length, foam}))}),
    destroy() { disposed = true; patches.length = 0; active = 0; sprite.width = sprite.height = 0; if (crest) crest.width = crest.height = 0; },
  };
}

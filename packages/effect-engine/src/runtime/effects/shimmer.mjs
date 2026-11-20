import {between} from '../random.mjs';

function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// One reflected sun path, with a bright core, a broad middle and a fading tail.
// Soft luminous bands carry the motion; sparse sparkles provide fine detail.
// Only cached light sprites are drawn. No photo displacement, foam or tree motion.
export function createShimmer({random, params}) {
  const area = params.area, particles = [], bands = [];
  const clip = new Path2D();
  clip.moveTo(...area[0]);
  area.slice(1).forEach(point => clip.lineTo(...point));
  clip.closePath();
  const sprite = document.createElement('canvas');
  sprite.width = 96; sprite.height = 32;
  const paint = sprite.getContext('2d');
  for (const [y, rx, ry] of [[8, 46, 4], [24, 15, 6]]) {
    paint.save(); paint.translate(48, y); paint.scale(rx, ry);
    const light = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
    light.addColorStop(0, '#fffced');
    light.addColorStop(.25, 'rgba(255,249,221,.85)');
    light.addColorStop(.65, 'rgba(255,247,214,.24)');
    light.addColorStop(1, 'rgba(255,247,214,0)');
    paint.fillStyle = light; paint.fillRect(-1, -1, 2, 2); paint.restore();
  }
  const sheen = document.createElement('canvas');
  sheen.width = 256; sheen.height = 96;
  const sheenCtx = sheen.getContext('2d');
  sheenCtx.save(); sheenCtx.translate(128, 48); sheenCtx.scale(126, 46);
  const glow = sheenCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, 'rgba(255,252,237,.56)');
  glow.addColorStop(.25, 'rgba(255,249,226,.45)');
  glow.addColorStop(.55, 'rgba(255,247,216,.2)');
  glow.addColorStop(.82, 'rgba(255,245,210,.035)');
  glow.addColorStop(1, 'rgba(255,245,210,0)');
  sheenCtx.fillStyle = glow; sheenCtx.fillRect(-1, -1, 2, 2); sheenCtx.restore();

  let active = 0, clock = 0, disposed = false;
  for (const layer of params.layers) {
    for (const [x, y, width, height, fade] of layer.bands) {
      bands.push({x, y, width, height, gain: layer.gain * fade,
        phase: bands.length * .72 + random() * .2, layer: layer.id});
    }
  }
  function spawn(layer, initial = false) {
    let x, y, anchor;
    for (let attempt = 0; attempt < 160; attempt++) {
      anchor = layer.bands[Math.floor(random() * layer.bands.length)];
      x = anchor[0] + between(random, -.44, .44) * anchor[2];
      y = anchor[1] + between(random, -.42, .42) * anchor[3];
      if (inside(x, y, area)) break;
    }
    const life = between(random, ...params.life), wait = between(random, ...params.wait);
    const fragment = random() < .35;
    return {x, y, layer, life, wait, fragment, age: initial ? between(random, 0, life) : -wait,
      length: between(random, ...(fragment ? [5, 11] : params.length)),
      height: between(random, ...(fragment ? [2.5, 4] : params.height)),
      drift: between(random, ...params.drift), phase: random() * Math.PI * 2,
      frequency: between(random, 2.1, 3.8),
      strength: layer.gain * anchor[4] * between(random, .65, 1)};
  }
  let remaining = params.count;
  params.layers.forEach((layer, index) => {
    const count = index === params.layers.length - 1 ? remaining : Math.round(params.count * layer.share);
    remaining -= count;
    for (let i = 0; i < count; i++) particles.push(spawn(layer, true));
  });
  return {
    update(dt) {
      if (disposed) return;
      const step = dt * params.speedScale;
      clock += step;
      for (let i = 0; i < particles.length; i++) {
        particles[i].age += step;
        if (particles[i].age >= particles[i].life) particles[i] = spawn(particles[i].layer);
      }
    },
    render(ctx) {
      if (disposed) return;
      active = 0;
      ctx.save(); ctx.clip(clip);
      for (const band of bands) {
        // Phase delay follows the path towards the viewer; independent slight
        // drift/stretch avoids a fixed glowing patch or a breaking wave front.
        const phase = clock * 1.9 - band.phase;
        const strength = .27 + .73 * (.5 + .5 * Math.sin(phase));
        const width = band.width * (1 + Math.sin(phase * .9) * .12);
        const height = band.height * (1 + Math.cos(phase * 1.1) * .18);
        const x = band.x + Math.sin(phase * .68) * 19;
        const y = band.y + Math.sin(phase * .9) * 4.5;
        ctx.globalAlpha = Math.min(1, params.bandOpacity * band.gain * strength);
        ctx.drawImage(sheen, x - width / 2, y - height / 2, width, height);
      }
      for (const particle of particles) {
        if (particle.age < 0 || particle.age >= particle.life) continue;
        const progress = particle.age / particle.life;
        const envelope = Math.sin(progress * Math.PI) ** 1.4;
        const twinkle = .12 + .88 * (.5 + .5 * Math.sin(clock * particle.frequency + particle.phase)) ** 2;
        const stretch = .85 + .15 * Math.sin(clock + particle.phase);
        const x = particle.x - progress * particle.drift + Math.sin(clock * .7 + particle.phase) * 2;
        const y = particle.y + Math.sin(clock * .6 + particle.phase) * .8;
        ctx.globalAlpha = Math.min(1, params.opacity * particle.strength * envelope * twinkle);
        ctx.drawImage(sprite, 0, particle.fragment ? 16 : 0, 96, 16,
          x - particle.length / 2, y - particle.height / 2, particle.length * stretch, particle.height);
        active++;
      }
      ctx.restore();
    },
    inspect: () => ({type: 'shimmer', active, count: particles.length, area, opacity: params.opacity,
      bandOpacity: params.bandOpacity, bandCount: bands.length,
      layers: params.layers.map(layer => ({id: layer.id, gain: layer.gain,
        bands: layer.bands.length, particles: particles.filter(p => p.layer === layer).length})),
      cachedPixels: sprite.width * sprite.height + sheen.width * sheen.height}),
    destroy() { disposed = true; particles.length = bands.length = 0; sprite.width = sprite.height = sheen.width = sheen.height = 0; },
  };
}

function position(value, space, axis) {
  const keywords = {left: 0, top: 0, center: 0.5, right: 1, bottom: 1};
  if (value in keywords) return space * keywords[value];
  if (value?.endsWith('%')) return space * parseFloat(value) / 100;
  if (value?.endsWith('px')) return parseFloat(value);
  throw new Error(`Unsupported object-position ${axis}: ${value}; use two percentages, keywords or px`);
}

// Map original photograph coordinates to the rendered <img>, including a
// pre-cropped <picture> source. The actual image is never drawn to the canvas.
export function photoTransform({width, height, crop, fit = 'cover', objectPosition = '50% 50%', naturalWidth}) {
  let sx = width / crop.width, sy = height / crop.height;
  if (fit !== 'fill') {
    let scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    if (fit === 'none' || fit === 'scale-down') {
      const naturalScale = (naturalWidth || crop.width) / crop.width;
      scale = fit === 'none' ? naturalScale : Math.min(scale, naturalScale);
    }
    sx = sy = scale;
  }
  const tokens = objectPosition.trim().split(/\s+/);
  if (tokens.length === 1) tokens.push('50%');
  const x = position(tokens[0], width - crop.width * sx, 'x') - crop.x * sx;
  const y = position(tokens[1], height - crop.height * sy, 'y') - crop.y * sy;
  return {sx, sy, x, y, view: {x: -x / sx, y: -y / sy, width: width / sx, height: height / sy}};
}

export function projectedBounds(bounds, transform, width, height) {
  const left = Math.max(0, Math.floor(bounds.x * transform.sx + transform.x));
  const top = Math.max(0, Math.floor(bounds.y * transform.sy + transform.y));
  const right = Math.min(width, Math.ceil((bounds.x + bounds.width) * transform.sx + transform.x));
  const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height) * transform.sy + transform.y));
  return {left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
}

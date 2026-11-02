import { deflateSync } from "node:zlib";

// Small, dependency-free PNG writer for original synthetic demo artwork.
// The generated images are intentionally abstract (gradient + simple shapes),
// never photographs and never labelled as panoramas.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/**
 * @param {{width?: number, height?: number, palette: [number, number, number][], variant?: number}} input
 */
export function renderDemoPng(input) {
  const width = input.width ?? 360;
  const height = input.height ?? 240;
  const palette = input.palette;
  const variant = input.variant ?? 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 4 + 1);
    raw[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const left = palette[variant % palette.length];
      const right = palette[(variant + 1) % palette.length];
      const t = (x / width) * 0.65 + (y / height) * 0.35;
      let r = mix(left[0], right[0], t);
      let g = mix(left[1], right[1], t);
      let b = mix(left[2], right[2], t);

      // Soft circular "plate" motif, decorative only.
      const dx = x - width * 0.5;
      const dy = y - height * 0.52;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.min(width, height) * 0.3;
      if (distance < radius) {
        const rim = distance > radius - 6;
        const shade = rim ? 0.72 : 0.9;
        r = Math.round(r * shade + 245 * (1 - shade));
        g = Math.round(g * shade + 238 * (1 - shade));
        b = Math.round(b * shade + 220 * (1 - shade));
      }
      if (distance < radius * 0.42) {
        r = Math.round(r * 0.82 + 80);
        g = Math.round(g * 0.82 + 60);
        b = Math.round(b * 0.82 + 40);
      }

      const pixel = offset + 1 + x * 4;
      raw[pixel] = r;
      raw[pixel + 1] = g;
      raw[pixel + 2] = b;
      raw[pixel + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

export const DEMO_PALETTES = {
  breakfast: [[222, 176, 96], [150, 84, 44]],
  salad: [[116, 166, 92], [56, 110, 62]],
  fish: [[96, 158, 184], [40, 90, 120]],
  chicken: [[206, 144, 78], [142, 82, 42]],
  pasta: [[220, 190, 140], [166, 116, 66]],
  dessert: [[232, 172, 182], [176, 106, 128]],
  drink: [[146, 202, 196], [70, 142, 150]],
  coffee: [[150, 112, 84], [84, 58, 42]],
  fruit: [[226, 170, 88], [150, 94, 46]],
  market: [[112, 158, 204], [58, 92, 142]]
};

// Pairing-only QR Model 2, version 10-L, byte mode, mask 0. Menu QR stays unchanged.
const VERSION = 10;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 274;
const BLOCK_LENGTHS = [68, 68, 69, 69];
const ECC_CODEWORDS = 18;
const MAX_BYTES = 271;

const gfExp = new Uint8Array(512);
const gfLog = new Uint8Array(256);
{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    gfExp[index] = value;
    gfLog[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < gfExp.length; index += 1) gfExp[index] = gfExp[index - 255] ?? 0;
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  const sum = (gfLog[left] ?? 0) + (gfLog[right] ?? 0);
  return gfExp[sum] ?? 0;
}

function setModule(modules: (boolean | null)[][], row: number, col: number, value: boolean) {
  const line = modules[row];
  if (line) line[col] = value;
}

function reedSolomonGenerator(degree: number): number[] {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(result.length + 1).fill(0);
    for (let position = 0; position < result.length; position += 1) {
      next[position] = (next[position] ?? 0) ^ (result[position] ?? 0);
      next[position + 1] = (next[position + 1] ?? 0) ^ gfMultiply(result[position] ?? 0, gfExp[index] ?? 0);
    }
    result = next;
  }
  return result;
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree);
  const working = [...data, ...new Array<number>(degree).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = working[index];
    if (!factor) continue;
    for (let position = 0; position < generator.length; position += 1) {
      working[index + position] = (working[index + position] ?? 0) ^ gfMultiply(generator[position] ?? 0, factor);
    }
  }
  return working.slice(-degree);
}

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}

function createCodewords(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > MAX_BYTES) throw new Error("Eşleştirme bilgisi QR kapasitesini aşıyor.");

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 16);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacityBits = DATA_CODEWORDS * 8;
  for (let index = 0; index < Math.min(4, capacityBits - bits.length); index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | (bits[index + offset] ?? 0);
    data.push(byte);
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);

  let offset = 0;
  const blocks = BLOCK_LENGTHS.map(length => {
    const block = data.slice(offset, offset + length);
    offset += length;
    return block;
  });
  const ecc = blocks.map((block) => reedSolomonRemainder(block, ECC_CODEWORDS));
  const result: number[] = [];
  for (let index = 0; index < Math.max(...BLOCK_LENGTHS); index += 1) {
    for (const block of blocks) if (index < block.length) result.push(block[index]!);
  }
  for (let index = 0; index < ECC_CODEWORDS; index += 1) {
    for (const block of ecc) result.push(block[index] ?? 0);
  }
  return result;
}

function finder(modules: (boolean | null)[][], row: number, col: number) {
  for (let y = -1; y <= 7; y += 1) {
    if (row + y < 0 || row + y >= SIZE) continue;
    for (let x = -1; x <= 7; x += 1) {
      if (col + x < 0 || col + x >= SIZE) continue;
      const line = modules[row + y];
      if (!line) continue;
      line[col + x] = (
        (y >= 0 && y <= 6 && (x === 0 || x === 6))
        || (x >= 0 && x <= 6 && (y === 0 || y === 6))
        || (y >= 2 && y <= 4 && x >= 2 && x <= 4)
      );
    }
  }
}

function alignment(modules: (boolean | null)[][], row: number, col: number) {
  const anchor = modules[row]?.[col];
  if (anchor !== null && anchor !== undefined) return;
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) setModule(modules, row + y, col + x, Math.max(Math.abs(y), Math.abs(x)) !== 1);
  }
}

function bchDigit(input: number): number {
  let value = input;
  let digit = 0;
  while (value !== 0) {
    digit += 1;
    value >>>= 1;
  }
  return digit;
}

function formatBits(mask: number): number {
  const generator = 0x537;
  const data = (1 << 3) | mask;
  let bits = data << 10;
  while (bchDigit(bits) - bchDigit(generator) >= 0) bits ^= generator << (bchDigit(bits) - bchDigit(generator));
  return ((data << 10) | bits) ^ 0x5412;
}

function placeFormat(modules: (boolean | null)[][], mask: number) {
  const bits = formatBits(mask);
  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    if (index < 6) setModule(modules, index, 8, dark);
    else if (index < 8) setModule(modules, index + 1, 8, dark);
    else setModule(modules, SIZE - 15 + index, 8, dark);

    if (index < 8) setModule(modules, 8, SIZE - index - 1, dark);
    else if (index < 9) setModule(modules, 8, 7, dark);
    else setModule(modules, 8, 15 - index - 1, dark);
  }
  setModule(modules, SIZE - 8, 8, true);
}

function createMatrix(text: string): boolean[][] {
  const modules: (boolean | null)[][] = Array.from({ length: SIZE }, () => Array<boolean | null>(SIZE).fill(null));
  finder(modules, 0, 0);
  finder(modules, SIZE - 7, 0);
  finder(modules, 0, SIZE - 7);

  for (const row of [6, 28, 50]) for (const col of [6, 28, 50]) alignment(modules, row, col);
  for (let index = 8; index < SIZE - 8; index += 1) {
    if (modules[index]?.[6] === null) setModule(modules, index, 6, index % 2 === 0);
    if (modules[6]?.[index] === null) setModule(modules, 6, index, index % 2 === 0);
  }
  let versionBits = VERSION << 12;
  while (bchDigit(versionBits) >= bchDigit(0x1f25)) versionBits ^= 0x1f25 << (bchDigit(versionBits) - bchDigit(0x1f25));
  versionBits |= VERSION << 12;
  for (let index = 0; index < 18; index += 1) {
    const dark = ((versionBits >>> index) & 1) === 1;
    const a = Math.floor(index / 3), b = index % 3 + SIZE - 11;
    setModule(modules, a, b, dark);
    setModule(modules, b, a, dark);
  }
  placeFormat(modules, 0);

  const codewords = createCodewords(text);
  let row = SIZE - 1;
  let direction = -1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetCol = col - offset;
        const occupied = modules[row]?.[targetCol];
        if (occupied !== null && occupied !== undefined) continue;
        let dark = byteIndex < codewords.length && (((codewords[byteIndex] ?? 0) >>> bitIndex) & 1) === 1;
        if ((row + targetCol) % 2 === 0) dark = !dark;
        setModule(modules, row, targetCol, dark);
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= SIZE) {
        row -= direction;
        direction *= -1;
        break;
      }
    }
  }
  return modules.map((line) => line.map(Boolean));
}

export function createSecurePairingQrSvg(text: string): string {
  const matrix = createMatrix(text);
  const quiet = 4;
  const viewSize = SIZE + quiet * 2;
  const cells: string[] = [];
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) cells.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells.join("")}</g></svg>`;
}

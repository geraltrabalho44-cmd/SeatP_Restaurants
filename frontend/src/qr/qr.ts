// A QR code generator, written out in full so no library is needed. It encodes text as bytes (UTF-8)
// with error correction level M, in versions 1 to 10 (up to 213 bytes: a web link fits easily).
// The steps follow the QR standard (ISO/IEC 18004): bytes -> Reed-Solomon error correction per block,
// blocks interleaved -> placed in a zigzag around the fixed patterns -> the best of 8 masks chosen by the
// standard's penalty score -> format and version bits written. `qr.test.ts` reads the result back with an
// independent reader, and a real scanner was used to check the output once.

export interface QrCode {
  version: number;
  size: number;
  /** modules[y][x] is true for a dark module. */
  modules: boolean[][];
}

/** Per version: [data codewords per block of the first group, blocks, data per block of the second group, blocks, EC codewords per block]. */
const BLOCKS: Record<number, [number, number, number, number, number]> = {
  1: [16, 1, 0, 0, 10],
  2: [28, 1, 0, 0, 16],
  3: [44, 1, 0, 0, 26],
  4: [32, 2, 0, 0, 18],
  5: [43, 2, 0, 0, 24],
  6: [27, 4, 0, 0, 16],
  7: [31, 4, 0, 0, 18],
  8: [38, 2, 39, 2, 22],
  9: [36, 3, 37, 2, 22],
  10: [43, 4, 44, 1, 26],
};

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

export const MAX_BYTES = 213;
const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** How many data bytes fit in a version (byte mode, level M). */
export function capacity(version: number): number {
  const [d1, n1, d2, n2] = BLOCKS[version] as [number, number, number, number, number];
  const dataBits = (d1 * n1 + d2 * n2) * 8;
  return Math.floor((dataBits - 4 - (version < 10 ? 8 : 16)) / 8);
}

// ---------------------------------------------------------------- Reed-Solomon over GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
})();

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : (EXP[(LOG[a] as number) + (LOG[b] as number)] as number);
}

/** The generator polynomial of the given degree, highest term first, without the leading 1. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] as number) ^ (poly[j] as number);
      next[j + 1] = (next[j + 1] as number) ^ multiply(poly[j] as number, EXP[i] as number);
    }
    poly = next;
  }
  return poly.slice(1);
}

function errorCorrection(data: number[], degree: number): number[] {
  const divisor = generator(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    if (factor !== 0) for (let i = 0; i < degree; i++) result[i] = (result[i] as number) ^ multiply(divisor[i] as number, factor);
  }
  return result;
}

// ---------------------------------------------------------------- the data stream

function dataCodewords(bytes: number[], version: number): number[] {
  const [d1, n1, d2, n2] = BLOCKS[version] as [number, number, number, number, number];
  const total = d1 * n1 + d2 * n2;
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, total * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; words.length < total; pad = pad === 0xec ? 0x11 : 0xec) words.push(pad);
  return words;
}

/** Data and error correction, split into blocks and interleaved as the standard says. */
function codewords(data: number[], version: number): number[] {
  const [d1, n1, d2, n2, ec] = BLOCKS[version] as [number, number, number, number, number];
  const blocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < n1 + n2; i++) {
    const length = i < n1 ? d1 : d2;
    blocks.push(data.slice(at, at + length));
    at += length;
  }
  const parity = blocks.map((block) => errorCorrection(block, ec));
  const out: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const block of blocks) if (i < block.length) out.push(block[i] as number);
  for (let i = 0; i < ec; i++) for (const p of parity) out.push(p[i] as number);
  return out;
}

// ---------------------------------------------------------------- the grid

interface Grid {
  size: number;
  modules: boolean[][];
  fixed: boolean[][];
}

function emptyGrid(version: number): Grid {
  const size = 17 + 4 * version;
  const make = (): boolean[][] => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, modules: make(), fixed: make() };
}

function setFixed(grid: Grid, x: number, y: number, dark: boolean): void {
  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return;
  (grid.modules[y] as boolean[])[x] = dark;
  (grid.fixed[y] as boolean[])[x] = true;
}

function drawFinder(grid: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFixed(grid, cx + dx, cy + dy, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(grid: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFixed(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
}

function drawFixedPatterns(grid: Grid, version: number): void {
  for (let i = 0; i < grid.size; i++) {
    setFixed(grid, 6, i, i % 2 === 0);
    setFixed(grid, i, 6, i % 2 === 0);
  }
  drawFinder(grid, 3, 3);
  drawFinder(grid, grid.size - 4, 3);
  drawFinder(grid, 3, grid.size - 4);
  const positions = ALIGNMENT[version] as number[];
  const last = positions.length - 1;
  positions.forEach((cy, row) => {
    positions.forEach((cx, col) => {
      const overlapsFinder = (row === 0 && col === 0) || (row === 0 && col === last) || (row === last && col === 0);
      if (!overlapsFinder) drawAlignment(grid, cx, cy);
    });
  });
  drawFormat(grid, 0, 0); // reserves the format area; the real bits are written per mask
  drawVersion(grid, version);
}

const bit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

function drawFormat(grid: Grid, mask: number, level: number): void {
  const data = (level << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i++) setFixed(grid, 8, i, bit(bits, i));
  setFixed(grid, 8, 7, bit(bits, 6));
  setFixed(grid, 8, 8, bit(bits, 7));
  setFixed(grid, 7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) setFixed(grid, 14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) setFixed(grid, grid.size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) setFixed(grid, 8, grid.size - 15 + i, bit(bits, i));
  setFixed(grid, 8, grid.size - 8, true); // the one module that is always dark
}

function drawVersion(grid: Grid, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const a = grid.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFixed(grid, a, b, bit(bits, i));
    setFixed(grid, b, a, bit(bits, i));
  }
}

function placeData(grid: Grid, words: number[]): void {
  const bits: boolean[] = [];
  for (const word of words) for (let i = 7; i >= 0; i--) bits.push(bit(word, i));
  let at = 0;
  for (let right = grid.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the timing column is skipped
    for (let vertical = 0; vertical < grid.size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? grid.size - 1 - vertical : vertical;
        if (!(grid.fixed[y] as boolean[])[x] && at < bits.length) {
          (grid.modules[y] as boolean[])[x] = bits[at] as boolean;
          at++;
        }
      }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(grid: Grid, mask: number): void {
  const test = MASKS[mask] as (x: number, y: number) => boolean;
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!(grid.fixed[y] as boolean[])[x] && test(x, y)) (grid.modules[y] as boolean[])[x] = !(grid.modules[y] as boolean[])[x];
    }
  }
}

// ---------------------------------------------------------------- choosing the mask

function penalty(grid: Grid): number {
  const { size, modules } = grid;
  let score = 0;
  const cell = (x: number, y: number): boolean => (modules[y] as boolean[])[x] as boolean;
  // Runs of five or more of one colour, in rows and columns.
  for (const horizontal of [true, false]) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const same = horizontal ? cell(b, a) === cell(b - 1, a) : cell(a, b) === cell(a, b - 1);
        if (same) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score++;
        } else run = 1;
      }
    }
  }
  // 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (cell(x, y) === cell(x + 1, y) && cell(x, y) === cell(x, y + 1) && cell(x, y) === cell(x + 1, y + 1)) score += 3;
  // Patterns that look like a finder (1:1:3:1:1 with a light margin).
  const pattern = [true, false, true, true, true, false, true];
  const matches = (read: (i: number) => boolean, start: number): boolean => {
    const before = [0, 1, 2, 3].every((i) => start - 1 - i < 0 || !read(start - 1 - i));
    const after = [0, 1, 2, 3].every((i) => start + 7 + i >= size || !read(start + 7 + i));
    return pattern.every((value, i) => read(start + i) === value) && (before || after);
  };
  for (let a = 0; a < size; a++) {
    for (let start = 0; start + 7 <= size; start++) {
      if (matches((i) => cell(i, a), start)) score += 40;
      if (matches((i) => cell(a, i), start)) score += 40;
    }
  }
  // Balance of dark and light.
  let dark = 0;
  for (const row of modules) for (const value of row) if (value) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

const LEVEL_M = 0;

// ---------------------------------------------------------------- the whole code

export function encodeQr(text: string): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = VERSIONS.find((v) => bytes.length <= capacity(v));
  if (version === undefined) throw new RangeError(`A QR code here holds up to ${MAX_BYTES} bytes; this text has ${bytes.length}.`);
  const words = codewords(dataCodewords(bytes, version), version);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = emptyGrid(version);
    drawFixedPatterns(grid, version);
    placeData(grid, words);
    applyMask(grid, mask);
    drawFormat(grid, mask, LEVEL_M);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }
  const grid = best as Grid;
  return { version, size: grid.size, modules: grid.modules };
}

// ---------------------------------------------------------------- drawing it

/** The dark modules as one SVG path (a row of dark modules is one rectangle), with a quiet zone. */
export function qrPath(code: QrCode, margin = 4): { d: string; side: number } {
  const parts: string[] = [];
  code.modules.forEach((row, y) => {
    let x = 0;
    while (x < code.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < code.size && row[end]) end++;
      parts.push(`M${x + margin} ${y + margin}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  return { d: parts.join(""), side: code.size + 2 * margin };
}

/** A complete SVG file for printing: black on white, sized by the caller (the picture scales without blur). */
export function qrSvg(text: string, label = "QR code"): string {
  const { d, side } = qrPath(encodeQr(text));
  const safe = label.replace(/[&<>"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 8}" height="${side * 8}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

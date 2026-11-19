// The QR generator is checked three ways: known answers from the standard, an independent reader that
// takes the picture apart again (format bits, mask, zigzag, error-correction check, text), and sizes.
// A real scanner (OpenCV) was also pointed at generated codes once, outside the project.
import { describe, expect, it } from "vitest";
import { MAX_BYTES, capacity, encodeQr, qrPath, qrSvg } from "./qr";
import type { QrCode } from "./qr";

// ---- the reader: written separately from the generator, from the standard's description -------------

const FORMAT_M = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
const BLOCKS: Record<number, [number, number, number, number, number]> = {
  1: [16, 1, 0, 0, 10], 2: [28, 1, 0, 0, 16], 3: [44, 1, 0, 0, 26], 4: [32, 2, 0, 0, 18], 5: [43, 2, 0, 0, 24],
  6: [27, 4, 0, 0, 16], 7: [31, 4, 0, 0, 18], 8: [38, 2, 39, 2, 22], 9: [36, 3, 37, 2, 22], 10: [43, 4, 44, 1, 26],
}; // fmt: skip

function readFormat(code: QrCode): { mask: number; copiesAgree: boolean } {
  const m = code.modules;
  const at = (x: number, y: number): string => ((m[y] as boolean[])[x] ? "1" : "0");
  // The 15 format bits as the standard lays them out, most significant first.
  const top = [at(8, 0), at(8, 1), at(8, 2), at(8, 3), at(8, 4), at(8, 5), at(8, 7), at(8, 8), at(7, 8), at(5, 8), at(4, 8), at(3, 8), at(2, 8), at(1, 8), at(0, 8)];
  const n = code.size;
  const other = [at(n - 1, 8), at(n - 2, 8), at(n - 3, 8), at(n - 4, 8), at(n - 5, 8), at(n - 6, 8), at(n - 7, 8), at(n - 8, 8), at(8, n - 7), at(8, n - 6), at(8, n - 5), at(8, n - 4), at(8, n - 3), at(8, n - 2), at(8, n - 1)];
  // top[i] is bit i (least significant first), so reverse to compare with the printed tables.
  const a = [...top].reverse().join("");
  const b = [...other].reverse().join("");
  const mask = FORMAT_M.indexOf(a);
  return { mask, copiesAgree: a === b };
}

const MASK_TESTS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Which modules carry data: everything except the fixed patterns, worked out again here. */
function dataMap(version: number, size: number): boolean[][] {
  const isData = Array.from({ length: size }, () => new Array<boolean>(size).fill(true));
  const block = (x0: number, y0: number, w: number, h: number): void => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (y >= 0 && x >= 0 && y < size && x < size) (isData[y] as boolean[])[x] = false;
  };
  block(0, 0, 9, 9); // top-left finder, separator and format
  block(size - 8, 0, 8, 9); // top-right
  block(0, size - 8, 9, 8); // bottom-left
  block(6, 0, 1, size); // timing column
  block(0, 6, size, 1); // timing row
  const centres = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][version - 1] ?? [];
  const last = centres.length - 1;
  centres.forEach((cy, r) =>
    centres.forEach((cx, c) => {
      if (!((r === 0 && c === 0) || (r === 0 && c === last) || (r === last && c === 0))) block((cx as number) - 2, (cy as number) - 2, 5, 5);
    }),
  );
  if (version >= 7) {
    block(size - 11, 0, 3, 6);
    block(0, size - 11, 6, 3);
  }
  return isData;
}

function gf(): { mul: (a: number, b: number) => number; exp: number[] } {
  const exp: number[] = new Array(512).fill(0);
  const log: number[] = new Array(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x = x << 1;
    if (x > 255) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255] as number;
  return { exp, mul: (a, b) => (a && b ? (exp[(log[a] as number) + (log[b] as number)] as number) : 0) };
}

/** Reads a code back: returns the text, and whether every block's error-correction check is zero. */
function read(code: QrCode): { text: string; checksOk: boolean; version: number; mask: number } {
  const { mask } = readFormat(code);
  expect(mask).toBeGreaterThanOrEqual(0);
  const isData = dataMap(code.version, code.size);
  const bits: number[] = [];
  for (let right = code.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < code.size; step++) {
      const y = upward ? code.size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (!(isData[y] as boolean[])[x]) continue;
        const dark = (code.modules[y] as boolean[])[x] as boolean;
        bits.push((MASK_TESTS[mask] as (x: number, y: number) => boolean)(x, y) ? (dark ? 0 : 1) : dark ? 1 : 0);
      }
    }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  const [d1, n1, d2, n2, ec] = BLOCKS[code.version] as [number, number, number, number, number];
  const total = d1 * n1 + d2 * n2 + ec * (n1 + n2);
  const used = words.slice(0, total);
  const lengths = [...new Array<number>(n1).fill(d1), ...new Array<number>(n2).fill(d2)];
  const blocks: number[][] = lengths.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(d1, d2); i++) lengths.forEach((length, b) => { if (i < length) (blocks[b] as number[]).push(used[at++] as number); }); // fmt: skip
  const parity: number[][] = lengths.map(() => []);
  for (let i = 0; i < ec; i++) lengths.forEach((_l, b) => (parity[b] as number[]).push(used[at++] as number));
  // A block is right when the whole codeword, read as a polynomial, is zero at every power of 2 up to ec.
  const { mul, exp } = gf();
  let checksOk = true;
  blocks.forEach((data, b) => {
    const word = [...data, ...(parity[b] as number[])];
    for (let k = 0; k < ec; k++) {
      let sum = 0;
      for (const c of word) sum = mul(sum, exp[k] as number) ^ c;
      if (sum !== 0) checksOk = false;
    }
  });
  const stream = blocks.flat();
  const asBits = stream.map((w) => w.toString(2).padStart(8, "0")).join("");
  expect(asBits.slice(0, 4)).toBe("0100"); // byte mode
  const countBits = code.version < 10 ? 8 : 16;
  const count = parseInt(asBits.slice(4, 4 + countBits), 2);
  const text: number[] = [];
  for (let i = 0; i < count; i++) text.push(parseInt(asBits.slice(4 + countBits + i * 8, 4 + countBits + i * 8 + 8), 2));
  return { text: new TextDecoder().decode(new Uint8Array(text)), checksOk, version: code.version, mask };
}

describe("known answers from the standard", () => {
  it("the format bits for level M are the ones the standard prints, for every mask", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const code = encodeQr(`https://x.example/${"a".repeat(i)}?offer=ABCD${i}`);
      const { mask, copiesAgree } = readFormat(code);
      expect(mask).toBeGreaterThanOrEqual(0); // a known pattern, never a made-up one
      expect(copiesAgree).toBe(true); // both copies carry the same bits
      seen.add(mask);
    }
    expect(seen.size).toBeGreaterThan(1); // the best mask is really chosen, not always the same one
  });

  it("the fixed patterns are where they must be", () => {
    const { modules: m, size } = encodeQr("https://seatplan.example/r/abc?offer=K7M3QX9P");
    const at = (x: number, y: number): boolean => (m[y] as boolean[])[x] as boolean;
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
      expect(at(cx, cy)).toBe(true); // the finder's centre
      expect(at(cx - 2, cy)).toBe(false); // the light ring
      expect(at(cx - 3, cy)).toBe(true); // the dark ring
      // The light separator, on the side that faces the inside of the code.
      expect(at(cx + (cx < size / 2 ? 4 : -4), cy)).toBe(false);
    }
    expect(at(8, size - 8)).toBe(true); // the dark module
    for (let i = 8; i < size - 8; i++) expect(at(i, 6)).toBe(i % 2 === 0); // timing
    for (let i = 8; i < size - 8; i++) expect(at(6, i)).toBe(i % 2 === 0);
  });

  it("holds the sizes the standard gives for level M", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(capacity)).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
    expect(encodeQr("a".repeat(14)).size).toBe(21);
    expect(encodeQr("a".repeat(15)).size).toBe(25);
    expect(encodeQr("a".repeat(62)).size).toBe(33);
    expect(encodeQr("a".repeat(63)).size).toBe(37);
    expect(encodeQr("a".repeat(213)).size).toBe(57);
  });
});

describe("reading a generated code back", () => {
  const TEXTS = [
    "https://seatplan.example/r/abc?offer=K7M3QX9P",
    "https://seatplan.vercel.app/restaurants/tasca-do-bairro?offer=ZZZZZZZZ",
    "A",
    "",
    "https://example.com/olá/ç?x=1&y=2 ✓",
    "x".repeat(MAX_BYTES),
  ];
  for (const text of TEXTS) {
    it(`gives the text back, with every error-correction check passing: ${text.slice(0, 30)}…`, () => {
      const result = read(encodeQr(text));
      expect(result.checksOk).toBe(true);
      expect(result.text).toBe(text);
    });
  }

  it("every version from 1 to 10 reads back", () => {
    for (let version = 1; version <= 10; version++) {
      const length = version === 1 ? 5 : capacity(version - 1) + 1;
      const text = Array.from({ length }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
      const code = encodeQr(text);
      expect(code.version).toBe(version);
      expect(read(code)).toMatchObject({ text, checksOk: true, version });
    }
  });

  it("a flipped module is caught by the checks, so the reader really is checking", () => {
    const code = encodeQr("https://seatplan.example/r/abc?offer=K7M3QX9P");
    const clean = read(code);
    expect(clean.checksOk).toBe(true);
    const row = code.modules[20] as boolean[];
    row[code.size - 1] = !row[code.size - 1];
    expect(read(code).checksOk).toBe(false);
  });
});

describe("limits and the picture", () => {
  it("refuses text that cannot fit, and says so", () => {
    expect(() => encodeQr("x".repeat(MAX_BYTES + 1))).toThrow(/up to 213 bytes/);
  });

  it("is the same every time for the same text", () => {
    expect(encodeQr("https://a.example/?offer=AAAA2222").modules).toEqual(encodeQr("https://a.example/?offer=AAAA2222").modules);
  });

  it("draws a path of the dark modules with a four-module quiet zone", () => {
    const code = encodeQr("A");
    const { d, side } = qrPath(code);
    expect(side).toBe(code.size + 8);
    expect(d.startsWith("M")).toBe(true);
    // One rectangle per run of dark modules, and none outside the grid.
    const rects = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)];
    expect(rects.length).toBeGreaterThan(10);
    for (const [, x, y, w] of rects) {
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(side - 4);
      expect(Number(y)).toBeLessThan(side - 4);
    }
  });

  it("makes a standalone SVG file, black on white, with a label that cannot break the markup", () => {
    const svg = qrSvg("https://a.example/?offer=AAAA2222", 'Offer "X" <b>');
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
    expect(svg).toContain('aria-label="Offer X b"');
    expect(svg).not.toContain("<b>");
  });
});

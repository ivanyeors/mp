/**
 * Minimal byte-mode QR encoder — pure, zero-dependency. Renders a scannable QR
 * of the referral link for the partner share card without adding an npm dep or
 * hitting an external QR service (CSP / offline requirement).
 *
 * Scope (ponytail): EC level L, single data block, versions 1–5, auto-selected.
 * That caps the payload at ~106 bytes; a referral URL is ~40 bytes, so this is
 * ample and it lets us skip block interleaving AND version-info modules (v<7) —
 * the two most bug-prone parts of a QR encoder.
 * ponytail: extend VERSIONS + add block interleaving only if a >106-byte
 * payload is ever needed here.
 *
 * Correctness is pinned by qr-matrix.check.ts (GF round-trip, RS divisibility,
 * known format string, finder patterns). Run: npx tsx lib/qr/qr-matrix.check.ts
 */

// EC level L. `align` = center of the single alignment pattern (0 = none, v1).
type VersionSpec = { dataCodewords: number; ecCodewords: number; align: number };
const VERSIONS: (VersionSpec | null)[] = [
  null,
  { dataCodewords: 19, ecCodewords: 7, align: 0 },
  { dataCodewords: 34, ecCodewords: 10, align: 18 },
  { dataCodewords: 55, ecCodewords: 15, align: 22 },
  { dataCodewords: 80, ecCodewords: 20, align: 26 },
  { dataCodewords: 108, ecCodewords: 26, align: 30 },
];
const MAX_VERSION = 5;

// --- GF(256), primitive polynomial 0x11d ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
  return out;
}

/** Reed-Solomon generator polynomial of degree `n` (product of (x - α^i)). */
export function rsGenerator(n: number): number[] {
  let gen = [1];
  for (let i = 0; i < n; i++) gen = polyMul(gen, [1, EXP[i]]);
  return gen;
}

/** RS error-correction codewords (remainder of data·x^ecLen ÷ generator). */
export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

/** BCH(15,5) format information for a 5-bit payload (EC level bits << 3 | mask). */
export function formatInfo(data5: number): number {
  let d = data5 << 10;
  const g = 0x537;
  for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= g << (i - 10);
  return (((data5 << 10) | (d & 0x3ff)) ^ 0x5412) & 0x7fff;
}
const EC_LEVEL_L = 0b01;

function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    // byte mode overhead = 4 (mode) + 8 (count) bits = 1.5 codewords → +2 bytes.
    if (byteLen + 2 <= VERSIONS[v]!.dataCodewords) return v;
  }
  throw new Error(`Payload too long for QR v${MAX_VERSION} (${byteLen} bytes)`);
}

function encodeDataCodewords(bytes: Uint8Array, spec: VersionSpec): number[] {
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, 8); // char count (byte mode, v1–9 = 8 bits)
  for (const b of bytes) put(b, 8);
  const capacityBits = spec.dataCodewords * 8;
  put(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    cw.push(byte);
  }
  const pad = [0xec, 0x11];
  while (cw.length < spec.dataCodewords) cw.push(pad[(cw.length - bits.length / 8) % 2]);
  return cw;
}

type MaskFn = (r: number, c: number) => boolean;
const MASKS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatCells(size: number): { r: number; c: number; bit: number }[] {
  const cells: { r: number; c: number; bit: number }[] = [];
  for (let i = 0; i < 15; i++) {
    const vr = i < 6 ? i : i < 8 ? i + 1 : size - 15 + i;
    cells.push({ r: vr, c: 8, bit: i }); // vertical copy (col 8)
    const hc = i < 8 ? size - 1 - i : i < 9 ? 7 : 15 - 1 - i;
    cells.push({ r: 8, c: hc, bit: i }); // horizontal copy (row 8)
  }
  return cells;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const runScore = (get: (i: number, j: number) => boolean) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (get(i, j) === get(i, j - 1)) run++;
        else {
          if (run >= 5) s += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) s += 3 + (run - 5);
    }
    return s;
  };
  score += runScore((i, j) => m[i][j]);
  score += runScore((i, j) => m[j][i]);

  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
    }

  const p1 = [true, false, true, true, true, false, true, false, false, false, false];
  const p2 = [false, false, false, false, true, false, true, true, true, false, true];
  const lineHas = (arr: boolean[]) => {
    let s = 0;
    for (let k = 0; k + 11 <= arr.length; k++) {
      let a = true;
      let b = true;
      for (let t = 0; t < 11; t++) {
        if (arr[k + t] !== p1[t]) a = false;
        if (arr[k + t] !== p2[t]) b = false;
      }
      if (a || b) s += 40;
    }
    return s;
  };
  for (let i = 0; i < n; i++) {
    score += lineHas(m[i]);
    score += lineHas(m.map((r) => r[i]));
  }

  let dark = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (m[i][j]) dark++;
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Build a QR module matrix (true = dark) for `text`. Auto-selects version/mask. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const spec = VERSIONS[version]!;
  const size = 17 + version * 4;

  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const setF = (r: number, c: number, val: boolean) => {
    modules[r][c] = val;
    reserved[r][c] = true;
  };

  // Finder patterns + separators (3 corners).
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const border = r === -1 || r === 7 || c === -1 || c === 7;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setF(rr, cc, border ? false : ring || core);
      }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    if (modules[6][i] === null) setF(6, i, i % 2 === 0);
    if (modules[i][6] === null) setF(i, 6, i % 2 === 0);
  }

  // Single alignment pattern (v2–5); its (align,align) center never overlaps a finder.
  if (spec.align) {
    const a = spec.align;
    for (let r = -2; r <= 2; r++)
      for (let c = -2; c <= 2; c++)
        setF(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }

  // Dark module.
  setF(size - 8, 8, true);

  // Reserve the format-info cells before data placement.
  const cells = formatCells(size);
  for (const { r, c } of cells) reserved[r][c] = true;

  // Map data + EC codeword bits in the standard upward/downward zigzag.
  const data = encodeDataCodewords(bytes, spec);
  const codewords = data.concat(rsEncode(data, spec.ecCodewords));
  const bitStream: number[] = [];
  for (const cw of codewords) for (let b = 7; b >= 0; b--) bitStream.push((cw >> b) & 1);

  let idx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip vertical timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const cc = col - dc;
        if (reserved[row][cc]) continue;
        modules[row][cc] = (idx < bitStream.length ? bitStream[idx] : 0) === 1;
        idx++;
      }
    }
    upward = !upward;
  }

  const base: boolean[][] = modules.map((row) => row.map((v) => v === true));

  // Try all 8 masks, pick lowest penalty.
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = base.map((r) => r.slice());
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!reserved[r][c] && MASKS[mask](r, c)) cand[r][c] = !cand[r][c];
    const fmt = formatInfo((EC_LEVEL_L << 3) | mask);
    for (const { r, c, bit } of cells) cand[r][c] = ((fmt >> bit) & 1) === 1;
    const s = penalty(cand);
    if (s < bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return best!;
}

/**
 * QR encoder self-check — pins the bug-prone pieces without shipping a decoder.
 * Run: npx tsx lib/qr/qr-matrix.check.ts
 */
import assert from "node:assert/strict";
import { formatInfo, qrMatrix, rsEncode, rsGenerator } from "./qr-matrix";

// --- Known BCH(15,5) format string: EC level L, mask 0 → 0x77C4 (ISO 18004). ---
assert.equal(formatInfo((0b01 << 3) | 0), 0x77c4, "format info L/mask0");

// --- RS: (data + ecc) must be divisible by the generator (remainder 0). ---
// Re-dividing the full codeword polynomial by the generator yields all zeros
// iff the ecc are a valid RS remainder — catches GF/generator bugs.
function gfExpLog() {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return { exp, log };
}
const { exp, log } = gfExpLog();
// GF round-trip: log(exp(i)) === i for the multiplicative group.
for (let i = 0; i < 255; i++) assert.equal(log[exp[i]], i, `gf round-trip ${i}`);

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);
const data = [0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06, 0x27, 0x26, 0x96, 0xc6];
const ecc = rsEncode(data, 10);
assert.equal(ecc.length, 10, "ecc length");
const gen = rsGenerator(10);
// Polynomial long division of (data<<10 | ecc) by gen → remainder must be 0.
const full = data.concat(ecc);
const work = full.slice();
for (let i = 0; i < data.length; i++) {
  const coef = work[i];
  if (coef === 0) continue;
  for (let j = 0; j < gen.length; j++) work[i + j] ^= mul(gen[j], coef);
}
assert.ok(
  work.slice(data.length).every((v) => v === 0),
  "full codeword divisible by generator",
);

// --- Structural: correct size + three finder patterns present. ---
const url = "https://custom.mpillow.com/?ref=ABCD2345";
const m = qrMatrix(url);
assert.ok(m.length >= 21 && m.length === m[0].length, "square matrix");
const isFinder = (r0: number, c0: number) => {
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (m[r0 + r][c0 + c] !== (ring || core)) return false;
    }
  return true;
};
const n = m.length;
assert.ok(isFinder(0, 0), "top-left finder");
assert.ok(isFinder(0, n - 7), "top-right finder");
assert.ok(isFinder(n - 7, 0), "bottom-left finder");

// --- Determinism: same input → identical matrix. ---
assert.deepEqual(qrMatrix(url), m, "deterministic");

console.log("qr-matrix.check.ts: ok");

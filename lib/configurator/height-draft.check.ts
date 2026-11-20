import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { displayHeight, heightInchesRoundTrip, normalizeHeightDraft } from "./height-draft";
import { CM_PER_INCH, roundCm } from "@/lib/rules-engine/units";

assert.equal(normalizeHeightDraft("m", "1."), null);
assert.equal(normalizeHeightDraft("m", "1.68"), "168");
assert.equal(normalizeHeightDraft("cm", "168.5"), "168.5");
assert.equal(normalizeHeightDraft("in", "66"), String(Math.round(66 * CM_PER_INCH * 10) / 10));
assert.equal(normalizeHeightDraft("m", ""), null);
assert.equal(normalizeHeightDraft("cm", "79"), null);
assert.equal(normalizeHeightDraft("m", "2.51"), null);
assert.equal(displayHeight("m", "168"), "1.68");
assert.equal(displayHeight("cm", "168"), "168");
assert.equal(displayHeight("in", String(66 * CM_PER_INCH)), "66");
assert.equal(heightInchesRoundTrip(66), roundCm(66 * CM_PER_INCH));

const client = readFileSync(
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "utf8",
);
assert.match(client, /heightUnit: "in"/);
assert.match(client, /TabsTrigger value="in"/);
assert.match(client, /TabsTrigger value="cm"/);
assert.match(client, /value=\{heightDraft\}/);
assert.match(client, /onChange=\{\(e\) => setHeightDraft\(e\.target\.value\)\}/);

console.log("height-draft self-check ok: inches default; cm toggle; incomplete decimals gated");

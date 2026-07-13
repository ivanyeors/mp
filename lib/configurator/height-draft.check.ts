import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { displayHeight, normalizeHeightDraft } from "./height-draft";

assert.equal(normalizeHeightDraft("m", "1."), "100");
assert.equal(normalizeHeightDraft("m", "1.68"), "168");
assert.equal(normalizeHeightDraft("cm", "168.5"), "168.5");
assert.equal(normalizeHeightDraft("m", ""), null);
assert.equal(normalizeHeightDraft("cm", "79"), null);
assert.equal(normalizeHeightDraft("m", "2.51"), null);
assert.equal(displayHeight("m", "168"), "1.68");
assert.equal(displayHeight("cm", "168"), "168");

const client = readFileSync(
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "utf8",
);
assert.match(client, /value=\{heightDraft\}/);
assert.match(client, /onChange=\{\(e\) => setHeightDraft\(e\.target\.value\)\}/);

console.log("height-draft self-check ok: intermediate decimals preserved; commit range enforced");

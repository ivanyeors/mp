import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HOLD_CANCELLED_NOTICE,
  clearHoldCancelDraft,
  holdCancelDraftKey,
  isHoldCancelledQuery,
  parseHoldCancelDraft,
  readHoldCancelDraft,
  shouldRestorePreview,
  stripHoldCancelledFromSearch,
  writeHoldCancelDraft,
  type HoldCancelDraft,
} from "./hold-cancel-restore";

const mem = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
})();

assert.equal(isHoldCancelledQuery("?hold_cancelled=1"), true);
assert.equal(isHoldCancelledQuery("hold_cancelled=1&x=1"), true);
assert.equal(isHoldCancelledQuery("?foo=1"), false);
assert.equal(stripHoldCancelledFromSearch("?hold_cancelled=1&x=2"), "?x=2");
assert.equal(stripHoldCancelledFromSearch("?hold_cancelled=1"), "");

assert.equal(shouldRestorePreview({ holdCancelled: true, draftStep: null }), true);
assert.equal(shouldRestorePreview({ holdCancelled: false, draftStep: "preview" }), true);
assert.equal(shouldRestorePreview({ holdCancelled: false, draftStep: "welcome" }), false);

const draft: HoldCancelDraft = {
  v: 1,
  surface: "mp-full",
  step: "preview",
  responseId: "abc",
  measurementUnit: "in",
  measurementData: { name: "Ada", gender: "female" },
  selections: {
    selectedCover: 10,
    selectedCase: 20,
    selectedAddons: [30],
    selectedShippingId: "ship_1",
    holdEmail: "a@b.co",
    holdPhone: "87805311",
    discoverySource: "instagram",
    discoverySourceOther: "",
    notes: "softer near the edge",
    holdAddress: {
      recipient: "Ada",
      line1: "1 St",
      line2: "",
      city: "SG",
      postal_code: "123456",
      country: "SG",
    },
  },
};

writeHoldCancelDraft(mem, draft);
const roundTrip = readHoldCancelDraft(mem, "mp-full");
assert.ok(roundTrip);
assert.equal(roundTrip!.selections.selectedCover, 10);
assert.equal(roundTrip!.selections.selectedCase, 20);
assert.deepEqual(roundTrip!.selections.selectedAddons, [30]);
assert.equal(roundTrip!.selections.notes, "softer near the edge");
assert.equal(roundTrip!.measurementData?.name, "Ada");

assert.equal(parseHoldCancelDraft({ v: 1, step: "welcome" }), null);
assert.equal(parseHoldCancelDraft(null), null);

clearHoldCancelDraft(mem, "mp-full");
assert.equal(readHoldCancelDraft(mem, "mp-full"), null);
assert.equal(holdCancelDraftKey("mp-basic"), "mp_hold_cancel_mp-basic_v1");
assert.match(HOLD_CANCELLED_NOTICE.title, /cancelled/i);

const ROOT = process.cwd();
const mp = readFileSync(join(ROOT, "app/[lang]/mp-config/mp-config-client.tsx"), "utf8");
const bolster = readFileSync(
  join(ROOT, "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);
const holdRoute = readFileSync(join(ROOT, "app/api/results/hold/route.ts"), "utf8");
const flowVariant = readFileSync(join(ROOT, "lib/mp-config/flow-variant.ts"), "utf8");

for (const src of [mp, bolster]) {
  assert.match(src, /hold-cancel-restore|readHoldCancelDraft|writeHoldCancelDraft/);
  assert.match(src, /isHoldCancelledQuery|hold_cancelled/);
  assert.match(src, /HOLD_CANCELLED_NOTICE|Payment cancelled/);
  assert.match(src, /clearHoldCancelDraft/);
  assert.match(src, /preserveSelections:\s*true/);
}

assert.match(mp, /holdSurface:\s*HoldCancelSurface\s*=\s*isBasic\s*\?\s*"mp-basic"\s*:\s*"mp-full"/);
assert.match(mp, /cancelPath:\s*configPath/);
assert.match(flowVariant, /\/mp-basic/);
assert.match(flowVariant, /\/mp-config/);

assert.match(bolster, /cancelPath:\s*"\/mbolster-config"/);
assert.match(bolster, /stayOnStep:\s*true/);

assert.match(bolster, /surface: "mbolster",\s*step: "preview",\s*responseId: configSessionId,/);
assert.match(bolster, /if \(holdCancelled && draft\.responseId\)/);
assert.match(bolster, /removeItem\(CONFIG_SESSION_KEY\)/);
assert.doesNotMatch(bolster, /setConfigSessionId\(null\)/);

assert.match(holdRoute, /cancelUrl:\s*`\$\{origin\}\$\{cancelPath\}\?hold_cancelled=1`/);

console.log("hold-cancel-restore.check.ts: ok");

/**
 * The authorization-hold kill switch, end to end.
 *
 * The subtle half is not the boolean — it is that switching holds off must NOT
 * restamp `source`. `deferred` (an Assisted customisation) and "holds are off"
 * both skip Stripe, but only the former is `staff_assisted`. Get that wrong and
 * every ordinary online submit made while holds are off is indistinguishable
 * from one that came through an Assist link.
 *
 * Run: npx tsx lib/sla-reminders/auth-hold-toggle.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SLA_SETTINGS,
  parseSlaSettings,
  slaSettingsToStored,
} from "./index";
import { resultStage } from "../results/result-stage";

// --- settings round-trip -----------------------------------------------------
assert.equal(DEFAULT_SLA_SETTINGS.authHoldEnabled, true, "holds stay ON by default");
assert.equal(parseSlaSettings({}).authHoldEnabled, true, "absent key = on");
assert.equal(
  parseSlaSettings({ results_auth_hold_enabled: "false" }).authHoldEnabled,
  false,
);
assert.equal(parseSlaSettings({ results_auth_hold_enabled: "" }).authHoldEnabled, true);
assert.equal(
  slaSettingsToStored({ ...DEFAULT_SLA_SETTINGS, authHoldEnabled: false })
    .results_auth_hold_enabled,
  "false",
);
// Round-trip must be lossless or a save silently re-enables holds.
for (const v of [true, false]) {
  const round = parseSlaSettings(
    slaSettingsToStored({ ...DEFAULT_SLA_SETTINGS, authHoldEnabled: v }),
  );
  assert.equal(round.authHoldEnabled, v, `round-trip lost authHoldEnabled=${v}`);
}

// --- the staging consequence --------------------------------------------------
const base = {
  status: "held",
  source: "online_purchase",
  payment_intent_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  order_id: null,
  topup_paid_at: null,
  order: null,
};
const NOW = new Date("2026-09-12T00:00:00.000Z");

// Holds off: no amount stamped, so this is queue work, not an abandonment.
const off = resultStage({ ...base, authorized_amount: null }, NOW);
assert.equal(off.stage, "needs_assign");
assert.equal(off.stuckReason, null);

// Holds on and the shopper walked away from Checkout: still caught.
const abandoned = resultStage({ ...base, authorized_amount: 120 }, NOW);
assert.equal(abandoned.stage, "stuck");
assert.equal(abandoned.stuckReason, "abandoned_checkout");

// --- wiring in the submit route ----------------------------------------------
const route = readFileSync("app/api/results/hold/route.ts", "utf8");
assert.match(route, /const takeCard = !input\.deferred && authHoldEnabled;/);
assert.match(
  route,
  /source: input\.deferred \? "staff_assisted" : "online_purchase"/,
  "the switch must not restamp source — only `deferred` may",
);
assert.match(route, /authorized_amount: takeCard \? priced\.total : null/);
assert.match(route, /if \(takeCard\) \{/, "Checkout creation must be gated on takeCard");
// Every money/messaging site reads takeCard, not input.deferred. Exactly three
// legitimate reads remain: the trust-boundary guard, takeCard's own definition,
// and the source stamp. A fourth means a money or email site was missed.
assert.equal(
  (route.match(/input\.deferred/g) ?? []).length,
  3,
  "a money/messaging site still reads input.deferred instead of takeCard",
);

// A client that trusts its own `assisted` flag navigates to null when an admin
// turns holds off, so both configurators must fall back to the status URL.
for (const f of [
  "app/[lang]/mp-config/mp-config-client.tsx",
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
]) {
  assert.match(
    readFileSync(f, "utf8"),
    /data\.checkoutUrl \?\? data\.statusUrl/,
    `${f} must follow the server's response, not its own assumption`,
  );
}

console.log("auth-hold-toggle.check.ts OK");

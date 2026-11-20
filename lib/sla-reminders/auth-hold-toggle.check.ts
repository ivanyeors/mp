import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SLA_SETTINGS,
  parseSlaSettings,
  slaSettingsToStored,
} from "./index";
import { resultStage } from "../results/result-stage";

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
for (const v of [true, false]) {
  const round = parseSlaSettings(
    slaSettingsToStored({ ...DEFAULT_SLA_SETTINGS, authHoldEnabled: v }),
  );
  assert.equal(round.authHoldEnabled, v, `round-trip lost authHoldEnabled=${v}`);
}

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

const off = resultStage({ ...base, authorized_amount: null }, NOW);
assert.equal(off.stage, "needs_assign");
assert.equal(off.stuckReason, null);

const abandoned = resultStage({ ...base, authorized_amount: 120 }, NOW);
assert.equal(abandoned.stage, "stuck");
assert.equal(abandoned.stuckReason, "abandoned_checkout");

const route = readFileSync("app/api/results/hold/route.ts", "utf8");
assert.match(route, /const takeCard = !input\.deferred && authHoldEnabled;/);
assert.match(
  route,
  /source: input\.deferred \? "staff_assisted" : "online_purchase"/,
  "the switch must not restamp source — only `deferred` may",
);
assert.match(route, /authorized_amount: takeCard \? priced\.total : null/);
assert.match(route, /if \(takeCard\) \{/, "Checkout creation must be gated on takeCard");
assert.match(route, /customer_id: input\.deferred \? null : customerId/, "the customer link skips a Staff device");
assert.match(route, /if \(!input\.deferred\) \{\s*await stitchShopperVisitor\(/, "the visitor stitch skips a Staff device");
assert.equal(
  (route.match(/input\.deferred/g) ?? []).length,
  5,
  "a money/messaging site still reads input.deferred instead of takeCard",
);

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

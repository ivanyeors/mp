/**
 * Is one-click unsubscribe live on a site? (PRD-shopify-customer-migration
 * slice 07; the README's first hazard: no campaign email before it is.)
 *
 * Run: npx tsx lib/marketing-consent/unsubscribe-route.check.ts https://custom.mpillow.com
 *
 * POSTs an empty one-click unsubscribe to `/api/email/unsubscribe` and expects
 * `400 { error: "invalid_link" }`: the route is deployed, holds its
 * UNSUBSCRIBE_SECRET, and refused without changing anyone. Exits 0 when ready,
 * 1 when not, saying why. Changes nothing on the site. Slice 08's sender runs
 * the same probe (`probeUnsubscribeRoute`) before it sends.
 *
 * With UNSUBSCRIBE_SECRET in the environment as well, it also checks a link
 * built here verifies here, and prints none of it.
 */
import assert from "node:assert/strict";
import {
  probeUnsubscribeRoute,
  unsubscribeLinks,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

async function main() {
  const origin = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) {
    console.error("usage: npx tsx lib/marketing-consent/unsubscribe-route.check.ts <site origin>");
    process.exit(2);
  }

  if (process.env.UNSUBSCRIBE_SECRET) {
    const id = "00000000-0000-4000-8000-000000000000";
    const links = unsubscribeLinks(id, { origin });
    assert.ok(links, "a link can be built");
    assert.ok(verifyUnsubscribeToken(id, unsubscribeToken(id)), "a token built here verifies here");
    console.log("local secret: a link builds and verifies");
  }

  const probe = await probeUnsubscribeRoute(origin);
  if (probe.ready) {
    console.log(`ready: ${origin} answers one-click unsubscribe`);
    return;
  }
  console.error(`NOT READY: ${probe.reason}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

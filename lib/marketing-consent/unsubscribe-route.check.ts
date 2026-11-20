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

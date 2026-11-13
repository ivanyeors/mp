/**
 * Slice 05 — Entry source resolution: UTM > referrer > Direct.
 * Run: npx tsx lib/analytics/journey/entry-source.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { referrerHost, resolveEntrySource } from "./entry-source";

// UTM beats referrer
assert.deepEqual(
  resolveEntrySource({
    search: "?utm_source=instagram&utm_medium=social&utm_campaign=spring",
    referrer: "https://www.google.com/search?q=pillows",
  }),
  {
    entrySource: "instagram",
    entryMedium: "social",
    entryCampaign: "spring",
    referrerHost: "www.google.com",
    entryContent: null,
    entryTerm: null,
    clickIdKind: null,
    clickId: null,
    ref: null,
  },
);

// UTM without medium/campaign
assert.deepEqual(
  resolveEntrySource({ search: "utm_source=newsletter", referrer: "https://t.co/x" }),
  {
    entrySource: "newsletter",
    entryMedium: null,
    entryCampaign: null,
    referrerHost: "t.co",
    entryContent: null,
    entryTerm: null,
    clickIdKind: null,
    clickId: null,
    ref: null,
  },
);

// Full URL search still parses UTM
assert.equal(
  resolveEntrySource({
    search: "https://example.com/shop?utm_source=google&utm_medium=cpc",
    referrer: null,
  }).entrySource,
  "google",
);

// Empty / whitespace utm_source falls through to referrer
assert.deepEqual(
  resolveEntrySource({
    search: "?utm_source=%20%20&utm_medium=cpc",
    referrer: "https://facebook.com/",
  }),
  {
    entrySource: "facebook.com",
    entryMedium: null,
    entryCampaign: null,
    referrerHost: "facebook.com",
    entryContent: null,
    entryTerm: null,
    clickIdKind: null,
    clickId: null,
    ref: null,
  },
);

// Ad click ids ride beside the source, never replace it
{
  const google = resolveEntrySource({ search: "?gclid=abc123", referrer: "https://www.google.com/" });
  assert.equal(google.entrySource, "www.google.com");
  assert.equal(google.clickIdKind, "gclid");
  assert.equal(google.clickId, "abc123");
  const tiktok = resolveEntrySource({ search: "?ttclid=tt1" });
  assert.equal(tiktok.entrySource, "Direct");
  assert.equal(tiktok.clickIdKind, "ttclid");
  // A paid id outranks fbclid, which Meta adds to organic links too
  assert.equal(resolveEntrySource({ search: "?fbclid=f1&gclid=g1" }).clickIdKind, "gclid");
  assert.equal(resolveEntrySource({ search: "?fbclid=f1" }).clickIdKind, "fbclid");
  // Empty or absurdly long values are not click ids
  assert.equal(resolveEntrySource({ search: "?gclid=%20" }).clickIdKind, null);
  assert.equal(resolveEntrySource({ search: `?gclid=${"x".repeat(600)}` }).clickIdKind, null);
  const tagged = resolveEntrySource({
    search: "?utm_source=ig&utm_medium=paid_social&utm_content=reel-a&utm_term=neck%20pain&fbclid=f2",
  });
  assert.equal(tagged.entryContent, "reel-a");
  assert.equal(tagged.entryTerm, "neck pain");
  assert.equal(tagged.clickIdKind, "fbclid");
}

// Referrer beats Direct
assert.deepEqual(
  resolveEntrySource({ search: "", referrer: "https://www.reddit.com/r/sleep/" }),
  {
    entrySource: "www.reddit.com",
    entryMedium: null,
    entryCampaign: null,
    referrerHost: "www.reddit.com",
    entryContent: null,
    entryTerm: null,
    clickIdKind: null,
    clickId: null,
    ref: null,
  },
);

// Direct when neither
assert.deepEqual(resolveEntrySource({}), {
  entrySource: "Direct",
  entryMedium: null,
  entryCampaign: null,
  referrerHost: null,
  entryContent: null,
  entryTerm: null,
  clickIdKind: null,
  clickId: null,
  ref: null,
});
assert.deepEqual(resolveEntrySource({ search: null, referrer: "not a url" }), {
  entrySource: "Direct",
  entryMedium: null,
  entryCampaign: null,
  referrerHost: null,
  entryContent: null,
  entryTerm: null,
  clickIdKind: null,
  clickId: null,
  ref: null,
});

assert.equal(referrerHost("https://shop.example:8443/path"), "shop.example");
assert.equal(referrerHost(""), null);

// ref param surfaces on the resolved type (partner referral, #74)
assert.equal(resolveEntrySource({ search: "?ref=ABCD2345" }).ref, "ABCD2345");
assert.equal(resolveEntrySource({ search: "?utm_source=ig&ref=xyz" }).ref, "xyz");
assert.equal(resolveEntrySource({ search: "?utm_source=ig" }).ref, null);

// Copy must not call Entry source "Discovery source"
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /Entry source/);
assert.doesNotMatch(card, /Discovery source/);

console.log("entry-source.check.ts: ok");

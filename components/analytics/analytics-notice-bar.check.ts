/**
 * Slice 04 — analytics notice bar wiring.
 * Run: npx tsx components/analytics/analytics-notice-bar.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
const notice = readFileSync(
  join(root, "components/analytics/analytics-notice-bar.tsx"),
  "utf8",
);
const privacy = readFileSync(join(root, "app/[lang]/privacy-policy/page.tsx"), "utf8");

assert.match(layout, /AnalyticsNoticeBar/);
assert.match(notice, /isAdminJourneyPath/);
assert.match(notice, /mp_analytics_notice_ok/);
assert.match(notice, /Got it/);
assert.match(notice, /privacy-policy/);
assert.match(notice, /pointer-events-none/);
assert.doesNotMatch(notice, />\s*Reject\s*</);
assert.match(privacy, /visit analytics|pages you view|anonymous visitor/i);

console.log("analytics-notice-bar.check.ts: ok");

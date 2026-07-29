/**
 * Self-check for the branded base + partner email renderers (#84). Runnable with
 * `npx tsx lib/email/partner.check.ts`. Not a vitest file (tests are #83/#85) —
 * this guards the two invariants that matter: the base is table-based + branded,
 * and any email mentioning pending money carries DATED release info (never an
 * undated amount).
 */
import assert from "node:assert/strict";

// Deterministic absolute logo origin for the shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://mpillow.com";

import { renderEmailShell } from "./base";
import {
  formatSgDate,
  renderReferralEarnedEmail,
  renderPayoutEmail,
  renderMilestoneEmail,
} from "./partner";

// --- Branded base: table-based, inline-styled, absolute logo, optional heading ---
const shell = renderEmailShell({ title: "Hello", bodyHtml: "<p>body</p>" });
assert.match(shell, /<table/); // table-based for Gmail/Outlook/Apple Mail
assert.match(shell, /https:\/\/mpillow\.com\/mpillow_logo_2026\.png/); // absolute logo url
assert.match(shell, /<h1[^>]*>Hello<\/h1>/); // heading rendered when given
assert.match(shell, /<p>body<\/p>/);
// Title omitted → no <h1>, body still present.
const noTitle = renderEmailShell({ bodyHtml: "<p>x</p>" });
assert.ok(!/<h1/.test(noTitle));
// Title is escaped (no HTML injection through the heading).
assert.match(renderEmailShell({ title: "<b>x</b>", bodyHtml: "" }), /&lt;b&gt;x&lt;\/b&gt;/);

// --- Referral earned: DATED release info, both delivered + undelivered branches ---
const delivered = renderReferralEarnedEmail({
  money: "S$12.34",
  releaseAtIso: "2026-08-27T02:00:00.000Z",
});
assert.match(delivered.text, /S\$12\.34/);
assert.match(delivered.html, /S\$12\.34/);
assert.match(delivered.text, /releases on 27 August 2026/); // dated — never undated
assert.match(delivered.html, /27 August 2026/);

const undelivered = renderReferralEarnedEmail({ money: "S$5.00", releaseAtIso: null });
assert.match(undelivered.text, /S\$5\.00/);
assert.match(undelivered.text, /30 days after your customer's order is delivered/);

// --- formatSgDate: SGT calendar day (UTC+8) ---
assert.equal(formatSgDate("2026-08-27T02:00:00.000Z"), "27 August 2026");
assert.equal(formatSgDate("2026-08-26T20:00:00.000Z"), "27 August 2026"); // 04:00 SGT next day

// --- Payout: proof link present when a URL is supplied ---
const payout = renderPayoutEmail({ money: "S$40.00", paidOn: "2026-08-01", proofUrl: "https://x/y" });
assert.match(payout.html, /https:\/\/x\/y/);
assert.match(payout.text, /proof of payment/i);

// --- Milestone: perk + bonus surface; perk omitted cleanly ---
const ms = renderMilestoneEmail({ tier: 2, bonus: "S$75.00", perk: "Priority support" });
assert.match(ms.text, /tier 2/);
assert.match(ms.text, /S\$75\.00/);
assert.match(ms.text, /Priority support/);

console.log("partner.check.ts OK");

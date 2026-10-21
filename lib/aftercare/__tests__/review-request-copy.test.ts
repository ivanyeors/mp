process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { AFTERCARE_EMAIL_FOOTER } from "@/lib/aftercare/state";
import { aftercareAccountUrl } from "@/lib/aftercare/review-request-server";
import { reviewLinkUrl } from "@/lib/aftercare/review-link";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { renderReviewRequestEmail, reviewRequestContactLine } from "@/lib/email/aftercare";
import { getEmailCase } from "@/lib/email/registry";
import { AFTERCARE_REVIEW_TEMPLATE, reviewRequestTemplateParams } from "@/lib/whatsapp/aftercare-templates";

/**
 * The Review request's copy (CRM slice 07), by email and on WhatsApp: the
 * review link, the unconditional "need anything else?" line, how to stop, and
 * nothing that Google's review policy or the no-offer rule forbids (README,
 * second and sixth hazards).
 */

const ORIGIN = "https://custom.mpillow.com";
const TOKEN = "Zx81kQpL0aVb3nRt7yUe2w";

const email = renderReviewRequestEmail({
  firstName: "Wei Ling",
  product: "Premium Mpillow",
  orderNumber: "MP-20261020-0042",
  deliveredOn: "3 Nov 2026",
  reviewUrl: reviewLinkUrl(ORIGIN, TOKEN),
  accountUrl: aftercareAccountUrl(ORIGIN),
  supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
  supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
});
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    // An inline link is part of its sentence; every other tag breaks text.
    .replace(/<\/?a\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

const wa = reviewRequestTemplateParams({
  firstName: "Wei Ling",
  orderNumber: "MP-20261020-0042",
  product: "Premium Mpillow",
  deliveredAt: "2026-11-03T02:00:00.000Z",
  token: TOKEN,
});
/** The WhatsApp message as the customer reads it: the approved body with its parameters. */
const waText = AFTERCARE_REVIEW_TEMPLATE.text.replace(/\{\{(\d)\}\}/g, (_m, n) => wa.bodyParams[Number(n) - 1]);

/** No price, no offer, no incentive, and no product but the one they bought. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ["a price", /(S?\$|SGD|USD|MYR)\s?\d|\d+(\.\d{2})?\s?(SGD|dollars)/i],
  ["a percentage", /\d\s?%/],
  ["an offer", /\b(discount|voucher|coupon|promo|offer|sale|deal|free|gift|reward|draw|win|prize|cashback|credit|code)\b/i],
  ["an incentive for the review", /\b(in return|thank you gift|as a thank)/i],
  ["another product", /\b(Mbolster|Basic Mpillow|bolster|shop now|new arrival|collection)\b/i],
  ["review gating", /not happy|unhappy|instead of (a )?review|before (you )?review|were you (happy|satisfied)|if you (enjoyed|loved|like)/i],
];

describe("the review request email", () => {
  it("has one button to our redirect, never straight to Google", () => {
    const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    expect(hrefs).toContain(`${ORIGIN}/r/review?t=${TOKEN}`);
    expect(email.html.match(/Write a Google review/g)?.length).toBeGreaterThanOrEqual(1);
    expect(email.html).not.toMatch(/g\.page|google\.com/);
    expect(email.text).toContain(`Write a Google review: ${ORIGIN}/r/review?t=${TOKEN}`);
  });

  it("thanks them, names the product, and asks in one short paragraph", () => {
    expect(visible(email.html)).toContain("Thank you for choosing Mpillow");
    expect(visible(email.html)).toContain("Your Premium Mpillow (order MP-20261020-0042) was delivered on 3 Nov 2026.");
    expect(email.text).toContain("it helps other people find a pillow that fits them");
  });

  it("puts the support line after the button, unconditionally, with the staffed number", () => {
    const line = reviewRequestContactLine(SUPPORT_WHATSAPP_DISPLAY);
    expect(line).toBe(
      `Need anything else — a re-adjustment, a spare cover, or help with your order? Message us on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}, or just reply to this email.`,
    );
    expect(email.text).toContain(line);
    expect(visible(email.html)).toContain(line);
    const body = visible(email.html);
    expect(body.indexOf("Write a Google review")).toBeLessThan(body.indexOf("Need anything else"));
    expect(email.html).toContain(`href="${SUPPORT_WHATSAPP_URL}"`);
  });

  it("ends with how to stop: the account, through Sign in, or a reply", () => {
    expect(email.text).toContain(AFTERCARE_EMAIL_FOOTER);
    expect(visible(email.html)).toContain(AFTERCARE_EMAIL_FOOTER);
    expect(aftercareAccountUrl(ORIGIN)).toBe(`${ORIGIN}/en-US/account/login?next=%2Fen-US%2Faccount`);
    expect(email.html).toContain(`href="${aftercareAccountUrl(ORIGIN)}"`);
  });

  it.each(FORBIDDEN)("carries no %s", (_what, pattern) => {
    expect(email.subject).not.toMatch(pattern);
    expect(email.text).not.toMatch(pattern);
    expect(visible(email.html)).not.toMatch(pattern);
  });

  it("is registered, so it is previewable and contract-tested", () => {
    expect(getEmailCase("aftercare.review_request")).toMatchObject({ group: "aftercare", audience: "customer" });
    expect(getEmailCase("aftercare.review_request")!.render("happy").subject).toBe(email.subject);
  });
});

describe("the review request on WhatsApp", () => {
  it("carries the same link token on its button, and the staffed line", () => {
    expect(wa.urlButtonParam).toBe(TOKEN);
    expect(AFTERCARE_REVIEW_TEMPLATE.urlButton.url).toBe("https://mpillow.com/r/review?t={{1}}");
    expect(wa.bodyParams).toEqual(["Wei Ling", "#MP-20261020-0042", "Premium Mpillow", "3 Nov 2026", SUPPORT_WHATSAPP_DISPLAY]);
    expect(waText).toContain(`If you need anything else, message our team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}.`);
    expect(waText).toContain("To stop these messages");
  });

  it.each(FORBIDDEN)("carries no %s", (_what, pattern) => {
    expect(waText).not.toMatch(pattern);
  });
});

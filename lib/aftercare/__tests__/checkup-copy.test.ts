process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { CHECKUP_PRODUCT, formatCheckupFee } from "@/lib/aftercare/checkup";
import { checkupBookingUrl } from "@/lib/aftercare/checkup-server";
import { aftercareAccountUrl } from "@/lib/aftercare/review-request-server";
import { AFTERCARE_EMAIL_FOOTER } from "@/lib/aftercare/state";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { checkupFeeLine, renderCheckupEmail } from "@/lib/email/aftercare";
import { getEmailCase } from "@/lib/email/registry";
import { AFTERCARE_CHECKUP_TEMPLATE, checkupTemplateParams } from "@/lib/whatsapp/aftercare-templates";

/**
 * The Check-up reminder's copy (CRM slice 08), by email and on WhatsApp: it
 * says plainly that the visit is paid and states the fee as Costings gives it,
 * links to booking, says how to stop, and carries no other price, no offer and
 * no other product (README, second hazard).
 */

const ORIGIN = "https://custom.mpillow.com";
const ITEM = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

const render = (fee: string) =>
  renderCheckupEmail({
    firstName: "Wei Ling",
    product: CHECKUP_PRODUCT,
    orderNumber: "MP-20251103-0042",
    deliveredOn: "3 Nov 2025",
    fee,
    bookingUrl: checkupBookingUrl(ORIGIN, ITEM),
    accountUrl: aftercareAccountUrl(ORIGIN),
    supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
    supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
  });
const email = render("S$30");

const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<\/?a\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

const waParams = (fee: string) =>
  checkupTemplateParams({
    firstName: "Wei Ling",
    product: CHECKUP_PRODUCT,
    orderNumber: "MP-20251103-0042",
    fee,
    orderItemId: ITEM,
  });
const wa = waParams("S$30");
/** The WhatsApp message as the customer reads it: the approved body with its parameters. */
const waText = AFTERCARE_CHECKUP_TEMPLATE.text.replace(/\{\{(\d)\}\}/g, (_m, n) => wa.bodyParams[Number(n) - 1]);

/** Every price in a text: the fee must be the only one. */
const PRICE = /(?:S\$|SGD\s?|USD\s?|MYR\s?|\$)\s?\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?\s?(?:SGD|dollars)/gi;
const prices = (text: string) => text.match(PRICE) ?? [];

/** No percentage, no offer, no product but the one they own. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ["a percentage", /\d\s?%/],
  ["an offer", /\b(discount|voucher|coupon|promo|offer|sale|deal|free|complimentary|gift|reward|draw|win|prize|cashback|credit|code|limited time)\b/i],
  ["another product", /\b(Mbolster|Basic Mpillow|bolster|cover|accessor(y|ies)|shop now|new arrival|collection)\b/i],
];

describe("the check-up email", () => {
  it("says plainly that the visit is paid, with the fee as Costings gives it", () => {
    expect(checkupFeeLine("S$30")).toBe("A re-adjustment is a paid visit: S$30, paid when you book.");
    expect(email.text).toContain(checkupFeeLine("S$30"));
    expect(visible(email.html)).toContain(checkupFeeLine("S$30"));
    // A different price in Costings is a different message: nothing is written into the copy.
    const dearer = render(formatCheckupFee({ msrp: 32.5, currency: "SGD" })!);
    expect(dearer.text).toContain("A re-adjustment is a paid visit: S$32.50, paid when you book.");
    expect(dearer.text).not.toContain("S$30");
  });

  it("states no other price", () => {
    expect(prices(email.text)).toEqual(["S$30"]);
    expect(prices(visible(email.html))).toEqual(["S$30", "S$30"]); // the preheader and the body
    expect(prices(email.subject)).toEqual([]);
  });

  it.each(FORBIDDEN)("carries no %s", (_what, pattern) => {
    expect(email.subject).not.toMatch(pattern);
    expect(email.text).not.toMatch(pattern);
    expect(visible(email.html)).not.toMatch(pattern);
  });

  it("names the Premium Mpillow and its Order, and books a re-adjustment for that line through Sign in", () => {
    expect(email.subject).toBe("Your Premium Mpillow is due for its yearly re-adjustment");
    expect(email.text).toContain(
      "Your Premium Mpillow from order MP-20251103-0042 is due for its yearly re-adjustment, which keeps it fitted to you.",
    );
    const booking = `${ORIGIN}/en-US/appointments?type=readjustment&item=${ITEM}`;
    expect(checkupBookingUrl(ORIGIN, ITEM)).toBe(booking);
    expect(email.text).toContain(`Book a re-adjustment: ${booking}`);
    expect(email.html.replace(/&amp;/g, "&")).toContain(`href="${booking}"`);
  });

  it("ends with the staffed line and how to stop: the account, or a reply", () => {
    expect(email.text).toContain(`Message our team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}, or just reply to this email.`);
    expect(email.html).toContain(`href="${SUPPORT_WHATSAPP_URL}"`);
    expect(email.text).toContain(AFTERCARE_EMAIL_FOOTER);
    expect(visible(email.html)).toContain(AFTERCARE_EMAIL_FOOTER);
    expect(email.html).toContain(`href="${aftercareAccountUrl(ORIGIN)}"`);
  });

  it("is registered, so it is previewable and contract-tested", () => {
    expect(getEmailCase("aftercare.checkup")).toMatchObject({ group: "aftercare", audience: "customer" });
    expect(getEmailCase("aftercare.checkup")!.render("happy").subject).toBe(email.subject);
  });
});

describe("the check-up on WhatsApp", () => {
  it("states the fee as the fourth parameter, never in the template", () => {
    expect(wa.bodyParams).toEqual(["Wei Ling", "Premium Mpillow", "#MP-20251103-0042", "S$30", SUPPORT_WHATSAPP_DISPLAY]);
    expect(waParams("S$35").bodyParams[3]).toBe("S$35");
    expect(AFTERCARE_CHECKUP_TEMPLATE.text).not.toMatch(PRICE);
    expect(waText).toContain("A re-adjustment is a paid visit: S$30, paid when you book.");
    expect(() => waParams("")).toThrow(/fee/);
  });

  it("books the same line, and states no other price", () => {
    expect(wa.urlButtonParam).toBe(ITEM);
    expect(prices(waText)).toEqual(["S$30"]);
  });

  it.each(FORBIDDEN)("carries no %s", (_what, pattern) => {
    expect(waText).not.toMatch(pattern);
  });
});

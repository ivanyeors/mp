process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import {
  renderMigrationAnnouncementEmail,
  renderMigrationReminderEmail,
  renderMigrationServiceNoticeEmail,
  voucherOfferPhrase,
} from "../migration";
import {
  sampleMigrationAnnouncement,
  sampleMigrationAnnouncementFreeShipping,
  sampleMigrationReminder,
  sampleMigrationServiceNotice,
} from "../__fixtures__/samples";

/**
 * The three campaign emails (migration slice 08). Each is registered as
 * campaign mail, renders the footer's unsubscribe link, and has one button.
 * The announcement states the voucher and its terms; the reminder its last
 * day; the service notice carries no offer, voucher or promotion.
 */

const ids = ["migration.announcement", "migration.announcement_free_shipping", "migration.reminder", "migration.service_notice"];

/** The buttons in a rendered email: each is one VML roundrect for Outlook. */
const buttons = (html: string) => (html.match(/<v:roundrect\b/g) ?? []).length;

describe("registered for the preview tooling, as campaign mail", () => {
  it.each(ids)("%s", (id) => {
    const entry = EMAIL_REGISTRY.find((e) => e.id === id)!;
    expect(entry).toMatchObject({ group: "migration", audience: "customer", campaign: true });
    const { html, text } = entry.render("happy");
    expect(html).toContain("https://custom.mpillow.com/en-US/unsubscribe?u=");
    expect(html).toMatch(/>Unsubscribe<\/a>/);
    expect(text).toMatch(/^Unsubscribe: https:\/\/custom\.mpillow\.com\/en-US\/unsubscribe\?u=/m);
    expect(buttons(html)).toBe(1);
  });
});

describe("the announcement", () => {
  const data = sampleMigrationAnnouncement();
  const { subject, html, text } = renderMigrationAnnouncementEmail(data);

  it("says the account is ready, with one button: the Claim link", () => {
    expect(subject).toBe("Your Mpillow account is ready");
    expect(text).toContain("moved from Shopify");
    expect(text).toContain(`Sign in to your account: ${data.claimUrl}`);
    expect(html).toContain(data.claimUrl.replace(/&/g, "&amp;"));
    expect(text).toContain("no password to set");
  });

  it("states the voucher and its terms", () => {
    expect(text).toContain("SGD 20.00 off a shop order of SGD 50.00 or more");
    expect(text).toContain("Sign in by 31 December 2026");
    expect(text).toContain("valid for 60 days from your first sign-in");
    expect(text).toMatch(/works once/);
    expect(text).toMatch(/not to custom builds/);
  });

  it("says what the account does", () => {
    for (const f of ["delivery addresses", "re-adjustment", "orders", "return"]) expect(text).toContain(f);
  });

  it("says why they are getting it", () => {
    expect(text).toContain("agreed to hear from Mpillow");
  });

  it("states free-shipping terms, with no minimum", () => {
    const free = renderMigrationAnnouncementEmail(sampleMigrationAnnouncementFreeShipping());
    expect(free.text).toContain("free shipping on a shop order. Sign in by");
    expect(free.text.startsWith("Hi,")).toBe(true);
  });
});

describe("the reminder", () => {
  const data = sampleMigrationReminder();
  const { subject, text } = renderMigrationReminderEmail(data);

  it("is short: the last day and the same button", () => {
    expect(subject).toBe("Your welcome-back voucher is waiting");
    expect(text).toContain("by 31 December 2026");
    expect(text).toContain(`Sign in to your account: ${data.claimUrl}`);
    expect(text).toContain("only reminder");
    expect(text.split("\n").length).toBeLessThan(14);
  });
});

describe("the service notice", () => {
  const data = sampleMigrationServiceNotice();
  const { subject, html, text } = renderMigrationServiceNoticeEmail(data);

  it("says where the account lives, re-adjustments and support", () => {
    expect(subject).toBe("Mpillow has moved");
    expect(text).toContain("moved from Shopify to custom.mpillow.com");
    expect(text).toContain(`Sign in: ${data.signInUrl}`);
    expect(text).toContain(`Book a re-adjustment: ${data.readjustmentUrl}`);
    expect(text).toContain("+65 8780 5311");
    expect(html).toContain('href="https://wa.me/6587805311"');
  });

  it("has no offer, no voucher and no promotion", () => {
    for (const body of [subject, text, html]) {
      expect(body).not.toMatch(/voucher|discount|coupon|offer|promo|sale\b|% off|SGD|free shipping|\bfree\b/i);
    }
  });
});

describe("voucherOfferPhrase", () => {
  it("names the amount and the minimum, or free shipping", () => {
    expect(voucherOfferPhrase({ kind: "fixed_amount", amount: "SGD 20.00", minimumSpend: null })).toBe("SGD 20.00 off a shop order");
    expect(voucherOfferPhrase({ kind: "free_shipping", amount: null, minimumSpend: "SGD 80.00" })).toBe(
      "free shipping on a shop order of SGD 80.00 or more",
    );
  });
});

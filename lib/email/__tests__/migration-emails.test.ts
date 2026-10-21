process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import {
  BONUS_TERMS,
  claimBonusPhrase,
  renderMigrationAnnouncementEmail,
  renderMigrationReminderEmail,
  renderMigrationServiceNoticeEmail,
} from "../migration";
import {
  sampleMigrationAnnouncement,
  sampleMigrationAnnouncementNoName,
  sampleMigrationReminder,
  sampleMigrationServiceNotice,
} from "../__fixtures__/samples";

/**
 * The three campaign emails (migration slice 08), with the Claim bonus in
 * place of the voucher (PRD-loyalty-points slice 05). Each is registered as
 * campaign mail, renders the footer's unsubscribe link, and has one button.
 * The announcement and the reminder state the bonus and its terms; the
 * service notice carries no offer, points or promotion. None names the old
 * platform or a move: the website is new (owner, 2026-10-21).
 */

const ids = ["migration.announcement", "migration.announcement_no_name", "migration.reminder", "migration.service_notice"];

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

  it.each(ids)("%s says nothing of Shopify, a move or a voucher", (id) => {
    const { subject, html, text } = EMAIL_REGISTRY.find((e) => e.id === id)!.render("happy");
    for (const body of [subject, text, html]) expect(body).not.toMatch(/shopify|moved|moving|voucher/i);
  });
});

describe("the announcement", () => {
  const data = sampleMigrationAnnouncement();
  const { subject, html, text } = renderMigrationAnnouncementEmail(data);

  it("says the website is new and the account is ready, with one button: the Claim link", () => {
    expect(subject).toBe("Your Mpillow account is ready");
    expect(text).toContain("We have a new website, and your Mpillow account is ready on it.");
    expect(text).toContain(`Sign in to your account: ${data.claimUrl}`);
    expect(html).toContain(data.claimUrl.replace(/&/g, "&amp;"));
    expect(text).toContain("no password to set");
  });

  it("states the Claim bonus, its window and its terms", () => {
    expect(text).toContain("Sign in within 3 months of this email and we'll add 1,000 points, S$10 off your next shop order.");
    expect(text).toContain(BONUS_TERMS);
    expect(text).toMatch(/up to half the products' price/);
    expect(text).toMatch(/can't be used on custom pillows/);
  });

  it("says what the account does", () => {
    for (const f of ["delivery addresses", "re-adjustment", "orders", "return"]) expect(text).toContain(f);
  });

  it("says why they are getting it", () => {
    expect(text).toContain("agreed to hear from Mpillow");
  });

  it("greets a customer with no first name", () => {
    expect(renderMigrationAnnouncementEmail(sampleMigrationAnnouncementNoName()).text.startsWith("Hi,")).toBe(true);
  });
});

describe("the reminder", () => {
  const data = sampleMigrationReminder();
  const { subject, text } = renderMigrationReminderEmail(data);

  it("is short: the points and the same button", () => {
    expect(subject).toBe("S$10 in points is waiting in your Mpillow account");
    expect(text).toContain("within 3 months of our first email");
    expect(text).toContain(`Sign in to your account: ${data.claimUrl}`);
    expect(text).toContain("only reminder");
    expect(text.split("\n").length).toBeLessThan(14);
  });
});

describe("the service notice", () => {
  const data = sampleMigrationServiceNotice();
  const { subject, html, text } = renderMigrationServiceNoticeEmail(data);

  it("says where the account lives, re-adjustments and support", () => {
    expect(subject).toBe("Mpillow has a new website");
    expect(text).toContain("Mpillow has a new website at custom.mpillow.com.");
    expect(text).toContain(`Sign in: ${data.signInUrl}`);
    expect(text).toContain(`Book a re-adjustment: ${data.readjustmentUrl}`);
    expect(text).toContain("+65 8780 5311");
    expect(html).toContain('href="https://wa.me/6587805311"');
  });

  it("has no offer, no points and no promotion", () => {
    for (const body of [subject, text, html]) {
      expect(body).not.toMatch(/voucher|discount|coupon|offer|promo|sale\b|% off|SGD|S\$|points?\b|free shipping|\bfree\b/i);
    }
  });
});

describe("claimBonusPhrase", () => {
  it("names the points and what they are worth", () => {
    expect(claimBonusPhrase({ points: "1,000 points", amount: "S$10" })).toBe("1,000 points, S$10 off your next shop order");
  });
});

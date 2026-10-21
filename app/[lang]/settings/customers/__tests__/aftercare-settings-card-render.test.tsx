import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { emptyCheckupReport, parseCheckupSettings } from "@/lib/aftercare/checkup";
import { emptyReviewRequestReport, parseReviewRequestSettings } from "@/lib/aftercare/review-request";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { AftercareSettingsCard } from "../aftercare-settings-card";

/**
 * The Aftercare card (CRM slices 07 and 08): the Review request's and the
 * Check-up reminder's settings, read-only without `customers-edit`, with what
 * went out recently, today's skips by reason, and open STOP requests.
 */

const settings = parseReviewRequestSettings({
  review_requests_enabled: "false",
  google_review_url: "https://g.page/r/CfdGhvgB1hwUEBM/review",
});
const today = {
  ...emptyReviewRequestReport(settings),
  candidates: 5,
  reachable: 4,
  skipped: { no_channel: 1, not_marked_delivered: 2, already_asked: 0 },
  emailSkipped: { opted_out: 1 },
  whatsappSkipped: { template_unconfigured: 5 },
};
const checkupSettings = parseCheckupSettings({ checkup_reminders_enabled: "false", checkup_months: "12" });
const checkupToday = {
  ...emptyCheckupReport(checkupSettings, { fee: "S$30" }),
  candidates: 6,
  reachable: 3,
  skipped: { readjusted_recently: 2, reminded_recently: 1, no_channel: 3, not_marked_delivered: 4 },
  emailSkipped: { no_marketing_consent: 3 },
  whatsappSkipped: { opted_out: 5 },
};
const data: AftercareCardData = {
  settings: { reviewRequests: settings, checkups: checkupSettings },
  reviewRequests: {
    today,
    last30: { asked: 18, opened: 9, email: 17, whatsapp: 3 },
    googleReviewsLinked: 0,
  },
  checkups: {
    today: checkupToday,
    last90: { sent: 7, email: 6, whatsapp: 2, followedByBooking: 3 },
  },
  whatsapp: { senderConfigured: true, reviewTemplate: null, checkupTemplate: null },
  openStopRequests: 2,
};

const render = (canEdit: boolean, d: AftercareCardData = data) =>
  renderToString(<AftercareSettingsCard canEdit={canEdit} initialData={d} />);

const tag = (html: string, id: string) => {
  const t = html.match(new RegExp(`<(?:button|input)[^>]*id="${id}"[^>]*>`))?.[0];
  expect(t, id).toBeDefined();
  return t!;
};
const disabled = (html: string, id: string) => /\sdisabled=""/.test(tag(html, id));
const plain = (html: string) => html.replace(/<!-- -->/g, "");

const FIELDS = [
  "aftercare-review-enabled",
  "aftercare-review-days-after",
  "aftercare-review-max-age",
  "aftercare-review-url",
  "aftercare-checkup-enabled",
  "aftercare-checkup-months",
];

describe("Aftercare card", () => {
  it("shows the settings, the last 30 days, today's skips by reason and open STOP requests", () => {
    const html = plain(render(true));
    for (const text of [
      "Review request",
      "Off: nothing is sent. The numbers below are what would go today.",
      "18 customers asked (17 by email, 3 by WhatsApp); 9 opened the link.",
      "Google reviews linked to a customer we asked, so far: 0.",
      "5 customers due, 4 reachable.",
      "No email or WhatsApp to reach them 1",
      "Orders never marked delivered 2",
      "Email switched off 1",
      "Template not approved yet 5",
      "Open STOP requests on WhatsApp: 2.",
      "the template is not approved yet",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(tag(html, "aftercare-review-url")).toContain('value="https://g.page/r/CfdGhvgB1hwUEBM/review"');
    expect(tag(html, "aftercare-review-days-after")).toContain('value="14"');
  });

  it("shows the check-up: its fee from Costings, sends by channel, bookings that followed, and skips by reason", () => {
    const html = plain(render(true));
    for (const text of [
      "Check-up reminder",
      "For a Premium Mpillow only: every 12 months after delivery",
      "Email goes only to customers with marketing consent",
      "Fee stated: S$30, read from Costings → Service fees when each message goes.",
      "7 check-ups sent (6 by email, 2 by WhatsApp); 3 followed by a re-adjustment booking.",
      "6 orders due, 3 reachable.",
      "Re-adjustment booked or attended this period 2",
      "Reminded about another order this period 1",
      "No email or WhatsApp to reach them 3",
      "Orders never marked delivered 4",
      "No marketing consent 3",
      "Not opted in 5",
      "(WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP), so check-ups go by email only.",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(tag(html, "aftercare-checkup-months")).toContain('value="12"');
  });

  it("says when the fee cannot be read, and when the check-up is on", () => {
    const on = { enabled: true, months: 12 };
    const noFee = plain(
      render(true, {
        ...data,
        settings: { ...data.settings, checkups: on },
        checkups: { ...data.checkups, today: emptyCheckupReport(on, { fee: null, error: "service_prices is down" }) },
      }),
    );
    expect(noFee).toContain("No re-adjustment fee to state, so nothing is sent today.");
    expect(noFee).toContain("Fee: none to state (service_prices is down).");
    const live = plain(
      render(true, {
        ...data,
        settings: { ...data.settings, checkups: on },
        checkups: { ...data.checkups, today: emptyCheckupReport(on, { fee: "S$35" }) },
        whatsapp: { senderConfigured: true, reviewTemplate: null, checkupTemplate: "aftercare_checkup" },
      }),
    );
    expect(live).toContain("On: due Premium Mpillow owners are reminded in the daily run");
    expect(live).toContain("Fee stated: S$35");
    expect(live).not.toContain("keep 12 months");
    const every18 = render(true, { ...data, settings: { ...data.settings, checkups: { enabled: true, months: 18 } } });
    expect(every18).toContain("keep 12 months unless the copy changes too");
  });

  it("with customers-edit, the switches and fields are live and there is a Save", () => {
    const html = render(true);
    for (const id of FIELDS) {
      expect(disabled(html, id), id).toBe(false);
    }
    expect(html).toContain(">Save<");
  });

  it("without customers-edit, it is read-only", () => {
    const html = render(false);
    for (const id of FIELDS) {
      expect(disabled(html, id), id).toBe(true);
    }
    expect(html).not.toContain(">Save<");
  });

  it("says when there is no usable link, and when it is on", () => {
    const noLink = parseReviewRequestSettings({ review_requests_enabled: "true" });
    const blocked = render(true, {
      ...data,
      settings: { ...data.settings, reviewRequests: noLink },
      reviewRequests: { ...data.reviewRequests, today: emptyReviewRequestReport(noLink) },
    });
    expect(blocked).toContain("No usable Google review link (https), so nothing is sent.");
    const on = { ...settings, enabled: true };
    const live = render(true, {
      ...data,
      settings: { ...data.settings, reviewRequests: on },
      reviewRequests: { ...data.reviewRequests, today: emptyReviewRequestReport(on), googleReviewsLinked: 4 },
      whatsapp: { senderConfigured: true, reviewTemplate: "aftercare_review_request", checkupTemplate: null },
    });
    expect(live).toContain("On: due customers are asked in the daily run");
    expect(plain(live)).toContain("Google reviews linked to a customer we asked, so far: 4.");
    expect(live).toContain("WhatsApp: also sent to customers who opted in");
  });
});

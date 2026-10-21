import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { emptyReviewRequestReport, parseReviewRequestSettings } from "@/lib/aftercare/review-request";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { AftercareSettingsCard } from "../aftercare-settings-card";

/**
 * The Aftercare card (CRM slice 07): the Review request's settings, read-only
 * without `customers-edit`, with the last 30 days, today's skips by reason,
 * and open STOP requests.
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
const data: AftercareCardData = {
  settings: { reviewRequests: settings },
  reviewRequests: {
    today,
    last30: { asked: 18, opened: 9, email: 17, whatsapp: 3 },
    googleReviewsLinked: 0,
  },
  whatsapp: { senderConfigured: true, reviewTemplate: null },
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

  it("with customers-edit, the switch and fields are live and there is a Save", () => {
    const html = render(true);
    for (const id of ["aftercare-review-enabled", "aftercare-review-days-after", "aftercare-review-max-age", "aftercare-review-url"]) {
      expect(disabled(html, id), id).toBe(false);
    }
    expect(html).toContain(">Save<");
  });

  it("without customers-edit, it is read-only", () => {
    const html = render(false);
    for (const id of ["aftercare-review-enabled", "aftercare-review-days-after", "aftercare-review-max-age", "aftercare-review-url"]) {
      expect(disabled(html, id), id).toBe(true);
    }
    expect(html).not.toContain(">Save<");
  });

  it("says when there is no usable link, and when it is on", () => {
    const noLink = parseReviewRequestSettings({ review_requests_enabled: "true" });
    const blocked = render(true, {
      ...data,
      settings: { reviewRequests: noLink },
      reviewRequests: { ...data.reviewRequests, today: emptyReviewRequestReport(noLink) },
    });
    expect(blocked).toContain("No usable Google review link (https), so nothing is sent.");
    const on = { ...settings, enabled: true };
    const live = render(true, {
      ...data,
      settings: { reviewRequests: on },
      reviewRequests: { ...data.reviewRequests, today: emptyReviewRequestReport(on), googleReviewsLinked: 4 },
      whatsapp: { senderConfigured: true, reviewTemplate: "aftercare_review_request" },
    });
    expect(live).toContain("On: due customers are asked in the daily run");
    expect(plain(live)).toContain("Google reviews linked to a customer we asked, so far: 4.");
    expect(live).toContain("WhatsApp: also sent to customers who opted in");
  });
});

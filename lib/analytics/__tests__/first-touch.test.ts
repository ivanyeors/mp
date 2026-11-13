import { describe, expect, it } from "vitest";
import {
  describeEntry,
  firstVisitByVisitor,
  groupVisitorsByPerson,
  type EntryVisit,
} from "@/lib/analytics/journey/first-touch";

const visit = (id: string, visitor_id: string, started_at: string, extra: Partial<EntryVisit> = {}): EntryVisit => ({
  id,
  visitor_id,
  started_at,
  entry_source: "Direct",
  entry_medium: null,
  entry_campaign: null,
  referrer_host: null,
  entry_click_id_kind: null,
  entry_app: null,
  landing_path: null,
  converted_order_id: null,
  ...extra,
});

describe("groupVisitorsByPerson", () => {
  it("joins Visitors that share a Customer or an email, directly or through a third", () => {
    const group = groupVisitorsByPerson([
      { id: "phone-app", email: "Amy@Example.com", customer_id: null },
      { id: "phone-safari", email: "amy@example.com", customer_id: "c1" },
      { id: "laptop", email: null, customer_id: "c1" },
      { id: "stranger", email: null, customer_id: null },
    ]);
    expect(group.get("phone-app")).toBe(group.get("laptop"));
    expect(group.get("phone-safari")).toBe(group.get("laptop"));
    expect(group.get("stranger")).not.toBe(group.get("laptop"));
  });
});

describe("firstVisitByVisitor", () => {
  const visitors = [
    { id: "app", email: "amy@example.com", customer_id: null },
    { id: "safari", email: "amy@example.com", customer_id: "c1" },
    { id: "other", email: null, customer_id: null },
  ];
  const visits = [
    visit("v2", "safari", "2026-11-03T10:00:00Z", { referrer_host: "www.google.com", entry_source: "www.google.com" }),
    visit("v1", "app", "2026-11-01T10:00:00Z", { entry_app: "instagram" }),
    visit("v3", "other", "2026-10-01T10:00:00Z"),
  ];
  const first = firstVisitByVisitor(visitors, visits);

  it("gives every Visitor of one person that person's earliest Visit", () => {
    expect(first.get("safari")?.id).toBe("v1");
    expect(first.get("app")?.id).toBe("v1");
  });

  it("never reaches into someone else's Visits", () => {
    expect(first.get("other")?.id).toBe("v3");
  });
});

describe("describeEntry", () => {
  it("names the platform and keeps the campaign and landing page", () => {
    expect(
      describeEntry(
        visit("v", "x", "2026-11-01T10:00:00Z", {
          entry_source: "ig",
          entry_medium: "paid_social",
          entry_campaign: "neck-pain-nov",
          landing_path: "/mp-config",
        }),
      ),
    ).toEqual({
      startedAt: "2026-11-01T10:00:00Z",
      channel: "paid",
      channelLabel: "Paid",
      platform: "Instagram",
      source: "ig",
      campaign: "neck-pain-nov",
      landingPath: "/mp-config",
    });
  });

  it("says nothing more than Direct for a Visit with no origin", () => {
    expect(describeEntry(visit("v", "x", "2026-11-01T10:00:00Z"))).toMatchObject({
      channel: "direct",
      platform: null,
      source: null,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

/**
 * The Customer timeline names the campaign behind a click and behind an
 * unsubscribe (PRD-campaign-audiences slice 08): *Clicked "<campaign>"* at the
 * first counted click, and *Unsubscribed … after "<campaign>"* from its link.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

/** The few query methods the timeline reads use, over fixed rows. */
function rows(table: string) {
  let out = [...(h.tables[table] ?? [])];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), q),
    in: (c: string, vs: unknown[]) => ((out = out.filter((r) => vs.includes(r[c]))), q),
    not: (c: string) => ((out = out.filter((r) => r[c] != null)), q),
    lte: (c: string, v: string) => ((out = out.filter((r) => String(r[c]) <= v)), q),
    order: (c: string) => ((out = out.sort((a, b) => String(b[c]).localeCompare(String(a[c])))), q),
    limit: (n: number) => Promise.resolve({ data: out.slice(0, n), error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({ from: rows }) }));

const { campaignSendsAdapter } = await import("@/lib/crm/timeline/sources/campaign-sends");
const { consentAdapter } = await import("@/lib/crm/timeline/sources/consent");

const customer = { id: "c1", email: "mei@x.test" };
const send = (over: Row): Row => ({
  id: "s1",
  customer_id: "c1",
  template: "campaign:k1",
  wave: "w1",
  status: "sent",
  sent_at: "2026-10-28T02:00:00.000Z",
  bounced_at: null,
  complained_at: null,
  first_clicked_at: null,
  clicks: 0,
  campaign: { name: "December cooling launch" },
  ...over,
});

describe("campaign sends on the timeline", () => {
  it("adds the first counted click, naming the campaign and how many clicks", async () => {
    h.tables = {
      customer_campaign_sends: [
        send({ first_clicked_at: "2026-10-30T03:00:00.000Z", clicks: 3 }),
        send({ id: "s2", template: "campaign:k2", campaign: { name: "Care tips" }, first_clicked_at: "2026-10-29T03:00:00.000Z", clicks: 1 }),
        send({ id: "s3", template: "campaign:k3", campaign: { name: "Not clicked" } }),
      ],
    };
    const { entries } = await campaignSendsAdapter.load(customer, null, 50);
    const clicks = entries.filter((e) => e.kind === "campaign_email.clicked");
    expect(clicks.map((e) => [e.at, e.summary])).toEqual([
      ["2026-10-30T03:00:00.000Z", "Clicked “December cooling launch” (3 clicks)"],
      ["2026-10-29T03:00:00.000Z", "Clicked “Care tips”"],
    ]);
    expect(campaignSendsAdapter.kinds).toContain("campaign_email.clicked");
  });
});

describe("consent changes on the timeline", () => {
  it("names the campaign an unsubscribe came from, and nothing for one with no send", async () => {
    h.tables = {
      customer_consent_events: [
        {
          id: 2,
          customer_id: "c1",
          to_state: "unsubscribed",
          source: "unsubscribe_link",
          created_at: "2026-10-30T04:00:00.000Z",
          campaign_send: { campaign: { name: "December cooling launch" } },
        },
        { id: 1, customer_id: "c1", to_state: "subscribed", source: "checkout", created_at: "2026-10-01T04:00:00.000Z", campaign_send: null },
        { id: 3, customer_id: "c1", to_state: "unsubscribed", source: "support", created_at: "2026-09-01T04:00:00.000Z", campaign_send: null },
        {
          id: 4,
          customer_id: "c1",
          to_state: "unsubscribed",
          source: "complaint",
          created_at: "2026-08-01T04:00:00.000Z",
          campaign_send: [{ campaign: [{ name: "Care tips" }] }],
        },
      ],
    };
    const { entries } = await consentAdapter.load(customer, null, 50);
    expect(entries.map((e) => e.summary)).toEqual([
      "Unsubscribed from marketing email by the unsubscribe link in “December cooling launch”",
      "Subscribed to marketing email from the box at checkout",
      "Unsubscribed from marketing email by Staff, at the customer's request",
      "Unsubscribed from marketing email by a spam complaint about “Care tips”",
    ]);
  });
});

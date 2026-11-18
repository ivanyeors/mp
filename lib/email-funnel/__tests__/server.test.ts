import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunnelResultRow, FunnelView } from "../model";

/**
 * The Email funnel's loader (PRD-email-funnel slice 03) against a fake
 * client that answers as PostgREST does: at most 1,000 rows a request unless
 * a range asks for others, and an exact count on `head: true`. Built to fail
 * the plausible wrong versions: counting the rows one request returned (1,000)
 * and letting one failed read fail the page.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  failing: new Set<string>(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fakeClient() }));

const MAX_ROWS = 1000;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let head = false;
  let counted = false;
  let range: [number, number] | null = null;
  let single = false;
  const run = () => {
    if (db.failing.has(table)) return { data: null, count: null, error: { message: `${table} is down` } };
    const rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const count = counted ? rows.length : null;
    if (head) return { data: null, count, error: null };
    const [from, to] = range ?? [0, MAX_ROWS - 1];
    const page = rows.slice(from, Math.min(to + 1, from + MAX_ROWS));
    return { data: single ? (page[0] ?? null) : page, count, error: null };
  };
  const known: Record<string, (...a: unknown[]) => unknown> = {
    select: (_cols, opts) => {
      head = Boolean((opts as { head?: boolean } | undefined)?.head);
      counted = (opts as { count?: string } | undefined)?.count === "exact";
    },
    eq: (c, v) => filters.push((r) => r[c as string] === v),
    in: (c, vs) => filters.push((r) => (vs as unknown[]).includes(r[c as string])),
    is: (c, v) => filters.push((r) => (v === null ? r[c as string] == null : r[c as string] === v)),
    not: (c, op, v) => filters.push((r) => (op === "is" && v === null ? r[c as string] != null : true)),
    like: (c, p) => filters.push((r) => String(r[c as string] ?? "").startsWith(String(p).replace(/%$/, ""))),
    gte: (c, v) => filters.push((r) => String(r[c as string]) >= String(v)),
    lt: (c, v) => filters.push((r) => String(r[c as string]) < String(v)),
    range: (from, to) => {
      range = [from as number, to as number];
    },
    maybeSingle: () => {
      single = true;
    },
  };
  const builder: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad);
        // Any other filter the code applies (the Customers mapping's) narrows nothing here.
        return (...args: unknown[]) => {
          known[prop as string]?.(...args);
          return builder;
        };
      },
    },
  );
  return builder;
}

function fakeClient() {
  return {
    from: (table: string) => query(table),
    rpc: async (name: string) =>
      db.failing.has(name)
        ? { data: null, error: { message: `${name} is down` } }
        : { data: name === "admin_customer_lifecycle_counts" ? [{ stage: "lead", detail: null, undated: false, customers: 7 }] : [], error: null },
  };
}

const uuid = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

function seed() {
  const drafts = Array.from({ length: 1500 }, (_, n) => ({
    id: uuid("d", n),
    status: "held",
    customer_email: `guest${n}@example.test`,
    created_at: "2026-10-01T00:00:00Z",
  }));
  db.failing = new Set();
  db.tables = {
    mp_config_responses: drafts,
    customer_emails: [
      ...drafts.map((d, n) => ({
        id: n + 1,
        customer_id: uuid("c", n),
        template: "results.draft_reminder_1d",
        entity_id: d.id,
        status: "sent",
        sent_at: "2026-10-02T00:00:00Z",
      })),
      ...Array.from({ length: 1200 }, (_, n) => ({
        id: 5000 + n,
        customer_id: uuid("c", n),
        template: "aftercare.checkup_12m",
        entity_id: uuid("e", n),
        status: "sent",
        sent_at: "2026-10-03T00:00:00Z",
      })),
      { id: 9000, customer_id: uuid("c", 1), template: "aftercare.review_request", entity_id: uuid("c", 1), status: "sent", sent_at: "2026-10-04T00:00:00Z" },
    ],
    customer_review_requests: [{ customer_id: uuid("c", 1), first_clicked_at: "2026-10-05T00:00:00Z" }],
    customer_segments: [
      { id: uuid("5", 1), name: "Lead", filters: { stage: "lead" }, filters_version: 2, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", archived_at: null },
    ],
    email_campaigns: [],
  };
}

const automatic = (view: FunnelView, stepId: string) =>
  view.stages
    .flatMap((s) => s.results.rows)
    .find((r): r is Extract<FunnelResultRow, { kind: "automatic" }> => r.kind === "automatic" && r.stepId === stepId);

describe("getEmailFunnel", () => {
  beforeEach(() => {
    seed();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts 1,500 sent draft reminders as 1,500, not the 1,000 one request returns", async () => {
    const { getEmailFunnel } = await import("../server");
    const view = await getEmailFunnel();
    const drafts = automatic(view, "lead.draft_reminders");
    expect(drafts).toMatchObject({ counted: true, sent: 1500, outcome: 1500 });
    expect(drafts?.also).toContainEqual({ label: "Drafts reminded", count: 1500 });
    // Check-ups read rows, so they page too.
    expect(automatic(view, "aftercare.checkup_reminder")).toMatchObject({ counted: true, sent: 1200 });
  });

  it("leaves one failed read not counted, and the rest of the view intact", async () => {
    db.failing.add("customer_review_requests");
    const { getEmailFunnel } = await import("../server");
    const view = await getEmailFunnel();
    expect(automatic(view, "new.review_request")).toMatchObject({ counted: false, sent: null, outcome: null });
    expect(automatic(view, "lead.draft_reminders")).toMatchObject({ counted: true, sent: 1500 });
    const lead = view.stages.find((s) => s.stage === "lead")!;
    expect(lead.segments.map((s) => s.name)).toContain("Lead");
    expect(lead.header.customers).toBe(7);
    expect(view.notRead).toEqual([]);
  });

  it("names a failed Segments or results read, and never throws", async () => {
    db.failing.add("customer_segments");
    db.failing.add("email_campaign_stage_results");
    db.failing.add("admin_customer_lifecycle_counts");
    const { getEmailFunnel } = await import("../server");
    const view = await getEmailFunnel();
    expect(view.notRead).toEqual(["summary", "segments", "results"]);
    expect(view.stages[0].header.customers).toBeNull();
    expect(automatic(view, "lead.draft_reminders")).toMatchObject({ counted: true });
  });

  it("returns counts only: no Customer's email or id in the view", async () => {
    const { getEmailFunnel } = await import("../server");
    const json = JSON.stringify(await getEmailFunnel());
    expect(json).not.toMatch(/@example\.test/);
    expect(json).not.toContain(uuid("c", 1));
  });
});

describe("Automatic emails on one basis", () => {
  beforeEach(() => {
    seed();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts check-ups by email or WhatsApp, and bookings after those: 1 email and 10 WhatsApp-only, 4 booking", async () => {
    const at = (d: number) => `2026-09-${String(d).padStart(2, "0")}T00:00:00Z`;
    const row = (n: number, d: number) => ({ id: 7000 + n, customer_id: uuid("b", n), template: "aftercare.checkup_12m", entity_id: uuid("f", n), status: "sent", sent_at: at(d) });
    db.tables.customer_emails = [row(0, 1)];
    db.tables.customer_whatsapp = Array.from({ length: 10 }, (_, k) => row(k + 1, 2));
    db.tables.readjustment_bookings = [1, 2, 3, 4].map((n) => ({ id: uuid("a", n), customer_id: uuid("b", n), created_at: at(20), status: "booked" }));
    const { getEmailFunnel } = await import("../server");
    const checkup = automatic(await getEmailFunnel(), "aftercare.checkup_reminder");
    expect(checkup).toMatchObject({ counted: true, sent: 11, outcome: 4, sentLabel: "Check-ups sent, by email or WhatsApp" });
    expect(checkup?.also).toContainEqual({ label: "By email", count: 1 });
  });

  it("shows the Review request by Customers asked, even with no email sent", async () => {
    db.tables.customer_emails = db.tables.customer_emails.filter((r) => r.template !== "aftercare.review_request");
    db.tables.customer_review_requests = [
      { customer_id: uuid("r", 1), first_clicked_at: "2026-10-05T00:00:00Z" },
      { customer_id: uuid("r", 2), first_clicked_at: "2026-10-06T00:00:00Z" },
      { customer_id: uuid("r", 3), first_clicked_at: null },
    ];
    const { getEmailFunnel } = await import("../server");
    const review = automatic(await getEmailFunnel(), "new.review_request");
    expect(review).toMatchObject({ counted: true, sent: 3, outcome: 2, sentLabel: "Customers asked, by email or WhatsApp" });
    expect(review?.also).toContainEqual({ label: "By email", count: 0 });
  });
});

describe("summariseFunnelCheckups", () => {
  it("credits one booking once: a 12-month and a 24-month check-up, then one booking, is 1", async () => {
    const { summariseFunnelCheckups } = await import("../server");
    const send = (template: string, entity: string, sent_at: string) => ({ customer_id: "c1", template, entity_id: entity, sent_at });
    const s = summariseFunnelCheckups({
      email: [send("aftercare.checkup_12m", "o1", "2025-01-01T00:00:00Z"), send("aftercare.checkup_24m", "o1", "2026-01-01T00:00:00Z")],
      // The same 24-month check-up by WhatsApp too: still one check-up.
      whatsapp: [send("aftercare.checkup_24m", "o1", "2026-01-01T01:00:00Z")],
      bookings: [
        { customer_id: "c1", created_at: "2026-02-01T00:00:00Z", status: "attended" },
        // Before any check-up, or not a booking: no credit.
        { customer_id: "c1", created_at: "2024-06-01T00:00:00Z", status: "attended" },
        { customer_id: "c1", created_at: "2026-03-01T00:00:00Z", status: "cancelled" },
      ],
    });
    expect(s).toEqual({ sent: 2, byEmail: 2, followedByBooking: 1 });
  });

  it("credits a booking between two check-ups to the earlier one, and one after the later to the later", async () => {
    const { summariseFunnelCheckups } = await import("../server");
    const send = (template: string, sent_at: string) => ({ customer_id: "c1", template, entity_id: "o1", sent_at });
    const s = summariseFunnelCheckups({
      email: [send("aftercare.checkup_12m", "2025-01-01T00:00:00Z"), send("aftercare.checkup_24m", "2026-01-01T00:00:00Z")],
      whatsapp: [],
      bookings: [
        { customer_id: "c1", created_at: "2025-02-01T00:00:00Z", status: "booked" },
        { customer_id: "c1", created_at: "2026-02-01T00:00:00Z", status: "booked" },
      ],
    });
    expect(s.followedByBooking).toBe(2);
  });
});

describe("countDraftsFinished", () => {
  it("counts a Draft held since, or followed by a Result from the same email, never one started before it", async () => {
    const { countDraftsFinished } = await import("../server");
    const d = (id: string, status: string | null, email: string) => ({ id, status, customer_email: email, created_at: "2026-10-10T00:00:00Z" });
    expect(
      countDraftsFinished(
        [d("a", "paid", "a@x.test"), d("b", null, "B@x.test"), d("c", null, "c@x.test"), d("e", null, "e@x.test")],
        [
          { customer_email: "b@x.test", created_at: "2026-10-11T00:00:00Z" },
          { customer_email: "c@x.test", created_at: "2026-10-09T00:00:00Z" },
        ],
      ),
    ).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  JOURNEY_FILTERS,
  buildChapters,
  chapterEntries,
  chapterTone,
  gapLabel,
  isMinorEntry,
  journeyNow,
  visibleFilters,
} from "@/lib/crm/journey/chapters";
import type { ShownTimelineEntry } from "@/lib/crm/timeline/types";

let seq = 0;
function entry(
  kind: string,
  at: string,
  extra: Partial<ShownTimelineEntry> & { record?: string } = {},
): ShownTimelineEntry {
  seq += 1;
  const { record, ...rest } = extra;
  const [type] = kind.split(".");
  return {
    id: `${kind}:${record ?? seq}`,
    at: `${at}T04:00:00.000Z`,
    kind,
    ref: { type: type!, id: record ?? String(seq) },
    summary: kind,
    group: GROUP[type!] ?? "account",
    ...rest,
  };
}

const GROUP: Record<string, string> = {
  order: "orders",
  return: "returns",
  result: "results",
  fitting: "fittings",
  readjustment: "readjustments",
  google_review: "reviews",
  review: "reviews",
  review_request: "reviews",
  campaign_email: "marketing",
  consent: "marketing",
  aftercare: "aftercare",
  checkup: "aftercare",
  note: "notes",
  follow_up: "followups",
  account: "account",
};

const titles = (entries: ShownTimelineEntry[], complete = true) =>
  buildChapters(entries, { complete }).map((c) => c.title);

describe("buildChapters", () => {
  it("returns nothing for nothing", () => {
    expect(buildChapters([], { complete: true })).toEqual([]);
  });

  it("keeps an order with its steps, however late the delivery", () => {
    const chapters = buildChapters(
      [
        entry("order.placed", "2026-03-01", { record: "o1" }),
        entry("order.paid", "2026-03-01", { record: "o1" }),
        entry("order.shipped", "2026-03-04", { record: "o1" }),
        entry("order.delivered", "2026-03-20", { record: "o1" }),
      ],
      { complete: true },
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe("First order");
    expect(chapters[0]!.entries.map((e) => e.kind)).toEqual(["order.delivered", "order.shipped", "order.placed", "order.paid"]);
    expect(chapters[0]!.from.startsWith("2026-03-01")).toBe(true);
    expect(chapters[0]!.to.startsWith("2026-03-20")).toBe(true);
  });

  it("starts a chapter after ten quiet days", () => {
    expect(
      titles([
        entry("fitting.recorded", "2025-10-04"),
        entry("note.added", "2025-10-14"),
        entry("note.added", "2025-10-25"),
      ]),
    ).toEqual(["In-store fitting", "Note"]);
  });

  it("names a chapter for its most telling entry", () => {
    expect(
      titles([
        entry("note.added", "2026-02-22"),
        entry("google_review.written", "2026-02-24", { rating: 1 }),
        entry("follow_up.added", "2026-02-25"),
      ]),
    ).toEqual(["1★ Google review"]);
    expect(titles([entry("review.submitted", "2026-02-24", { rating: 5 })])).toEqual(["5★ shop review"]);
    expect(titles([entry("google_review.written", "2026-02-24")])).toEqual(["Google review"]);
    expect(titles([entry("readjustment.booked", "2026-11-01", { record: "b1" }), entry("readjustment.attended", "2026-11-12", { record: "b1" })])).toEqual([
      "Re-adjustment visit",
    ]);
  });

  it("calls only the first paid order the First order, and only when nothing older is unread", () => {
    const two = [entry("order.paid", "2026-01-01", { record: "o1" }), entry("order.paid", "2026-06-01", { record: "o2" })];
    expect(titles(two, true)).toEqual(["First order", "Order"]);
    expect(titles(two, false)).toEqual(["Order", "Order"]);
  });

  it("does not let reminders stretch a chapter", () => {
    expect(
      titles([
        entry("order.paid", "2026-03-01", { record: "o1" }),
        entry("campaign_email.sent", "2026-03-09"),
        entry("note.added", "2026-03-17"),
      ]),
    ).toEqual(["First order", "Note"]);
  });

  it("gathers reminders that stand alone into one quiet chapter", () => {
    const chapters = buildChapters(
      [
        entry("order.paid", "2026-01-01", { record: "o1" }),
        entry("campaign_email.sent", "2026-02-01"),
        entry("campaign_email.sent", "2026-03-01"),
        entry("checkup.sent", "2026-04-01"),
      ],
      { complete: true },
    );
    expect(chapters.map((c) => c.title)).toEqual(["First order", "Emails and reminders"]);
    expect(chapters[1]!.quiet).toBe(true);
    expect(chapters[1]!.entries).toHaveLength(3);
    expect(chapters[1]!.tone).toBe("steady");
  });

  it("splits quiet chapters more than 45 days apart", () => {
    expect(
      titles([entry("campaign_email.sent", "2026-01-01"), entry("campaign_email.sent", "2026-04-01")]),
    ).toEqual(["Emails and reminders", "Emails and reminders"]);
  });

  it("gives a review the request that prompted it, and leaves older reminders behind", () => {
    const chapters = buildChapters(
      [
        entry("campaign_email.sent", "2026-01-20"),
        entry("review_request.sent", "2026-02-20", { record: "rq" }),
        entry("google_review.written", "2026-02-24", { rating: 5 }),
      ],
      { complete: true },
    );
    expect(chapters.map((c) => c.title)).toEqual(["Emails and reminders", "5★ Google review"]);
    expect(chapters[0]!.entries.map((e) => e.kind)).toEqual(["campaign_email.sent"]);
    expect(chapters[1]!.entries.map((e) => e.kind)).toEqual(["google_review.written", "review_request.sent"]);
    expect(chapters[1]!.quiet).toBe(false);
  });

  it("turns a quiet chapter into a main one when every reminder is close", () => {
    const chapters = buildChapters(
      [entry("review_request.sent", "2026-02-20"), entry("google_review.written", "2026-02-24", { rating: 2 })],
      { complete: true },
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.quiet).toBe(false);
    expect(chapters[0]!.tone).toBe("care");
  });

  it("orders chapters oldest first whatever order the entries came in", () => {
    const chapters = buildChapters(
      [entry("note.added", "2026-09-01"), entry("fitting.recorded", "2025-10-04"), entry("order.paid", "2026-03-01")],
      { complete: true },
    );
    expect(chapters.map((c) => c.from.slice(0, 10))).toEqual(["2025-10-04", "2026-03-01", "2026-09-01"]);
    expect(chapters.map((c) => c.id)).toEqual(chapters.map((c) => `chapter:${c.entries[c.entries.length - 1]!.id}`));
  });

  it("lists the kind groups a chapter holds", () => {
    const [chapter] = buildChapters(
      [entry("order.paid", "2026-03-01"), entry("note.added", "2026-03-02"), entry("note.added", "2026-03-03")],
      { complete: true },
    );
    expect(chapter!.groups).toEqual(["orders", "notes"]);
  });

  it("leaves out an entry with no readable time", () => {
    expect(buildChapters([{ ...entry("note.added", "2026-03-01"), at: "never" }], { complete: true })).toEqual([]);
  });
});

describe("chapterTone", () => {
  const tone = (...entries: ShownTimelineEntry[]) => chapterTone(entries);

  it("is steady without a stated fact", () => {
    expect(tone(entry("note.added", "2026-01-01"), entry("order.placed", "2026-01-01"))).toEqual({
      tone: "steady",
      reason: null,
    });
    expect(tone(entry("google_review.written", "2026-01-01"))).toEqual({ tone: "steady", reason: null });
    expect(tone(entry("consent.unsubscribed", "2026-01-01")).tone).toBe("steady");
  });

  it("goes well on a paid order, a visit, a fitting, and four or five stars", () => {
    expect(tone(entry("order.paid", "2026-01-01"))).toEqual({ tone: "good", reason: "an order paid" });
    expect(tone(entry("readjustment.attended", "2026-01-01")).reason).toBe("a re-adjustment visit");
    expect(tone(entry("fitting.recorded", "2026-01-01")).reason).toBe("an in-store fitting");
    expect(tone(entry("review.submitted", "2026-01-01", { rating: 4 }))).toEqual({ tone: "good", reason: "a 4★ review" });
  });

  it("needs care on three stars or lower, a return, a refund, a cancellation and a no-show", () => {
    expect(tone(entry("google_review.written", "2026-01-01", { rating: 3 }))).toEqual({ tone: "care", reason: "a 3★ review" });
    expect(tone(entry("return.opened", "2026-01-01")).reason).toBe("a return");
    expect(tone(entry("order.refund_requested", "2026-01-01")).reason).toBe("a refund asked for");
    expect(tone(entry("order.cancelled", "2026-01-01")).reason).toBe("a cancelled order");
    expect(tone(entry("readjustment.no_show", "2026-01-01")).reason).toBe("a re-adjustment no-show");
  });

  it("lets needs care win over going well", () => {
    expect(tone(entry("order.paid", "2026-01-01"), entry("return.opened", "2026-01-03")).tone).toBe("care");
  });

  it("does not read a return's later status as a new problem", () => {
    expect(tone(entry("return.status_changed", "2026-01-01")).tone).toBe("steady");
  });
});

describe("isMinorEntry", () => {
  it("is what we sent, not what happened", () => {
    for (const kind of ["campaign_email.sent", "campaign_email.clicked", "order.email_sent", "aftercare.turned_off", "checkup.sent", "review_request.sent", "claim_link.opened"]) {
      expect(isMinorEntry({ kind })).toBe(true);
    }
    for (const kind of ["order.paid", "order.delivered", "note.added", "consent.unsubscribed", "account.claimed", "follow_up.done"]) {
      expect(isMinorEntry({ kind })).toBe(false);
    }
  });
});

describe("journeyNow", () => {
  const f = (id: string, dueOn: string) => ({ id, title: id, dueOn });

  it("is steady with nothing open", () => {
    expect(journeyNow([], "2026-11-15")).toEqual({ tone: "steady", reason: null, overdue: [], dueToday: [], next: null });
  });

  it("needs care when a follow-up is overdue", () => {
    const now = journeyNow([f("b", "2026-11-19"), f("a", "2026-11-08")], "2026-11-15");
    expect(now.tone).toBe("care");
    expect(now.reason).toBe("a follow-up overdue");
    expect(now.overdue.map((x) => x.id)).toEqual(["a"]);
    expect(now.next?.id).toBe("b");
  });

  it("counts several, and does not call today overdue", () => {
    const now = journeyNow([f("a", "2026-11-01"), f("b", "2026-11-02"), f("c", "2026-11-15")], "2026-11-15");
    expect(now.reason).toBe("2 follow-ups overdue");
    expect(now.dueToday.map((x) => x.id)).toEqual(["c"]);
    expect(now.next).toBeNull();
  });

  it("takes the earliest later one as the next stop", () => {
    expect(journeyNow([f("late", "2026-12-20"), f("soon", "2026-11-19")], "2026-11-15").next?.id).toBe("soon");
  });
});

describe("gapLabel", () => {
  const gap = (from: string, to: string) => gapLabel(`${from}T00:00:00Z`, `${to}T00:00:00Z`);

  it("reads in the largest unit that fits", () => {
    expect(gap("2026-11-12", "2026-11-15")).toBe("3 days");
    expect(gap("2026-11-14", "2026-11-15")).toBe("1 day");
    expect(gap("2026-10-01", "2026-11-05")).toBe("5 weeks");
    expect(gap("2026-02-24", "2026-10-21")).toBe("8 months");
    expect(gap("2025-10-04", "2026-02-24")).toBe("5 months");
    expect(gap("2024-01-01", "2026-06-01")).toBe("2 years");
  });

  it("is nothing under a day, or backwards", () => {
    expect(gapLabel("2026-11-15T01:00:00Z", "2026-11-15T20:00:00Z")).toBeNull();
    expect(gap("2026-11-15", "2026-11-12")).toBeNull();
  });
});

describe("filters", () => {
  it("cover every kind group once", () => {
    const groups = JOURNEY_FILTERS.flatMap((f) => f.groups);
    expect(new Set(groups).size).toBe(groups.length);
    expect(groups.slice().sort()).toEqual(
      ["account", "aftercare", "fittings", "followups", "marketing", "notes", "orders", "readjustments", "results", "returns", "reviews"],
    );
  });

  it("show only where the viewer may see a group", () => {
    expect(visibleFilters(["notes", "account"]).map((f) => f.key)).toEqual(["conversations", "account"]);
    expect(visibleFilters([])).toEqual([]);
  });

  it("narrow a chapter's entries", () => {
    const [chapter] = buildChapters(
      [entry("order.paid", "2026-03-01"), entry("note.added", "2026-03-02")],
      { complete: true },
    );
    const orders = JOURNEY_FILTERS.find((f) => f.key === "orders")!;
    expect(chapterEntries(chapter!, orders).map((e) => e.kind)).toEqual(["order.paid"]);
    expect(chapterEntries(chapter!, null)).toHaveLength(2);
  });
});

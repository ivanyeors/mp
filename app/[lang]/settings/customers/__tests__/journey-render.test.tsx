import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { ShownTimelineEntry } from "@/lib/crm/timeline/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers/c1",
}));

const { ChapterCard, NowCard } = await import("../[id]/customer-journey");
const { JourneyMap } = await import("../[id]/journey-map");
const { buildChapters, journeyNow } = await import("@/lib/crm/journey/chapters");

const entries: ShownTimelineEntry[] = [
  {
    id: "google_review.written:g1",
    at: "2026-02-23T08:00:00Z",
    kind: "google_review.written",
    ref: { type: "google_review", id: "g1" },
    summary: "Google review: 1★",
    status: "Not replied yet",
    rating: 1,
    group: "reviews",
  },
  {
    id: "note.added:n1",
    at: "2026-02-26T08:00:00Z",
    kind: "note.added",
    ref: { type: "customer_note", id: "n1" },
    summary: "Note by Sophie",
    detail: "Called about the review.",
    group: "notes",
  },
  {
    id: "order.paid:o1",
    at: "2026-02-20T08:00:00Z",
    kind: "order.paid",
    ref: { type: "order", id: "o1", href: "/settings/orders/o1" },
    summary: "Order #1042 paid",
    group: "orders",
  },
];
const [chapter] = buildChapters(entries, { complete: true });

const strip = (html: string) => html.replace(/<!-- -->/g, "");

describe("a chapter", () => {
  const card = (over: Partial<Parameters<typeof ChapterCard>[0]> = {}) =>
    strip(
      renderToString(
        <ChapterCard chapter={chapter!} entries={chapter!.entries} filtered={false} locale="en-US" actions={() => null} {...over} />,
      ),
    );

  it("is named for its most telling entry, with its dates and why it sits where it does", () => {
    const html = card();
    expect(html).toContain("1★ Google review");
    expect(html).toContain("20 Feb 2026 to 26 Feb 2026");
    expect(html).toContain("Needs care");
    expect(html).toContain("a 1★ review");
  });

  it("lists its entries newest first, with their status, detail and link", () => {
    const html = card();
    expect(html.indexOf("Note by Sophie")).toBeLessThan(html.indexOf("Google review: 1★"));
    expect(html.indexOf("Google review: 1★")).toBeLessThan(html.indexOf("Order #1042 paid"));
    expect(html).toContain("Called about the review.");
    expect(html).toContain("Not replied yet");
    expect(html).toContain('href="/en-US/settings/orders/o1"');
  });

  it("puts an entry's buttons under it, and what it is handed under the entries", () => {
    const html = card({
      actions: (e) => (e.kind === "note.added" ? <button>Delete note</button> : null),
      extra: <p>From Shopify facts</p>,
    });
    expect(html).toContain("Delete note");
    expect(html).toContain("From Shopify facts");
  });

  it("says so when a filter leaves it empty, and holds the extra back", () => {
    const html = card({ entries: [], filtered: true, extra: <p>From Shopify facts</p> });
    expect(html).toContain("Nothing of this kind in this chapter.");
    expect(html).not.toContain("From Shopify facts");
  });
});

describe("Now", () => {
  it("says nothing is open, and stays steady", () => {
    const html = strip(
      renderToString(<NowCard now={journeyNow([], "2026-11-15")} nextStepText={null} followUps={[]} today="2026-11-15" actions={() => null} />),
    );
    expect(html).toContain("No follow-up is open, and nothing is due.");
    expect(html).toContain("Steady");
    expect(html).not.toContain("Needs care");
  });

  it("carries the Next step", () => {
    const html = strip(
      renderToString(
        <NowCard now={journeyNow([], "2026-11-15")} nextStepText="Check-up due" followUps={[]} today="2026-11-15" actions={() => null} />,
      ),
    );
    expect(html).toContain("Next step");
    expect(html).toContain("Check-up due");
  });
});

describe("the map", () => {
  const html = strip(
    renderToString(
      <JourneyMap
        stops={[
          { id: "a", title: "First order", when: "1 Mar 2026", tone: "good", kind: "past", count: 4 },
          { id: "b", title: "1★ Google review", when: "23 Feb 2026", tone: "care", kind: "past", count: 2, dimmed: true },
          { id: "now", title: "Now", when: "At risk", tone: "care", kind: "now" },
          { id: "next", title: "Check the new fill", when: "Due 19 Nov 2026", tone: "steady", kind: "next" },
        ]}
        gaps={["8 months", "3 days", "in 4 days"]}
        selectedId="now"
        onSelect={() => {}}
      />,
    ),
  );

  it("draws every stop as a button that reads out its title, date, height and the quiet before it", () => {
    expect((html.match(/<button/g) ?? []).length).toBe(4);
    expect(html).toContain('aria-label="First order, 1 Mar 2026. Going well, 4 entries"');
    expect(html).toContain('aria-label="1★ Google review, 23 Feb 2026. Needs care, 2 entries. 8 months after the chapter before"');
    expect(html).toContain('aria-label="Check the new fill, Due 19 Nov 2026. Steady. in 4 days after the chapter before"');
  });

  it("marks the selected stop", () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Now, At risk/);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });

  it("names the three heights", () => {
    for (const label of ["Going well", "Steady", "Needs care"]) expect(html, label).toContain(label);
  });
});

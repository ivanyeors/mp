import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { summariseDropOffs, type DropOffRow } from "@/lib/analytics/drop-off/store";

/**
 * PRD-crm-retention-loop slice 10: *Why people leave* on Analytics. Every
 * number is written out beside its bar, typed answers are shown to Staff,
 * and an empty window says where the question is asked.
 */

vi.mock("../drop-off-actions", () => ({ getDropOffReasons: vi.fn(async () => null) }));
const { DropOffReasonsCard } = await import("../DropOffReasonsCard");

const NOW = new Date("2026-10-27T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const rows: DropOffRow[] = [
  { step: "configurator", reason: "size_or_feel", other_text: null, created_at: daysAgo(1) },
  { step: "configurator", reason: "size_or_feel", other_text: null, created_at: daysAgo(2) },
  { step: "checkout", reason: "delivery", other_text: null, created_at: daysAgo(3) },
  { step: "quote_decline", reason: "other", other_text: "Found a <b>cheaper</b> one", created_at: daysAgo(4) },
];

describe("Why people leave", () => {
  it("writes out every count, the share, the steps and where each reason points", () => {
    const html = renderToString(<DropOffReasonsCard initial={summariseDropOffs(rows, { days: 30, now: NOW })} />);
    expect(html).toContain("Why people leave");
    expect(html).toContain("Not sure about the size or feel");
    expect(html).toContain("2<!-- --> · <!-- -->50<!-- -->%");
    expect(html).toContain("Configurator 2");
    expect(html).toContain("Points to: <!-- -->Sizing guidance and the configurator");
    expect(html).toContain("Declined a quote");
    expect(html).toContain("Answers per week");
  });

  it("shows typed answers as text, never as markup", () => {
    const html = renderToString(<DropOffReasonsCard initial={summariseDropOffs(rows, { days: 30, now: NOW })} />);
    expect(html).toContain("In their words");
    expect(html).toContain("Found a &lt;b&gt;cheaper&lt;/b&gt; one");
    expect(html).not.toContain("<b>cheaper</b>");
  });

  it("says where the question is asked when there are no answers yet", () => {
    const html = renderToString(<DropOffReasonsCard initial={summariseDropOffs([], { days: 30, now: NOW })} />);
    expect(html).toContain("No answers yet");
    expect(html).not.toContain("Reasons, most given first");
  });
});

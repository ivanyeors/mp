import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resultsFromRows } from "@/lib/email-campaigns/results";
import { NO_STATS, type CampaignStats } from "@/lib/email-campaigns/store";
import { CampaignResultsPanel } from "../results-panel";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const stats = (over: Partial<CampaignStats>): CampaignStats => ({ ...NO_STATS, ...over });
const row = (cohort: string, stage: string, over: Record<string, unknown>) => ({ cohort, stage, ...over });

describe("CampaignResultsPanel", () => {
  it("reads as the demo: sent, clicked, unsubscribed, spam, bought within 30 days, by stage", () => {
    const html = text(
      renderToStaticMarkup(
        <CampaignResultsPanel
          stats={stats({ handed: 240, clicked: 31, unsubscribed: 2, complained: 0, bought: 9, boughtAfterClick: 4, boughtTotal: 2140, counting: 0 })}
          results={resultsFromRows([
            row("sent", "new", { people: 140, clicked: 15, unsubscribed: 1, bought: 5, bought_total: 1300 }),
            row("sent", "at_risk", { people: 100, clicked: 16, unsubscribed: 1, bought: 4, bought_total: 840 }),
            row("sent", "loyal", { people: 0 }),
          ])}
        />,
      ),
    );
    expect(html).toContain("Sent 240");
    expect(html).toContain("Clicked 31 13%");
    expect(html).toContain("Unsubscribed 2 0.8%");
    expect(html).toContain("Marked as spam 0 0%");
    expect(html).toContain("Bought within 30 days 9 3.8% · S$2,140 · 4 after a click");
    expect(html).toContain("not every purchase here came from this email");
    expect(html).toContain("By stage when sent");
    expect(html).toContain("New · sent 140");
    expect(html).toContain("At risk · sent 100");
    expect(html).not.toContain("Loyal · sent");
    expect(html).not.toContain("holdout below");
  });

  it("says when the 30 days are still open, and shows the holdout beside the people sent", () => {
    const html = text(
      renderToStaticMarkup(
        <CampaignResultsPanel
          stats={stats({ handed: 600, heldOut: 24, bought: 30, counting: 120 })}
          results={resultsFromRows([
            row("sent", "lead", { people: 600, bought: 30 }),
            row("held_out", "lead", { people: 24, bought: 1 }),
            row("sent_since_holdout", "lead", { people: 216, bought: 9 }),
          ])}
        />,
      ),
    );
    expect(html).toContain("24 held out");
    expect(html).toContain("Still counting: 120 of them were sent under 30 days ago");
    expect(html).toContain("Did it bring people back? The holdout");
    expect(html).toContain("9 of 216 bought within 30 days");
    expect(html).toContain("1 of 24 bought within 30 days");
    expect(html).toContain("240 people compared");
    expect(html).toContain("Too close to call");
  });

  it("shows a dash, never 0%, where nobody in a stage was sent, and nothing before the first wave", () => {
    expect(text(renderToStaticMarkup(<CampaignResultsPanel stats={NO_STATS} results={null} />))).toContain(
      "Nothing has been sent yet",
    );
    const html = text(renderToStaticMarkup(<CampaignResultsPanel stats={stats({ handed: 5 })} results={null} />));
    expect(html).toContain("could not be read");
    expect(html).toContain("Clicked 0 0%");
    const held = text(renderToStaticMarkup(<CampaignResultsPanel stats={stats({ heldOut: 3 })} results={resultsFromRows([])} />));
    expect(held).toContain("Sent 0 3 held out");
    expect(held).toContain("Clicked 0 —");
    expect(held).toContain("Bought within 30 days 0 — · 0 after a click");
  });
});

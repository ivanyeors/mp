import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { lifecycleSummary } from "@/lib/crm/lifecycle-summary";
import { LifecycleCard } from "../lifecycle-card";

/** The Customer lifecycle card above the Customers list (2026-10-31). */

const summary = lifecycleSummary([
  { stage: "lead", detail: null, undated: false, customers: 500 },
  { stage: "new", detail: "delivered", undated: false, customers: 40 },
  { stage: "new", detail: null, undated: true, customers: 1000 },
  { stage: "loyal", detail: "repeat_purchases", undated: true, customers: 300 },
  { stage: "at_risk", detail: "lapsed", undated: false, customers: 5 },
]);

const card = (activeStage: Parameters<typeof LifecycleCard>[0]["activeStage"] = null) =>
  renderToString(
    <LifecycleCard
      summary={summary}
      activeStage={activeStage}
      stageHref={(s) => `/en-US/settings/customers?stage=${s.replace("_", "-")}`}
      onChooseStage={() => {}}
    />,
  );

describe("Customer lifecycle card", () => {
  it("draws one row per stage, in funnel order, each a link to that stage's list", () => {
    const html = card();
    const order = ["lead", "new", "loyal", "at_risk", "lost"].map((s) => html.indexOf(`data-stage="${s}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('href="/en-US/settings/customers?stage=at-risk"');
    expect(html).toContain("Where each of your 1,845 customers is now. Choose a stage to list them.");
  });

  it("names each row's stage, share and sub-statuses for a screen reader", () => {
    const html = card();
    expect(html).toContain('aria-label="New: 1,040 customers, 56% of all. Delivered 40, No dates yet 1,000. Show them in the list."');
    expect(html).toContain("Loyal: 300 customers, 16% of all. Repeat purchases 300. 300 with no dates yet.");
    expect(html).toContain("Lost: 0 customers, 0% of all.");
  });

  it("lists the sub-statuses under the bar, and explains the hatching once", () => {
    const html = card();
    expect(html).toContain("Delivered 40");
    expect(html).toContain("300 with no dates yet");
    expect(html).toContain("Hatched: no dates yet.");
  });

  it("marks the stage the list is filtered to", () => {
    const html = card("loyal");
    expect(html).toMatch(/aria-current="true"[^>]*>|data-stage="loyal"><a[^>]*aria-current="true"/);
    expect(html).toContain("Showing them in the list; choose again to show everyone.");
  });

  it("opens on phones as a one-line summary", () => {
    expect(card()).toContain("Loyal");
    expect(card()).toMatch(/1,845<\/span> customers, <span[^>]*>300 \(16%\)<\/span> Loyal/);
  });

  it("is left out with no Customers", () => {
    const html = renderToString(
      <LifecycleCard summary={lifecycleSummary([])} activeStage={null} stageHref={() => "#"} onChooseStage={() => {}} />,
    );
    expect(html).toBe("");
  });
});

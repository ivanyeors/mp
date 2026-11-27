import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SEEDED_MILESTONES } from "@/lib/points/milestones";
import { PointsCard, PointsComingSoonCard } from "../points-card";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
const layer = (html: string, section: string) => html.split(`data-section="${section}"`)[1] ?? "";
const alwaysShown = (html: string) =>
  text(html.replace(/<details[\s\S]*?<\/details>/g, (d) => d.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? ""));

describe("Profile → Points (PRD-loyalty-points slice 02)", () => {
  const html = renderToStaticMarkup(
    <PointsCard
      balance={{ available: 2130, pending: 540 }}
      pending={[
        { orderId: "o1", orderNumber: "MP-10428", points: 540, releaseAt: "2026-11-19T02:00:00Z" },
        { orderId: "o2", orderNumber: "MP-10431", points: 90, releaseAt: null },
      ]}
      termsHref="/en-US/points"
      shopHref="/en-US/shop"
    />,
  );

  it("leads with the balance as one number and what it is worth, with the way to the shop", () => {
    expect(text(layer(html, "points-hero"))).toMatch(/^[^P]*PointsShop2,130 pointsWorth S\$21\.30 off shop orders/);
    expect(html).toContain('href="/en-US/shop"');
    expect(html).toMatch(/<section[^>]*data-typography-scope="app"/);
    expect(alwaysShown(html)).not.toMatch(/\. /);
  });

  it("lists what is pending as one row per order, with when it becomes usable", () => {
    const pending = text(layer(html, "points-pending"));
    expect(pending).toContain("Order MP-10428Usable from 19 November 2026+540 points");
    expect(pending).toContain("Order MP-10431Usable 30 days after delivery+90 points");
  });

  it("keeps the rules one tap away: they never expire, the two exclusions and the terms", () => {
    const facts = layer(html, "points-facts");
    expect(text(facts)).toContain("How points work");
    expect(text(facts)).toContain("100 points take S$1 off a shop order, in S$1 steps, at checkout.");
    expect(text(facts)).toContain("Points don't expire.");
    expect(text(facts)).toContain("can't be used on custom pillows, and points used are not refunded");
    expect(facts).toContain('href="/en-US/points"');
    expect(html).not.toMatch(/expires on/i);
    expect(alwaysShown(html)).not.toContain("custom pillows");
  });

  it("says what points are for when there are none yet", () => {
    const empty = renderToStaticMarkup(
      <PointsCard balance={{ available: 0, pending: 0 }} pending={[]} termsHref="/en-US/points" shopHref="/en-US/shop" />,
    );
    expect(text(layer(empty, "points-hero"))).toContain("0 pointsMoney off shop orders");
    expect(empty).not.toContain("Worth");
    expect(empty).not.toContain("On their way");
  });

  it("before the launch, says coming soon with the earn rate and no balance", () => {
    const soon = renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={3} termsHref="/en-US/points" />);
    expect(soon).toContain("Coming soon");
    expect(text(soon)).toContain("You'll earn 3 points for every S$1 you pay for products, before GST.");
    expect(text(soon)).toContain("100 points take S$1 off a later shop order.");
    expect(text(soon)).toContain("Points don't expire.");
    expect(soon).toContain('href="/en-US/points"');
    expect(soon).not.toContain("Worth");
    expect(soon).not.toMatch(/shopify|migrat|moving/i);
  });
});

describe("Profile → Points → Bonus milestones (PRD-loyalty-points slice 09)", () => {
  const ladder = [...SEEDED_MILESTONES];
  const balance = (pending: number) => ({ available: 1750, pending });
  const live = (earned: number, pending = 0, milestones: { ladder: typeof ladder; earned: number } | null = { ladder, earned }) =>
    renderToStaticMarkup(
      <PointsCard balance={balance(pending)} pending={[]} milestones={milestones} termsHref="/en-US/points" shopHref="/en-US/shop" />,
    );

  it("names the next bonus and how far the points earned from orders have got, with points on their way shown lighter", () => {
    const html = live(1750, 500);
    const shown = alwaysShown(html);
    expect(shown).toContain("Next bonus+300 points (S$3)");
    expect(shown).toContain("1,750 of 2,500 points earned from orders");
    expect(html).toContain("width:50%");
    expect(html).toContain("width:83.3%");
    expect(text(html)).toContain("Only points earned from orders count towards a bonus. Points on their way count once they're usable.");
  });

  it("counts points earned from orders, not the balance, so a bonus-only balance reads as none earned yet", () => {
    const shown = alwaysShown(live(0));
    expect(shown).toContain("Next bonus+100 points (S$1)");
    expect(shown).toContain("0 of 1,000 points earned from orders");
    expect(live(0)).not.toMatch(/width:/);
  });

  it("opens to the whole ladder, each milestone with its bonus and whether it is reached", () => {
    const html = live(1750);
    const ladderText = text(layer(html, "points-milestones"));
    expect(ladderText).toContain("At 1,000 points earned+100 points(S$1), reached");
    expect(ladderText).toContain("At 2,500 points earned+300 points(S$3)At 5,000");
    expect(ladderText).toContain("At 10,000 points earned+2,000 points(S$20)");
    expect(alwaysShown(html)).not.toContain("+2,000");
  });

  it("says so once every milestone is reached, and shows nothing without a ladder", () => {
    expect(alwaysShown(live(10000))).toContain("You've reached every milestone.");
    expect(alwaysShown(live(10000))).toContain("Bonus milestones");
    expect(live(10000)).not.toContain("Next bonus");
    expect(live(500, 0, null)).not.toContain("milestone");
    expect(live(500, 0, { ladder: [], earned: 500 })).not.toContain("milestone");
    expect(live(500, 0, null)).not.toContain("count towards a bonus");
  });

  it("before the launch, shows the ladder with nothing filled", () => {
    const html = renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={3} milestones={ladder} termsHref="/en-US/points" />);
    expect(text(html)).toContain("Bonus milestones");
    expect(text(html)).toContain("Bonus points as the points you earn from orders add up.");
    expect(html).toContain("+2,000");
    expect(html).toContain("10,000");
    expect(html).not.toContain("Next bonus");
    expect(html).not.toMatch(/width:/);
    expect(html).not.toContain("reached");
    expect(html).not.toMatch(/shopify|migrat|moving/i);
    expect(renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={3} termsHref="/en-US/points" />)).not.toContain("milestone");
  });
});

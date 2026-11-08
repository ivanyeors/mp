import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SEEDED_MILESTONES } from "@/lib/points/milestones";
import { PointsCard, PointsComingSoonCard } from "../points-card";

describe("Profile → Points (PRD-loyalty-points slice 02)", () => {
  it("shows the balance in points and dollars, what is pending and when, that they never expire, and the two exclusions", () => {
    const html = renderToStaticMarkup(
      <PointsCard
        balance={{ available: 213, pending: 54 }}
        pending={[
          { orderId: "o1", orderNumber: "MP-10428", points: 54, releaseAt: "2026-11-19T02:00:00Z" },
          { orderId: "o2", orderNumber: "MP-10431", points: 9, releaseAt: null },
        ]}
        termsHref="/en-US/points"
        shopHref="/en-US/shop"
      />,
    );
    expect(html).toContain("Your points: 213 points (S$21.30)");
    expect(html).toContain("They don&#x27;t expire.");
    expect(html).not.toMatch(/expires on/i);
    expect(html).toContain("54 points (S$5.40) from order MP-10428, usable from 19 November 2026");
    expect(html).toContain("usable 30 days after it&#x27;s delivered");
    expect(html).toContain("can&#x27;t be used on custom pillows, and points used are not refunded");
    expect(html).toContain('href="/en-US/points"');
  });

  it("before the launch, says coming soon with the earn rate and no balance", () => {
    const html = renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={1} termsHref="/en-US/points" />);
    expect(html).toContain("Coming soon");
    expect(html).toContain("You&#x27;ll earn 1 point for every S$1 you pay for products, before GST.");
    expect(html).toContain("10 points take S$1 off. They don&#x27;t expire.");
    expect(html).toContain('href="/en-US/points"');
    expect(html).not.toContain("Your points");
    expect(html).not.toMatch(/shopify|migrat|moving/i);
  });
});

describe("Profile → Points → Bonus milestones (PRD-loyalty-points slice 09)", () => {
  const ladder = [...SEEDED_MILESTONES];
  const balance = (pending: number) => ({ available: 175, pending });
  const live = (earned: number, pending = 0, milestones: { ladder: typeof ladder; earned: number } | null = { ladder, earned }) =>
    renderToStaticMarkup(
      <PointsCard balance={balance(pending)} pending={[]} milestones={milestones} termsHref="/en-US/points" shopHref="/en-US/shop" />,
    );

  it("says how far to the next milestone and what it adds, with points on their way shown lighter", () => {
    const html = live(175, 50);
    expect(html).toContain("Bonus milestones");
    expect(html).toContain("Earn 75 more points from orders to reach 250, and we&#x27;ll add 30 points (S$3).");
    expect(html).toContain("The lighter part is points on their way: they count once they&#x27;re usable.");
    expect(html).toContain("100 points earned from orders: 10 points added, reached.");
    expect(html).toContain("250 points earned from orders: 30 points added.");
    // Milestone 2's stretch: half earned, five-sixths with pending.
    expect(html).toContain("width:50%");
    expect(html).toContain("width:83.3%");
  });

  it("says so once every milestone is reached, and shows nothing without a ladder", () => {
    expect(live(1000)).toContain("You&#x27;ve reached every milestone.");
    expect(live(1000)).not.toContain("on their way: they count");
    expect(live(50, 0, null)).not.toContain("Bonus milestones");
    expect(live(50, 0, { ladder: [], earned: 50 })).not.toContain("Bonus milestones");
  });

  it("before the launch, shows the ladder with nothing filled", () => {
    const html = renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={1} milestones={ladder} termsHref="/en-US/points" />);
    expect(html).toContain("Bonus milestones");
    expect(html).toContain("we&#x27;ll add bonus points at each milestone");
    expect(html).toContain("+200");
    expect(html).toContain("1,000");
    expect(html).not.toContain("more points from orders to reach");
    expect(html).not.toContain("reached.");
    expect(html).not.toMatch(/shopify|migrat|moving/i);
    expect(renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={1} termsHref="/en-US/points" />)).not.toContain("Bonus milestones");
  });
});

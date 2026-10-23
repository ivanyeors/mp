import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PointsCard, PointsComingSoonCard } from "../points-card";

describe("Profile → Points (PRD-loyalty-points slice 02)", () => {
  it("shows the balance in points and dollars, what is pending and when, the expiry, and the two exclusions", () => {
    const html = renderToStaticMarkup(
      <PointsCard
        balance={{ available: 2130, pending: 540, lastPurchaseAt: "2026-10-20T00:00:00Z", expiresOn: "2028-10-20" }}
        pending={[
          { orderId: "o1", orderNumber: "MP-10428", points: 540, releaseAt: "2026-11-19T02:00:00Z" },
          { orderId: "o2", orderNumber: "MP-10431", points: 90, releaseAt: null },
        ]}
        termsHref="/en-US/points"
        shopHref="/en-US/shop"
      />,
    );
    expect(html).toContain("Your points: 2,130 points (S$21.30)");
    expect(html).toContain("Expires on 20 October 2028.");
    expect(html).toContain("540 points (S$5.40) from order MP-10428, usable from 19 November 2026");
    expect(html).toContain("usable 30 days after it&#x27;s delivered");
    expect(html).toContain("can&#x27;t be used on custom pillows, and points used are not refunded");
    expect(html).toContain('href="/en-US/points"');
  });

  it("before the launch, says coming soon with the earn rate and no balance", () => {
    const html = renderToStaticMarkup(<PointsComingSoonCard earnPerDollar={3} termsHref="/en-US/points" />);
    expect(html).toContain("Coming soon");
    expect(html).toContain("You&#x27;ll earn 3 points for every S$1 you pay for products, before GST.");
    expect(html).toContain("100 points take S$1 off.");
    expect(html).toContain('href="/en-US/points"');
    expect(html).not.toContain("Your points");
    expect(html).not.toMatch(/shopify|migrat|moving/i);
  });
});

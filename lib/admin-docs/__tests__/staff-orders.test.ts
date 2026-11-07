import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DocArticle } from "@/components/settings/doc-article";
import { PAY_LINK_LIFETIME_DAYS } from "@/lib/staff-orders/shared";
import { ADMIN_GUIDES } from "../guides";
import { staffOrdersGuideSections } from "../staff-orders";

/** Documentation → Selling from the Customer page (ADR 0048). */

describe("Staff orders guide", () => {
  const sections = staffOrdersGuideSections();
  const words = sections
    .flatMap((s) => s.blocks)
    .map((b) => ("text" in b ? b.text : "items" in b ? b.items.map((i) => (typeof i === "string" ? i : i.label)).join(" ") : "rows" in b ? b.rows.flat().join(" ") : ""))
    .join(" ");

  it("runs what → make → send → pay → after, and is listed", () => {
    expect(sections.map((s) => s.id)).toEqual(["what", "make", "send", "pay", "after"]);
    expect(ADMIN_GUIDES.map((g) => g.slug)).toContain("staff-orders");
  });

  it("reads the link's lifetime from the code, and says Staff never set a price", () => {
    expect(words).toContain(`works for ${PAY_LINK_LIFETIME_DAYS} days`);
    expect(words).toContain("never the price");
    expect(words).toContain("customised pillow or bolster is not sold here");
  });

  it("links to Customers with the locale", () => {
    const html = renderToStaticMarkup(createElement(DocArticle, { sections, to: (href: string) => `/en-US${href}` }));
    expect(html).toContain('href="/en-US/settings/customers"');
  });
});

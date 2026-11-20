import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DocArticle } from "@/components/settings/doc-article";
import { metaTestersGuideSections } from "../meta-testers";

describe("Meta testers guide", () => {
  const sections = metaTestersGuideSections();

  it("runs why → add → accept → test → remove, with unique anchors", () => {
    expect(sections.map((s) => s.id)).toEqual(["why", "add", "accept", "test", "remove"]);
  });

  it("says to add a Tester, not an admin", () => {
    const add = sections.find((s) => s.id === "add")!;
    const words = add.blocks.map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : "")).join(" ");
    expect(words).toContain("choose Tester");
    expect(words).toContain("App roles → Roles");
  });

  it("links to the Telegram tab with the locale", () => {
    const html = renderToStaticMarkup(
      createElement(DocArticle, { sections, to: (href: string) => `/en-US${href}` }),
    );
    expect(html).toContain('href="#accept"');
    expect(html).toContain('href="/en-US/settings/users?tab=telegram"');
  });
});

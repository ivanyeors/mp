/**
 * Renders every template with every free-text field set to an injection probe.
 *
 * This is the regression lock for the bug this design system was built to kill:
 * `app/api/results/[id]/assign/route.ts` used to interpolate admin-editable item
 * names straight into HTML, so an item named `<img src=x onerror=...>` landed
 * verbatim in a customer's inbox.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import { HOSTILE } from "../__fixtures__/samples";

describe("email escaping", () => {
  describe.each(EMAIL_REGISTRY.map((c) => [c.id, c] as const))("%s", (_id, entry) => {
    const rendered = entry.render("hostile");

    it("never emits the probe as live markup", () => {
      // The escaped probe still contains the literal text "onerror=", which is
      // inert — so assert on raw TAGS, which is what would actually execute.
      expect(rendered.html).not.toContain("<img src=x");
      expect(rendered.html).not.toContain("</script>");
      expect(rendered.html).not.toMatch(/<script\b/i);
      // The only <img> tags in any email are the two logo variants; an injected
      // one would push this count up.
      expect(rendered.html.match(/<img\b/gi) ?? []).toHaveLength(2);
    });

    it("still renders a valid single document", () => {
      expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
      expect(rendered.html.match(/<html\b/g)).toHaveLength(1);
    });
  });

  it("escapes rather than silently dropping the probe", () => {
    // At least one template must actually interpolate the probe — otherwise the
    // assertions above would pass vacuously on a template that ignores its input.
    const withProbe = EMAIL_REGISTRY.map((c) => c.render("hostile")).filter((r) =>
      r.html.includes("&lt;img src=x onerror=alert(1)&gt;"),
    );
    expect(withProbe.length).toBeGreaterThan(0);
  });

  it("keeps the probe intact in the plain-text body", () => {
    // Text bodies are not HTML, so the raw probe there is correct — asserting it
    // documents the boundary rather than leaving it ambiguous.
    const assigned = EMAIL_REGISTRY.find((c) => c.id === "results.assigned")!;
    expect(assigned.render("hostile").text).toContain(HOSTILE);
  });
});

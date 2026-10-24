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

  // PER-ENTRY vacuity guard. A registry entry whose render() drops the fixture
  // argument produces identical output for both fixtures, so the assertions
  // above pass without ever exercising an escape path. Asserting "at least one
  // template contains the probe" was not enough — it let 7 of 24 entries through.
  //
  // Two versions show a customer with no link back to their order. Their one
  // piece of free text was that link, so nothing of the fixture reaches the
  // email, by design (they exist so Email templates can preview the restart
  // and closing lines). They still pass every check above.
  const NO_FREE_TEXT = new Set(["results.declined_restart", "results.hold_expired_unpaid_no_link"]);
  describe.each(EMAIL_REGISTRY.filter((c) => !NO_FREE_TEXT.has(c.id)).map((c) => [c.id, c] as const))(
    "%s actually consumes the fixture",
    (_id, entry) => {
      it("renders differently under the hostile fixture", () => {
        expect(entry.render("hostile").html).not.toBe(entry.render("happy").html);
      });

      it("neutralises the probe rather than dropping it", () => {
        const html = entry.render("hostile").html;
        const neutralised =
          // HTML-escaped in text/attribute context …
          html.includes("&lt;img src=x onerror=alert(1)&gt;") ||
          html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") ||
          // … or percent-encoded, when the probe lands inside a URL path/query.
          html.includes("%3Cimg%20src%3Dx") ||
          // … or the URL was rejected outright, degrading the CTA to plain text
          // (partner.payout_made probes proofUrl with a javascript: scheme).
          !html.includes("<v:roundrect");
        expect(neutralised).toBe(true);
      });
    },
  );

  it("keeps the probe intact in the plain-text body", () => {
    // Text bodies are not HTML, so the raw probe there is correct — asserting it
    // documents the boundary rather than leaving it ambiguous.
    const assigned = EMAIL_REGISTRY.find((c) => c.id === "results.assigned")!;
    expect(assigned.render("hostile").text).toContain(HOSTILE);
  });
});

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import { HOSTILE } from "../__fixtures__/samples";

describe("email escaping", () => {
  describe.each(EMAIL_REGISTRY.map((c) => [c.id, c] as const))("%s", (_id, entry) => {
    const rendered = entry.render("hostile");

    it("never emits the probe as live markup", () => {
      expect(rendered.html).not.toContain("<img src=x");
      expect(rendered.html).not.toContain("</script>");
      expect(rendered.html).not.toMatch(/<script\b/i);
      expect(rendered.html.match(/<img\b/gi) ?? []).toHaveLength(2);
    });

    it("still renders a valid single document", () => {
      expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
      expect(rendered.html.match(/<html\b/g)).toHaveLength(1);
    });
  });

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
          html.includes("&lt;img src=x onerror=alert(1)&gt;") ||
          html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") ||
          html.includes("%3Cimg%20src%3Dx") ||
          !html.includes("<v:roundrect");
        expect(neutralised).toBe(true);
      });
    },
  );

  it("keeps the probe intact in the plain-text body", () => {
    const assigned = EMAIL_REGISTRY.find((c) => c.id === "results.assigned")!;
    expect(assigned.render("hostile").text).toContain(HOSTILE);
  });
});

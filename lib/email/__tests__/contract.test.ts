/**
 * Shared contract every registered email must satisfy. This is what stops the
 * design system from rotting one template at a time: a new template that skips
 * the shell, forgets a plain-text body, or emits a relative link fails here.
 */

// Deterministic origin for the absolute-URL assertions (getSiteOrigin() would
// otherwise resolve to localhost). Must be set before the registry imports base.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";

const ORIGIN = "https://custom.mpillow.com";

/** Every href/src value in the document. */
function urlsIn(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
}

describe("email contract", () => {
  it("registers every template exactly once", () => {
    const ids = EMAIL_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  describe.each(EMAIL_REGISTRY.map((c) => [c.id, c] as const))("%s", (_id, entry) => {
    const rendered = entry.render("happy");

    it("has a usable subject", () => {
      expect(rendered.subject.trim()).not.toBe("");
      expect(rendered.subject).not.toMatch(/[\r\n]/);
      expect(rendered.subject.length).toBeLessThanOrEqual(120);
      expect(rendered.subject).not.toMatch(/<[a-z]/i);
    });

    it("has a plain-text alternative", () => {
      expect(rendered.text.trim().length).toBeGreaterThan(20);
      // A stray tag in the text body means someone pasted HTML into it.
      expect(rendered.text).not.toMatch(/<(p|div|table|a|br)\b/i);
    });

    it("is a complete HTML document", () => {
      expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
      expect(rendered.html).toContain('<meta charset="utf-8"');
      expect(rendered.html).toContain('<html lang="en"');
      expect(rendered.html).toContain('name="viewport"');
      expect(rendered.html).toContain('name="color-scheme"');
      expect(rendered.html).toContain("</html>");
      // Exactly one document — catches a template being wrapped in the shell twice.
      expect(rendered.html.match(/<html\b/g)).toHaveLength(1);
      expect(rendered.html.match(/<body\b/g)).toHaveLength(1);
    });

    it("is table-based with Outlook resets", () => {
      expect(rendered.html).toContain('role="presentation"');
      expect(rendered.html).toContain('cellpadding="0" cellspacing="0" border="0"');
      expect(rendered.html).toContain("mso-line-height-rule:exactly");
    });

    it("carries branding and preheader text", () => {
      expect(rendered.html).toContain(`${ORIGIN}/mpillow_logo_2026.png`);
      expect(rendered.html).toContain("Mellow Life Pte Ltd");
      expect(rendered.html).toContain("mso-hide:all");
    });

    it("executes nothing", () => {
      expect(rendered.html).not.toMatch(/<script/i);
      expect(rendered.html).not.toMatch(/javascript:/i);
      // Inline event handlers — ` onerror=`, ` onclick=`, …
      expect(rendered.html).not.toMatch(/\son[a-z]+\s*=/i);
    });

    it("uses only absolute URLs", () => {
      for (const url of urlsIn(rendered.html)) {
        // The MSO ghost table and VML namespaces are not links.
        if (url.startsWith("urn:schemas-microsoft-com")) continue;
        expect(url, `relative URL in ${entry.id}: ${url}`).toMatch(
          /^(https?:|mailto:|tel:|#)/,
        );
      }
    });

    it("keeps the plain-text body in step with the HTML links", () => {
      // Every non-chrome link in the HTML should also be reachable from the
      // text body — a text alternative that drops the CTA is a silent bug.
      const chrome = new Set(
        [
          ...[
            "/our-partners",
            "/blog",
            "/privacy-policy",
            "/shipping-refund-policies",
            "/terms-of-service",
            "/support",
            "/faq",
            "/partner",
          ].map((p) => `${ORIGIN}${p}`),
          "https://www.facebook.com/thempillow",
          "https://www.instagram.com/thempillow/",
          "https://www.youtube.com/channel/UCgwq2h5BygQmCAXHRzLJHrQ",
          "https://www.tiktok.com/@thempillow",
          "https://www.linkedin.com/company/mellowlife/",
          `${ORIGIN}/mpillow_logo_2026.png`,
          `${ORIGIN}/mpillow_logo_2026-inv.png`,
        ],
      );
      const bodyUrls = urlsIn(rendered.html)
        .filter((u) => u.startsWith("http"))
        .filter((u) => !chrome.has(u));
      for (const url of new Set(bodyUrls)) {
        const decoded = url.replace(/&amp;/g, "&");
        expect(
          rendered.text.includes(decoded),
          `${entry.id}: ${decoded} is in the HTML but not the text body`,
        ).toBe(true);
      }
    });
  });
});

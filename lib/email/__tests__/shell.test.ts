process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { renderEmailShell } from "../base";
import { css } from "../theme";

describe("renderEmailShell", () => {
  it("renders the title as an escaped <h1>", () => {
    const html = renderEmailShell({ title: "Hello", bodyHtml: "<p>body</p>" });
    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
    expect(renderEmailShell({ title: "<b>x</b>", bodyHtml: "" })).toContain(
      "&lt;b&gt;x&lt;/b&gt;",
    );
  });

  it("omits the <h1> entirely when no title is given", () => {
    // Some templates carry their heading as body copy; an empty <h1> would
    // leave a stray gap and confuse screen readers.
    expect(renderEmailShell({ bodyHtml: "<p>x</p>" })).not.toContain("<h1");
  });

  it("inserts bodyHtml verbatim", () => {
    expect(renderEmailShell({ bodyHtml: "<p>body</p>" })).toContain("<p>body</p>");
  });

  it("keeps the legacy footer string", () => {
    expect(
      renderEmailShell({ bodyHtml: "", footer: "mpillow support" }),
    ).toContain("mpillow support");
  });

  it("derives preheader text from the body when not given", () => {
    const html = renderEmailShell({ bodyHtml: "<p>Your order shipped today</p>" });
    expect(html).toContain("Your order shipped today");
    expect(html).toContain("mso-hide:all");
  });

  it("renders a CTA in both the Outlook and standards branches", () => {
    const html = renderEmailShell({
      bodyHtml: "",
      cta: { href: "https://custom.mpillow.com/account", label: "View order" },
    });
    expect(html).toContain("<v:roundrect");
    expect(html).toContain("<!--[if !mso]><!-- -->");
    expect(html).toContain('href="https://custom.mpillow.com/account"');
  });

  it("degrades a rejected CTA URL to plain text rather than a dead link", () => {
    const html = renderEmailShell({
      bodyHtml: "",
      cta: { href: "javascript:alert(1)", label: "Click me" },
    });
    expect(html).toContain("Click me");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<v:roundrect");
  });

  it("drops marketing chrome for staff mail", () => {
    const staff = renderEmailShell({ bodyHtml: "", audience: "staff" });
    expect(staff).not.toContain("/shipping-refund-policies");
    expect(staff).not.toContain("facebook.com");
    // The legal line stays on every email.
    expect(staff).toContain("Mellow Life Pte Ltd");
  });

  it("swaps the footer links for partner mail", () => {
    const partner = renderEmailShell({ bodyHtml: "", audience: "partner" });
    expect(partner).toContain("/partner");
    expect(partner).not.toContain("/shipping-refund-policies");
  });

  it("ships a dark-mode block with an Outlook.com fallback", () => {
    const html = renderEmailShell({ bodyHtml: "" });
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("[data-ogsc]");
  });
});

describe("css()", () => {
  it("does not add px to unitless properties", () => {
    // font-weight:600px is invalid and is dropped wholesale by the client,
    // silently flattening every heading back to normal weight.
    expect(css({ "font-weight": 600 })).toBe("font-weight:600");
    expect(css({ opacity: 0 })).toBe("opacity:0");
  });

  it("adds px to lengths and emits a bare 0", () => {
    expect(css({ padding: 24 })).toBe("padding:24px");
    expect(css({ margin: 0 })).toBe("margin:0");
  });

  it("drops nullish declarations", () => {
    expect(css({ color: null, background: undefined, margin: 0 })).toBe("margin:0");
  });
});

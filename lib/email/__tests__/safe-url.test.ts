import { describe, expect, it } from "vitest";
import { safeUrl, escapeHtml, stripTags } from "../html";

describe("safeUrl", () => {
  it.each([
    ["https://example.com/x?a=1&b=2", true],
    ["http://example.com", true],
    ["mailto:sg@mpillow.com", true],
    ["tel:+6587805311", true],
  ])("allows %s", (url, allowed) => {
    expect(safeUrl(url) !== "").toBe(allowed);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example.com/x",
    "/account/orders/1",
    "",
  ])("rejects %j", (url) => {
    expect(safeUrl(url)).toBe("");
  });

  it("returns the fallback when given one", () => {
    expect(safeUrl("javascript:alert(1)", "#")).toBe("#");
    expect(safeUrl(null, "#")).toBe("#");
    expect(safeUrl(undefined, "#")).toBe("#");
  });

  it("escapes the surviving URL for attribute context", () => {
    expect(safeUrl('https://example.com/?a=1&b="x"')).not.toContain('"');
    expect(safeUrl("https://example.com/?a=1&b=2")).toContain("&amp;");
  });
});

describe("escapeHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-built", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("stripTags", () => {
  it("collapses markup to readable text", () => {
    expect(stripTags("<p>Hello <strong>there</strong></p><p>Bye</p>")).toBe(
      "Hello there Bye",
    );
  });

  it("drops script and style content entirely", () => {
    expect(stripTags("<style>p{color:red}</style><p>Hi</p>")).toBe("Hi");
    expect(stripTags("<script>alert(1)</script><p>Hi</p>")).toBe("Hi");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The storefront currency picker lives in the global header, which on a phone
 * is a three-column grid with ~150px side columns. The shared `SelectTrigger`
 * is sized for a form field (`min-w-[12rem]`), and the right-hand column
 * already holds the cart, language and theme toggles, so a 192px pill there
 * overflowed leftwards and rendered under the logo. These checks pin the two
 * halves of the fix — a content-hugging trigger and a seat beside the account
 * button — plus the sheet title and tap-height rules of the mobile picker.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("storefront currency selector", () => {
  const header = read("components/ui/home-header.tsx");
  const selector = read("components/shop/currency-selector.tsx");

  it("renders beside the account button, not in the right-hand cluster", () => {
    const expanded = header.slice(header.indexOf('data-slot="home-header-expanded"'));
    const profile = expanded.indexOf("<ProfileMenu />");
    const currency = expanded.indexOf("<CurrencySelector />");
    const logo = expanded.indexOf("mpillow_logo_2026.png");
    const cart = expanded.indexOf("<CartButton />");
    expect(profile).toBeGreaterThan(-1);
    expect(currency).toBeGreaterThan(profile);
    expect(logo).toBeGreaterThan(currency);
    expect(cart).toBeGreaterThan(logo);
    // One mount only: no second copy hidden per breakpoint.
    expect(expanded.indexOf("<CurrencySelector />", currency + 1)).toBe(-1);
  });

  it("overrides the shared trigger's 12rem form-field minimum width", () => {
    const trigger = selector.slice(
      selector.indexOf("<SelectTrigger"),
      selector.indexOf("</SelectTrigger>"),
    );
    expect(trigger).toMatch(/\bmin-w-0\b/);
    expect(trigger).toMatch(/\bw-auto\b/);
    expect(trigger).not.toMatch(/\bw-\[\d+px\]/);
  });

  it("names the control and its mobile sheet", () => {
    expect(selector).toMatch(/<SelectTrigger[^>]*aria-label="Currency"/);
    expect(selector).toMatch(/<SelectContent[^>]*sheetTitle="Currency"/);
  });

  it("keeps mobile option rows at the shared text-base tap height", () => {
    // Unscoped `text-xs` on the item overrides the sheet's text-base and
    // shrinks the row below 44px; only the desktop dropdown may use it.
    expect(selector).not.toMatch(/className="(?:[^"]*\s)?text-xs(?:\s|")/);
    expect(selector).toMatch(/className="(?:[^"]*\s)?md:text-xs(?:\s|")/);
  });
});

describe("Select mobile sheet title", () => {
  const select = read("components/ui/select.tsx");

  it("renders sheetTitle as the sheet heading and keeps it off the desktop dropdown", () => {
    const mobile = select.slice(select.indexOf("if (isMobile) {", select.indexOf("const SelectContent")));
    expect(mobile).toMatch(/\{sheetTitle && \([\s\S]*?<SheetTitle>\{sheetTitle\}<\/SheetTitle>/);
    // Destructured out before `...props` reaches DropdownMenuContent, where
    // an unknown prop would land on the DOM.
    expect(select).toMatch(/\(\{ className, children, sheetTitle, \.\.\.props \}, ref\)/);
  });
});

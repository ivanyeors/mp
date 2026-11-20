import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("storefront currency selector", () => {
  const header = read("components/ui/home-header.tsx");
  const selector = read("components/shop/currency-selector.tsx");

  it("renders beside the account button, not in the right-hand cluster", () => {
    const expanded = header.slice(header.indexOf('data-slot="home-header-expanded"'));
    const profile = expanded.indexOf("<ProfileMenu />");
    const currency = expanded.indexOf("<CurrencySelector />");
    const logo = expanded.indexOf("src={LOGO_SRC}");
    const cart = expanded.indexOf("<CartButton />");
    expect(profile).toBeGreaterThan(-1);
    expect(currency).toBeGreaterThan(profile);
    expect(logo).toBeGreaterThan(currency);
    expect(cart).toBeGreaterThan(logo);
    expect(expanded.indexOf("<CurrencySelector />", currency + 1)).toBe(-1);
  });

  const trigger = selector.slice(
    selector.indexOf("<SelectTrigger"),
    selector.indexOf("</SelectTrigger>"),
  );

  it("overrides the shared trigger's 12rem form-field minimum width", () => {
    expect(trigger).toMatch(/\bmin-w-0\b/);
    expect(trigger).not.toMatch(/\bw-\[\d+px\]/);
  });

  it("names the control and its mobile sheet", () => {
    expect(trigger).toMatch(/aria-label="Currency"/);
    expect(selector).toMatch(/<SelectContent[^>]*sheetTitle="Currency"/);
  });

  it("keeps mobile option rows at the shared text-base tap height", () => {
    expect(selector).not.toMatch(/className="(?:[^"]*\s)?text-xs(?:\s|")/);
    expect(selector).toMatch(/className="(?:[^"]*\s)?md:text-xs(?:\s|")/);
  });
});

describe("header right-hand cluster on a phone", () => {
  it("keeps the language toggle icon-only below sm so the cart clears the logo", () => {
    const toggle = read("components/ui/language-toggle.tsx");
    expect(toggle).toMatch(/max-sm:min-w-11/);
    expect(toggle).toMatch(/<span className="hidden [^"]*sm:inline">\{LOCALE_SHORT_LABELS\[currentLocale\]\}<\/span>/);
    expect(toggle).not.toMatch(/className="mr-2/);
  });
});

describe("Select mobile sheet title", () => {
  const select = read("components/ui/select.tsx");

  it("renders sheetTitle as the sheet heading and keeps it off the desktop dropdown", () => {
    const mobile = select.slice(select.indexOf("if (isMobile) {", select.indexOf("const SelectContent")));
    expect(mobile).toMatch(/\{sheetTitle && \([\s\S]*?<SheetTitle>\{sheetTitle\}<\/SheetTitle>/);
    expect(select).toMatch(/\(\{ className, children, sheetTitle, \.\.\.props \}, ref\)/);
  });
});

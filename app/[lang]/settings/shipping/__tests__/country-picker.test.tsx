import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { COUNTRIES, REGIONS } from "@/lib/shipping/countries";
import { CountryPicker } from "../country-picker";

const noop = () => {};

describe("CountryPicker", () => {
  it("shows every region with how much of it the method covers, opening the ones in use", () => {
    const html = renderToStaticMarkup(<CountryPicker value={["SG", "MY"]} onChange={noop} />);
    for (const { label } of REGIONS) expect(html).toContain(label.replace("&", "&amp;"));
    expect(html).toContain("2 countries");
    expect(html).toMatch(/Southeast Asia<\/span><span[^>]*>2\/11</);
    expect(html).toContain('aria-pressed="true" title="SG"');
    expect(html).not.toContain('title="FR"');
  });

  it("calls every country worldwide", () => {
    const html = renderToStaticMarkup(<CountryPicker value={COUNTRIES.map((c) => c.code)} onChange={noop} />);
    expect(html).toContain(">Worldwide</p>");
  });

  it("keeps codes outside the catalog visible, so they can be removed", () => {
    const html = renderToStaticMarkup(<CountryPicker value={["SG", "XK"]} onChange={noop} />);
    expect(html).toContain("Not in the country list:");
    expect(html).toContain('aria-label="Remove XK"');
  });
});

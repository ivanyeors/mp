import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * The shared Select on a phone, where it opens as a bottom sheet. Its trigger
 * once wrapped the value in `contain: inline-size`, so a long value could not
 * set the trigger's minimum width. That also sized the value as empty, so a
 * trigger that hugs its content (`min-w-0`, no width), like the storefront
 * currency pill, rendered as an empty 22px pill. These checks pin the value's
 * label on the phone path and a wrapper that keeps the value's own width.
 */

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = await import("./select");

const trigger = (html: string) => html.match(/<button[^>]*role="combobox"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

const renderPicker = (value: string) =>
  renderToString(
    <Select value={value}>
      <SelectTrigger aria-label="Currency" className="min-w-0 rounded-full [&>svg]:hidden">
        <SelectValue />
      </SelectTrigger>
      <SelectContent sheetTitle="Currency">
        {[
          ["SGD", "\u{1F1F8}\u{1F1EC}"],
          ["USD", "\u{1F1FA}\u{1F1F8}"],
        ].map(([code, flag]) => (
          <SelectItem key={code} value={code}>
            {flag} {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
  );

describe("Select trigger on a phone", () => {
  it("shows the selected item's label, children like `{flag} {code}` included", () => {
    expect(trigger(renderPicker("USD"))).toContain("\u{1F1FA}\u{1F1F8} USD");
    expect(trigger(renderPicker("SGD"))).toContain("\u{1F1F8}\u{1F1EC} SGD");
  });

  it("keeps the value's own width, so a content-sized trigger is not an empty pill", () => {
    const value = trigger(renderPicker("SGD")).match(/<button[^>]*>\s*<span class="([^"]*)"/)?.[1];
    expect(value, "the trigger's value wrapper").toBeDefined();
    // Size containment sizes the value as if empty, at every width it applies.
    expect(value).not.toMatch(/contain/);
    // Instead a one-track grid: no minimum from the value, its full width when there is room.
    expect(value).toMatch(/max-md:grid(\s|$)/);
    expect(value).toMatch(/max-md:grid-cols-\[minmax\(0,max-content\)\]/);
  });
});

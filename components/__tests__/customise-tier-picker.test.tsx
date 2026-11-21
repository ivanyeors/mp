// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { until } from "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CustomiseTierPicker } = await import("@/components/customise-tier-picker");

window.scrollTo = () => undefined;

const picker = (
  <CustomiseTierPicker
    locale="en-US"
    images={{}}
    basicLabel="Basic"
    premiumLabel="Premium"
    triggerLabel="Customise yours"
  />
);
const dialog = () => document.body.querySelector('[role="dialog"]');

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("CustomiseTierPicker", () => {
  it("server-renders the trigger only, hydrates cleanly, and opens on click", async () => {
    const html = renderToString(picker);
    expect(html).toContain("Customise yours");
    expect(html).not.toContain('role="dialog"');

    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    const errors: unknown[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
    act(() => {
      root = hydrateRoot(host, picker, { onRecoverableError: (e) => errors.push(e) });
    });
    consoleError.mockRestore();
    expect(errors).toEqual([]);
    expect(dialog()).toBeNull();

    act(() => host.querySelector("button")!.click());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.getAttribute("aria-hidden")).toBe("false");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(dialog()!.getAttribute("aria-hidden")).toBe("true");
    await until(() => (dialog() === null ? true : null), 100);
  });
});

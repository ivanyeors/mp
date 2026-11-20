// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { settle, until } from "@/components/block-editor/__tests__/dom";
import { BubbleMenu, type BubbleMenuItem } from "@/components/ui/bubble-menu";

/**
 * The app dock drives BubbleMenu with `open` (controlled) and `hideChrome`, so
 * the overlay must mount as soon as the parent opens it, play its open
 * animation, and stay mounted through the close animation before unmounting.
 */
const items: BubbleMenuItem[] = [
  { label: "Shop", href: "/shop" },
  { label: "Learn", href: "/learn" },
];

window.scrollTo = () => undefined;

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

const overlay = () => document.body.querySelector<HTMLElement>(".bubble-menu-items");

function mount(open: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<BubbleMenu open={open} hideChrome items={items} />));
  return (next: boolean) => act(() => root!.render(<BubbleMenu open={next} hideChrome items={items} />));
}

describe("BubbleMenu", () => {
  it("renders no overlay on the server while closed", () => {
    expect(renderToString(<BubbleMenu open={false} hideChrome items={items} />)).toBe("");
  });

  it("mounts the overlay and runs the open animation when the parent opens it", async () => {
    const rerender = mount(false);
    expect(overlay()).toBeNull();

    rerender(true);
    const el = overlay();
    expect(el).not.toBeNull();
    expect(el!.getAttribute("aria-hidden")).toBe("false");
    // The open branch of the gsap effect ran against the mounted overlay.
    expect(el!.style.display).toBe("flex");
    const pill = el!.querySelector<HTMLElement>(".pill-link")!;
    // Starts collapsed, then grows to full size (gsap drops scale(1, 1)).
    expect(pill.style.transform).toBe("scale(0, 0)");
    await until(() => (pill.style.transform === "translate(0, 0)" ? pill : null), 100);
  });

  it("keeps the overlay through the close animation, then unmounts it", async () => {
    const rerender = mount(false);
    rerender(true);
    await settle(50);
    rerender(false);
    expect(overlay()).not.toBeNull();
    expect(overlay()!.getAttribute("aria-hidden")).toBe("true");
    await until(() => (overlay() === null ? true : null), 100);
  });

  it("mounts the overlay on the first render when the parent starts it open", () => {
    mount(true);
    expect(overlay()).not.toBeNull();
    expect(overlay()!.style.display).toBe("flex");
  });
});

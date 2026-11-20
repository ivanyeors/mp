// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XrayEditor } from "../xray-editor";

/**
 * The host hears of every dive change (its cut and Section editor follow the
 * dive): diving into a Section, switching Section, and leaving the dive.
 */

let root: Root | null = null;
function mount(onDiveChange: (s: string | null) => void) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(<XrayEditor placements={[]} items={[]} onPlacementsChange={() => undefined} onDiveChange={onDiveChange} />),
  );
}
const section = (name: string) => document.querySelector<SVGElement>(`[aria-label="Dive into ${name} section"]`)!;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("XrayPillow dive → host", () => {
  it("tells the host each Section dived into, and null when the dive ends", () => {
    const onDiveChange = vi.fn();
    mount(onDiveChange);
    // Before any dive the host holds no dive, whether or not it was told so.
    expect(onDiveChange.mock.calls.every(([s]) => s === null)).toBe(true);
    onDiveChange.mockClear();

    click(section("left"));
    expect(onDiveChange).toHaveBeenLastCalledWith("left");
    click(section("right"));
    expect(onDiveChange).toHaveBeenLastCalledWith("right");
    escape();
    expect(onDiveChange).toHaveBeenLastCalledWith(null);
    expect(onDiveChange.mock.calls.map(([s]) => s)).toEqual(["left", "right", null]);
  });
});

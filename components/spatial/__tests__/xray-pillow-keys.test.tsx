// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import { XrayEditor } from "../xray-editor";

const items = [{ id: 1, name: "6D (S)", subtype: "6D", size: "S" }];
const placements: PillowPlacement[] = [
  { section: "center", subSection: "front", slot: 1, itemId: 1, row: 0 },
  { section: "center", subSection: "front", slot: 2, itemId: 1, row: 1 },
];

let root: Root | null = null;
function mount(onPlacementsChange: (next: PillowPlacement[]) => void, onDiveChange: (s: string | null) => void = () => {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render(onPlacementsChange, onDiveChange);
}
const render = (onPlacementsChange: (next: PillowPlacement[]) => void, onDiveChange: (s: string | null) => void = () => {}) =>
  act(() =>
    root!.render(<XrayEditor placements={placements} items={items} onPlacementsChange={onPlacementsChange} onDiveChange={onDiveChange} />),
  );
const pouches = () => [...document.querySelectorAll<SVGPathElement>("[data-pouch-hit]")];
const pressed = () => pouches().filter((p) => p.getAttribute("aria-pressed") === "true").length;
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })));
const tapFirstPouch = () => act(() => void pouches()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("XrayPillow keys in a dive", () => {
  it("Escape first lets go of the selected pouch, then ends the dive", () => {
    const onDiveChange = vi.fn();
    mount(() => {}, onDiveChange);
    tapFirstPouch();
    expect(onDiveChange).toHaveBeenLastCalledWith("center");
    expect(pressed()).toBe(1);

    key("Escape");
    expect(pressed()).toBe(0);
    expect(onDiveChange).toHaveBeenLastCalledWith("center");

    key("Escape");
    expect(onDiveChange).toHaveBeenLastCalledWith(null);
  });

  it("Delete takes the selected pouch out through the latest render's handler", () => {
    const first = vi.fn();
    const latest = vi.fn();
    mount(first);
    tapFirstPouch();
    render(latest);

    key("Delete");
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]![0]).toHaveLength(1);
  });

  it("an arrow key moves the selected pouch through the latest render's handler", () => {
    const first = vi.fn();
    const latest = vi.fn();
    mount(first);
    tapFirstPouch();
    render(latest);

    key("ArrowDown");
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]![0].some((p: PillowPlacement) => p.subSection === "middle")).toBe(true);
  });

  it("Alt + an arrow nudges the selected pouch through the latest render's handler", () => {
    const first = vi.fn();
    const latest = vi.fn();
    mount(first);
    tapFirstPouch();
    render(latest);

    key("ArrowDown", { altKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

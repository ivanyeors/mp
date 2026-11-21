// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settle } from "@/components/block-editor/__tests__/dom";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import { fitPillow } from "@/lib/spatial-fillings/fit";

const screen = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => screen.mobile }));

const { XrayCrossSectionStrip } = await import("../xray-cross-section-strip");

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
Object.assign(SVGElement.prototype, {
  getScreenCTM: () => ({ ...identity, inverse: () => identity }),
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  hasPointerCapture: () => false,
});

const placements: PillowPlacement[] = [{ section: "center", subSection: "front", slot: 1, itemId: 1, row: 0 }];
const strip = () => (
  <XrayCrossSectionStrip
    fit={fitPillow(placements, { size: "M" })}
    onActiveChange={() => {}}
    itemSubtypes={new Map([[1, "6D"]])}
    placements={placements}
    onPlacementsChange={() => {}}
    items={[{ id: 1, name: "6D (S)", subtype: "6D", size: "S" }]}
  />
);

let root: Root | null = null;
let host: HTMLElement;
beforeEach(async () => {
  screen.mobile = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(strip()));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const panel = (section: string) => host.querySelector<HTMLElement>(`[data-xray-strip-panel="${section}"]`)!;
const pointer = (target: Element, type: string, clientX: number) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: "touch", clientX, clientY: 100 }));
  });

describe("XrayCrossSectionStrip, a pouch held over another cut", () => {
  it("drops the other cut's highlight when the phone turns and the cuts are drawn again mid-hold", async () => {
    const pouch = panel("center").querySelector("[data-slab-hit]")!;
    await pointer(pouch, "pointerdown", 100);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(panel("left").querySelector("span") ?? panel("left"));
    await pointer(pouch.closest("svg")!, "pointermove", 160);
    expect(panel("left").className).toContain("ring-sky-400");

    screen.mobile = false;
    await act(async () => root!.render(strip()));

    expect(host.querySelector("[data-xray-cross-section-disclosure]")).toBeNull();
    expect(panel("left").className).not.toContain("ring-sky-400");
  });
});

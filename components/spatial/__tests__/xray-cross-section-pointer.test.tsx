// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { press, settle } from "@/components/block-editor/__tests__/dom";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { XrayCrossSection } from "../xray-cross-section";

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
Object.assign(SVGElement.prototype, {
  getScreenCTM: () => ({ ...identity, inverse: () => identity }),
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  hasPointerCapture: () => false,
});

const placements: PillowPlacement[] = [{ section: "center", subSection: "front", slot: 1, itemId: 1, row: 0 }];
const items = [{ id: 1, name: "6D (S)", subtype: "6D", size: "S" }];

let root: Root | null = null;
let host: HTMLElement;
let onDropSection: ReturnType<typeof vi.fn<(section: string | null) => void>>;
beforeEach(async () => {
  onDropSection = vi.fn<(section: string | null) => void>();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <>
        <div data-drop-section="left">
          <span id="left-panel" />
        </div>
        <XrayCrossSection
          fit={fitPillow(placements, { size: "M" })}
          cut={{ section: "center" }}
          onCutChange={() => {}}
          tabs={false}
          collapsible={false}
          itemSubtypes={new Map([[1, "6D"]])}
          placements={placements}
          onPlacementsChange={() => {}}
          items={items}
          onDropSection={onDropSection}
        />
      </>,
    ),
  );
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const svg = () => host.querySelector<SVGSVGElement>("svg[viewBox]")!;
const pointer = (target: Element, type: string, clientX: number, clientY: number) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse", clientX, clientY }));
  });

async function holdOverLeftPanel() {
  await pointer(host.querySelector("[data-slab-hit]")!, "pointerdown", 100, 100);
  vi.spyOn(document, "elementFromPoint").mockReturnValue(document.getElementById("left-panel"));
  await pointer(svg(), "pointermove", 160, 100);
}

describe("XrayCrossSection tells the strip which Section a held pouch would drop into", () => {
  it("names the Section while the pouch is over it, and none once it is let go", async () => {
    await holdOverLeftPanel();
    expect(onDropSection).toHaveBeenLastCalledWith("left");

    await pointer(svg(), "pointerup", 160, 100);
    expect(onDropSection).toHaveBeenLastCalledWith(null);
  });

  it("names none once Escape puts the pouch back", async () => {
    await holdOverLeftPanel();
    expect(onDropSection).toHaveBeenLastCalledWith("left");

    press("Escape", {}, window);
    expect(onDropSection).toHaveBeenLastCalledWith(null);
  });
});

describe("XrayCrossSection's add menu", () => {
  const tap = async (x: number, y: number) => {
    await pointer(svg(), "pointerdown", x, y);
    await pointer(svg(), "pointerup", x, y);
  };
  const addMenu = () => host.querySelector("[data-xray-cut-add]");

  it("opens on a tap, and a second tap on the cut closes it without opening another", async () => {
    await tap(332, 40);
    expect(addMenu()).not.toBeNull();

    await tap(332, 40);
    expect(addMenu()).toBeNull();

    await tap(332, 40);
    expect(addMenu()).not.toBeNull();
  });
});

// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import { XrayEditor } from "../xray-editor";

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
Object.assign(SVGElement.prototype, { getScreenCTM: () => ({ ...identity, inverse: () => identity }) });
Object.assign(Element.prototype, { setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => false });

const items = [{ id: 1, name: "6D (S)", subtype: "6D", size: "S" }];
const start: PillowPlacement[] = [{ section: "center", subSection: "front", slot: 1, itemId: 1, row: 0 }];

let committed: PillowPlacement[][] = [];
function Host() {
  const [placements, setPlacements] = useState(start);
  return (
    <XrayEditor
      placements={placements}
      items={items}
      onPlacementsChange={(next) => {
        committed.push(next);
        setPlacements(next);
      }}
    />
  );
}

let root: Root | null = null;
beforeEach(() => {
  committed = [];
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Host />));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const pouch = () => document.querySelector<SVGPathElement>("[data-pouch-hit]")!;
const removeButton = () => document.querySelector("[data-xray-remove-piece]");
const pointer = (type: string, clientY: number) =>
  act(() => void pouch().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse", clientX: 0, clientY })));

function pickUpAndHoldOverMiddle() {
  const middle = document.createElement("div");
  middle.setAttribute("data-drop-cell", "center/middle");
  vi.spyOn(document, "elementFromPoint").mockReturnValue(middle);
  pointer("pointerdown", 0);
  pointer("pointermove", 60);
}

describe("XrayPillow's drag preview", () => {
  beforeEach(() => {
    act(() => void pouch().dispatchEvent(new MouseEvent("click", { bubbles: true })));
  });

  it("is gone once the pouch is dropped, so the dropped pouch shows its remove button", () => {
    expect(removeButton()).not.toBeNull();
    pickUpAndHoldOverMiddle();
    expect(removeButton()).toBeNull();

    pointer("pointerup", 60);
    expect(committed).toHaveLength(1);
    expect(committed[0]!.map((p) => p.subSection)).toEqual(["middle"]);
    expect(removeButton()?.getAttribute("aria-label")).toMatch(/center middle$/);
  });

  it("is gone once Escape puts the pouch back", () => {
    pickUpAndHoldOverMiddle();
    expect(removeButton()).toBeNull();

    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(committed).toEqual([]);
    expect(removeButton()?.getAttribute("aria-label")).toMatch(/center front$/);
  });
});

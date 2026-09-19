import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Save } from "lucide-react";
import { MAX_MOBILE_DOCK_ACTIONS, renderKey } from "./page-dock-actions";
import type { DockAction } from "./app-dock-actions";

const action = (over: Partial<DockAction> = {}): DockAction => ({
  id: "save",
  title: "Save",
  icon: Save,
  onClick: () => {},
  ...over,
});

describe("renderKey", () => {
  // Pages pass an inline array, so a fresh identity every render is normal; the
  // dock must only be republished when what it draws actually changes.
  it("ignores a new array and new handlers", () => {
    expect(renderKey([action()])).toBe(renderKey([action({ onClick: () => {} })]));
  });

  it("changes when the dock would draw something different", () => {
    const base = renderKey([action()]);
    expect(renderKey([action({ title: "Saving…" })])).not.toBe(base);
    expect(renderKey([action({ active: true })])).not.toBe(base);
    expect(renderKey([action({ badge: true })])).not.toBe(base);
    expect(renderKey([action(), action({ id: "cancel" })])).not.toBe(base);
  });

  it("separates ids so two actions cannot collide into one key", () => {
    expect(renderKey([action({ id: "a", title: "b:c" })]))
      .not.toBe(renderKey([action({ id: "a:b", title: "c" })]));
  });
});

describe("mobile dock capacity", () => {
  const dock = readFileSync("components/ui/shadcn-io/dock/index.tsx", "utf8");

  // Measured in Chromium: with the Admin Panel's Home / Menu / Logout and the
  // two fences, three page actions are a 344px pill and a fourth is 396px —
  // past the 374px a 390px phone leaves inside the dock's own mx-2.
  it("is three", () => {
    expect(MAX_MOBILE_DOCK_ACTIONS).toBe(3);
  });

  // That only holds with the tighter mobile pill; at gap-4/px-4 three tools
  // were 416px and the dock scrolled, hiding actions off-screen.
  it("comes from a tighter pill below md, leaving desktop spacing alone", () => {
    expect(dock).toMatch(/gap-2 md:gap-4/);
    expect(dock).toMatch(/px-3 md:px-4/);
  });
});

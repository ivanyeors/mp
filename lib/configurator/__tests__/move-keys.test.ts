import { describe, expect, it } from "vitest";

import { isTypingTarget, MOVE_ACTIONS, moveKeyFor } from "@/lib/configurator/move-keys";

describe("moveKeyFor", () => {
  it("maps the six keys and the two Shift chords, and nothing else", () => {
    expect(moveKeyFor({ key: "ArrowLeft" })).toBe("left");
    expect(moveKeyFor({ key: "ArrowRight" })).toBe("right");
    expect(moveKeyFor({ key: "ArrowUp" })).toBe("front");
    expect(moveKeyFor({ key: "ArrowDown" })).toBe("back");
    expect(moveKeyFor({ key: "[" })).toBe("layerUp");
    expect(moveKeyFor({ key: "]" })).toBe("layerDown");
    expect(moveKeyFor({ key: "ArrowLeft", shiftKey: true })).toBe("sectionLeft");
    expect(moveKeyFor({ key: "ArrowRight", shiftKey: true })).toBe("sectionRight");
    expect(moveKeyFor({ key: "ArrowUp", shiftKey: true })).toBeNull();
    expect(moveKeyFor({ key: "Escape" })).toBeNull();
    expect(moveKeyFor({ key: "ArrowLeft", ctrlKey: true })).toBeNull();
    expect(moveKeyFor({ key: "ArrowLeft", metaKey: true })).toBeNull();
  });

  it("every pad action has a key and every key an action", () => {
    const kinds = MOVE_ACTIONS.map((a) => a.kind);
    expect(new Set(kinds).size).toBe(8);
    for (const a of MOVE_ACTIONS) expect(a.label.length).toBeGreaterThan(0);
    const fromKeys = [
      moveKeyFor({ key: "ArrowLeft" }),
      moveKeyFor({ key: "ArrowRight" }),
      moveKeyFor({ key: "ArrowUp" }),
      moveKeyFor({ key: "ArrowDown" }),
      moveKeyFor({ key: "[" }),
      moveKeyFor({ key: "]" }),
      moveKeyFor({ key: "ArrowLeft", shiftKey: true }),
      moveKeyFor({ key: "ArrowRight", shiftKey: true }),
    ];
    expect(fromKeys.sort()).toEqual([...kinds].sort());
  });

  it("leaves text controls alone", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "path" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

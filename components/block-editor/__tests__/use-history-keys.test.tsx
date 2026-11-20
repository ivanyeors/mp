// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHistoryKeys } from "../use-editor-history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Keys({ history, enabled }: { history: { undo: () => void; redo: () => void }; enabled?: boolean }) {
  useHistoryKeys(history, { enabled });
  return null;
}

// jsdom's navigator is not a Mac: Ctrl is the modifier.
const press = (key: string, shiftKey = false) => {
  const e = new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe("useHistoryKeys", () => {
  it("undoes and redoes with the history of the latest render, listening once", () => {
    const add = vi.spyOn(window, "addEventListener");
    const first = { undo: vi.fn(), redo: vi.fn() };
    const latest = { undo: vi.fn(), redo: vi.fn() };
    act(() => root.render(<Keys history={first} />));
    act(() => root.render(<Keys history={latest} />));

    expect(press("z").defaultPrevented).toBe(true);
    press("z", true);

    expect(first.undo).not.toHaveBeenCalled();
    expect(first.redo).not.toHaveBeenCalled();
    expect(latest.undo).toHaveBeenCalledTimes(1);
    expect(latest.redo).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    add.mockRestore();
  });

  it("does nothing while off", () => {
    const history = { undo: vi.fn(), redo: vi.fn() };
    act(() => root.render(<Keys history={history} enabled={false} />));
    expect(press("z").defaultPrevented).toBe(false);
    expect(history.undo).not.toHaveBeenCalled();
  });
});

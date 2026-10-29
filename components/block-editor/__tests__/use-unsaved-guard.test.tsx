// @vitest-environment jsdom
import { press, settle } from "./dom";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAVE_UNSAVED, useUnsavedGuard, type UnsavedGuard } from "../use-unsaved-guard";

/**
 * Save stays explicit (PRD-campaign-email-editor decision 4): ⌘S saves,
 * leaving with unsaved changes asks first, and a crashed tab's changes are
 * offered back, onto the version they were made from only.
 */

const KEY = "test:draft";
let guard: UnsavedGuard<{ words: string }>;
let setWords: (w: string) => void = () => undefined;
const report = (g: UnsavedGuard<{ words: string }>, set: (w: string) => void) => {
  guard = g;
  setWords = set;
};
const parse = (raw: unknown) => (raw && typeof (raw as { words?: unknown }).words === "string" ? (raw as { words: string }) : null);

function Page({ base = "v1", saved = "saved", onSave }: { base?: string; saved?: string; onSave?: () => void }) {
  const [words, set] = useState(saved);
  const g = useUnsavedGuard({ dirty: words !== saved, onSave, keep: { key: KEY, base, value: { words }, parse } });
  useEffect(() => report(g, set), [g]);
  return null;
}

let root: Root | null = null;
function mount(props: Parameters<typeof Page>[0] = {}) {
  const host = document.createElement("div");
  // A link to another page of the site, as the app's own links are.
  const away = Object.assign(document.createElement("a"), { id: "away", href: "/en-US/settings/other", textContent: "Away" });
  document.body.append(host, away);
  root = createRoot(host);
  act(() => root!.render(<Page {...props} />));
}
beforeEach(() => window.localStorage.clear());
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useUnsavedGuard", () => {
  it("saves on Ctrl+S (⌘S on a Mac), instead of the browser's own save", () => {
    const onSave = vi.fn();
    mount({ onSave });
    const e = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void window.dispatchEvent(e));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    press("s", {}, document.body);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("asks before leaving with unsaved changes, and not once they are saved", async () => {
    mount();
    const leave = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    /** Whether the guard stopped the link. Let through, the browser's own navigation is stopped here: jsdom has none. */
    const follow = () => {
      const link = document.getElementById("away")!;
      let reached = false;
      const through = (e: Event) => {
        reached = !e.defaultPrevented;
        e.preventDefault();
      };
      link.addEventListener("click", through);
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      link.removeEventListener("click", through);
      return !reached;
    };
    expect(leave()).toBe(false);
    act(() => setWords("changed"));
    expect(leave()).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(follow()).toBe(true);
    expect(confirm).toHaveBeenCalledWith(LEAVE_UNSAVED);
    confirm.mockReturnValue(true);
    expect(follow()).toBe(false);
    expect(guard.confirmLeave()).toBe(true);
  });

  it("keeps unsaved changes in the browser, and offers them back onto the same version", async () => {
    mount();
    act(() => setWords("half written"));
    await settle(600);
    const kept = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(kept).toMatchObject({ v: 1, base: "v1", value: { words: "half written" } });
    act(() => root!.unmount());

    mount();
    await settle();
    expect(guard.recovered).toMatchObject({ value: { words: "half written" }, at: kept.at });
    // While it is offered, the copy stays, so a second crash still has it.
    await settle(600);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    let restored: { words: string } | null = null;
    act(() => {
      restored = guard.restore();
    });
    expect(restored).toEqual({ words: "half written" });
    expect(guard.recovered).toBeNull();
  });

  it("offers nothing kept from another version, and forgets what is discarded", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, at: "2026-10-29T08:12:00.000Z", base: "v0", value: { words: "old" } }));
    mount({ base: "v1" });
    await settle();
    expect(guard.recovered).toBeNull();

    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, at: "2026-10-29T08:12:00.000Z", base: "v1", value: { words: "mine" } }));
    act(() => root!.unmount());
    mount({ base: "v1" });
    await settle();
    expect(guard.recovered?.value).toEqual({ words: "mine" });
    act(() => guard.discard());
    expect(guard.recovered).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("works without the browser's storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount();
    act(() => setWords("changed"));
    await settle(600);
    expect(guard.recovered).toBeNull();
  });
});

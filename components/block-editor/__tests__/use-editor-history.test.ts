import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, historyKey, historyReducer, initialHistory, typingBurst, type HistoryState } from "../use-editor-history";

const set = (s: HistoryState<string>, next: string, now: number, burst?: string) => historyReducer(s, { type: "set", next, burst, now, burstMs: 1000 });

describe("historyReducer", () => {
  it("undoes and redoes each change, and a new change ends what Redo had", () => {
    let s = initialHistory("a");
    s = set(s, "b", 1);
    s = set(s, "c", 2);
    s = historyReducer(s, { type: "undo" });
    expect(s.present.value).toBe("b");
    s = historyReducer(s, { type: "redo" });
    expect(s.present.value).toBe("c");
    s = historyReducer(s, { type: "undo" });
    s = set(s, "d", 3);
    expect(s.future).toEqual([]);
    expect(historyReducer(s, { type: "redo" })).toBe(s);
  });

  it("keeps a burst of typing in one field as one step, until it pauses or another field is typed in", () => {
    let s = initialHistory("");
    s = set(s, "S", 0, "subject");
    s = set(s, "Sl", 300, "subject");
    s = set(s, "Sle", 900, "subject");
    expect(s.past.map((p) => p.value)).toEqual([""]);
    s = set(s, "Sle ", 2000, "subject");
    s = set(s, "Sle x", 2100, "preview");
    s = set(s, "Sle xy", 2200);
    expect(s.past.map((p) => p.value)).toEqual(["", "Sle", "Sle ", "Sle x"]);
    s = historyReducer(s, { type: "undo" });
    s = set(s, "Sle xz", 2300, "preview");
    expect(s.past.map((p) => p.value)).toEqual(["", "Sle", "Sle ", "Sle x"]);
  });

  it("keeps a held burst as one step however slowly it arrives, as an AI result streams in", () => {
    let s = initialHistory("");
    const stream = (next: string, now: number) => historyReducer(s, { type: "set", next, burst: "ai", hold: true, now, burstMs: 1000 });
    s = stream("Heading", 0);
    s = stream("Heading, text", 1600);
    s = stream("Heading, text, button", 9000);
    expect(s.past.map((p) => p.value)).toEqual([""]);
    s = historyReducer(s, { type: "undo" });
    expect(s.present.value).toBe("");
    s = stream("Heading", 10000);
    s = set(s, "Heading!", 10100, "subject");
    s = stream("Heading!, text", 10200);
    expect(s.past.map((p) => p.value)).toEqual(["", "Heading", "Heading!"]);
  });

  it("keeps the last hundred steps", () => {
    let s = initialHistory(0 as number);
    for (let i = 1; i <= 150; i++) s = historyReducer(s, { type: "set", next: i, now: i * 2000, burstMs: 1000 });
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) s = historyReducer(s, { type: "undo" });
    expect(s.present.value).toBe(150 - HISTORY_LIMIT);
    expect(historyReducer(s, { type: "undo" })).toBe(s);
  });

  it("numbers each step, so a page can tell whether the present is still the one it made", () => {
    let s = initialHistory("a");
    s = set(s, "b", 1);
    const made = s.present.n;
    s = set(s, "c", 5000);
    expect(s.present.n).not.toBe(made);
    s = historyReducer(s, { type: "undo" });
    expect(s.present.n).toBe(made);
  });

  it("changes nothing for the same value, and starts over on reset", () => {
    const s = set(initialHistory("a"), "b", 1);
    expect(set(s, "b", 2)).toBe(s);
    const r = historyReducer(s, { type: "reset", value: "z" });
    expect([r.present.value, r.past, r.future]).toEqual(["z", [], []]);
  });
});

describe("historyKey", () => {
  const key = (key: string, m: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
    key,
    metaKey: Boolean(m.meta),
    ctrlKey: Boolean(m.ctrl),
    shiftKey: Boolean(m.shift),
    altKey: Boolean(m.alt),
  });

  it("is ⌘Z and ⇧⌘Z on a Mac, Ctrl elsewhere, where Ctrl+Y redoes too", () => {
    expect(historyKey(key("z", { meta: true }), true)).toBe("undo");
    expect(historyKey(key("Z", { meta: true, shift: true }), true)).toBe("redo");
    expect(historyKey(key("z", { ctrl: true }), true)).toBeNull();
    expect(historyKey(key("z", { ctrl: true }), false)).toBe("undo");
    expect(historyKey(key("z", { ctrl: true, shift: true }), false)).toBe("redo");
    expect(historyKey(key("y", { ctrl: true }), false)).toBe("redo");
    expect(historyKey(key("y", { meta: true }), true)).toBeNull();
    expect(historyKey(key("z", { ctrl: true, alt: true }), false)).toBeNull();
    expect(historyKey(key("z"), false)).toBeNull();
  });
});

describe("typingBurst", () => {
  it("is the field while typing, and none for a paste or a drop", () => {
    const e = (inputType: string) => ({ nativeEvent: Object.assign(new Event("input"), { inputType }) });
    expect(typingBurst(e("insertText"), "subject")).toBe("subject");
    expect(typingBurst(e("deleteContentBackward"), "subject")).toBe("subject");
    expect(typingBurst(e("insertFromPaste"), "subject")).toBeUndefined();
    expect(typingBurst(e("insertFromDrop"), "subject")).toBeUndefined();
  });
});

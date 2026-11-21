import { describe, expect, it } from "vitest";

import { clearDraft, DRAFT_MAX_AGE_MS, DRAFT_PREFIX, draftTimeLabel, listDrafts, readDraft, writeDraft, type DraftStore } from "../editor-drafts";

function memoryStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
}

const refusing: DraftStore = {
  length: 0,
  key: () => null,
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("editor drafts", () => {
  it("keeps a draft and reads it back with when it was kept", () => {
    const store = memoryStore();
    expect(writeDraft("readjust:c1", { size: "M", placements: [1, 2] }, 1_000, store)).toBe(1_000);
    expect(readDraft("readjust:c1", 2_000, store)).toEqual({ savedAt: 1_000, data: { size: "M", placements: [1, 2] } });
    expect(store.map.has(`${DRAFT_PREFIX}readjust:c1`)).toBe(true);
  });

  it("removes a draft, and reads none where there is none", () => {
    const store = memoryStore();
    writeDraft("k", 1, 1_000, store);
    clearDraft("k", store);
    expect(readDraft("k", 1_000, store)).toBeNull();
    clearDraft("never-kept", store);
    expect(store.map.size).toBe(0);
  });

  it("drops a draft older than a month on reading it", () => {
    const store = memoryStore();
    writeDraft("old", "x", 0, store);
    expect(readDraft("old", DRAFT_MAX_AGE_MS, store)).not.toBeNull();
    expect(readDraft("old", DRAFT_MAX_AGE_MS + 1, store)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("lists one scope's drafts, newest first, by the key after the scope", () => {
    const store = memoryStore();
    writeDraft("template:pillow:M:12", {}, 3_000, store);
    writeDraft("template:pillow:M:new", {}, 5_000, store);
    writeDraft("template:pillow:L:12", {}, 9_000, store);
    writeDraft("readjust:c1", {}, 8_000, store);
    store.setItem("unrelated", "1");
    expect(listDrafts("template:pillow:M:", 10_000, store)).toEqual([
      { key: "new", savedAt: 5_000 },
      { key: "12", savedAt: 3_000 },
    ]);
  });

  it("ignores what it cannot read, and keeps nothing where storage refuses", () => {
    const store = memoryStore();
    store.setItem(`${DRAFT_PREFIX}broken`, "{not json");
    expect(readDraft("broken", 0, store)).toBeNull();
    expect(writeDraft("k", 1, 0, refusing)).toBeNull();
    expect(readDraft("k", 0, refusing)).toBeNull();
    expect(listDrafts("", 0, refusing)).toEqual([]);
    expect(() => clearDraft("k", refusing)).not.toThrow();
    expect(writeDraft("k", 1, 0, null)).toBeNull();
  });

  it("says the time today, and the day too otherwise", () => {
    const now = new Date(2026, 10, 9, 19, 30).getTime();
    expect(draftTimeLabel(new Date(2026, 10, 9, 19, 4).getTime(), now)).toMatch(/^7:04\s?pm$/i);
    expect(draftTimeLabel(new Date(2026, 10, 3, 9, 5).getTime(), now)).toMatch(/^3 Nov, 9:05\s?am$/i);
  });
});

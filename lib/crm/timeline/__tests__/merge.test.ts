import { describe, expect, it } from "vitest";
import { canonicalAt, compareEntries, cursorOf, mergeTimeline, type TimelinePage } from "@/lib/crm/timeline/merge";
import { decodeCursor, encodeCursor } from "@/lib/crm/timeline/cursor";
import { cappedBatch, joinBatches, streamBatch } from "@/lib/crm/timeline/read";
import type { TimelineBatch, TimelineCursor, TimelineEntry } from "@/lib/crm/timeline/types";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString();

const entry = (id: string, minute: number, kind = "k.x", refId = id): TimelineEntry => ({
  id,
  at: at(minute),
  kind,
  ref: { type: "t", id: refId },
  summary: id,
});

const complete = (entries: TimelineEntry[]): TimelineBatch => ({ entries, floor: null });
const ids = (entries: readonly TimelineEntry[]) => entries.map((e) => e.id);

describe("canonicalAt", () => {
  it("writes every time as UTC with microseconds, whatever shape PostgREST sent", () => {
    expect(canonicalAt("2026-10-01T02:00:00Z")).toBe("2026-10-01T02:00:00.000000Z");
    expect(canonicalAt("2026-10-01T02:00:00+00:00")).toBe("2026-10-01T02:00:00.000000Z");
    expect(canonicalAt("2026-10-01T10:00:00.5+08:00")).toBe("2026-10-01T02:00:00.500000Z");
    expect(canonicalAt("2026-10-01T02:00:00.123456+00:00")).toBe("2026-10-01T02:00:00.123456Z");
  });

  it("never rounds into the next second, and refuses what is not a time", () => {
    expect(canonicalAt("2026-10-01T02:00:59.9999999Z")).toBe("2026-10-01T02:00:59.999999Z");
    expect(canonicalAt("not a date")).toBeNull();
    expect(canonicalAt("")).toBeNull();
  });

  it("sorts as text in time order across shapes", () => {
    const shapes = ["2026-10-01T02:00:00.25+00:00", "2026-10-01T02:00:00+00:00", "2026-10-01T10:00:00.5+08:00"];
    expect(shapes.map((s) => canonicalAt(s)!).sort()).toEqual([
      "2026-10-01T02:00:00.000000Z",
      "2026-10-01T02:00:00.250000Z",
      "2026-10-01T02:00:00.500000Z",
    ]);
  });
});

describe("mergeTimeline: order", () => {
  it("puts the newest first across every source", () => {
    const page = mergeTimeline(
      [complete([entry("a", 1), entry("d", 4)]), complete([entry("c", 3)]), complete([entry("b", 2), entry("e", 5)])],
      10,
    );
    expect(ids(page.entries)).toEqual(["e", "d", "c", "b", "a"]);
    expect(page.next).toBeNull();
  });

  it("breaks a tie by kind, then ref.id, then the entry id, the same way every time", () => {
    const tied = [
      entry("4", 7, "order.paid", "o2"),
      entry("2", 7, "note.added", "n1"),
      entry("3", 7, "order.paid", "o1"),
      entry("1", 7, "order.email_sent", "o1"),
      entry("6", 7, "order.paid", "o1"),
    ];
    const expected = ["2", "1", "3", "6", "4"];
    expect(ids(mergeTimeline([complete(tied)], 10).entries)).toEqual(expected);
    expect(ids(mergeTimeline([complete([...tied].reverse())], 10).entries)).toEqual(expected);
    expect(ids(mergeTimeline([complete(tied.slice(0, 2)), complete(tied.slice(2))], 10).entries)).toEqual(expected);
  });

  it("shows an entry once when two sources return it", () => {
    expect(ids(mergeTimeline([complete([entry("a", 1)]), complete([entry("a", 1)])], 10).entries)).toEqual(["a"]);
  });

  it("drops an entry without a time rather than inventing one", () => {
    const undated = { ...entry("x", 1), at: "sometime" };
    expect(ids(mergeTimeline([complete([undated, entry("a", 2)])], 10).entries)).toEqual(["a"]);
  });
});

describe("mergeTimeline: empty sources", () => {
  it("has nothing to show and nothing to load when every source is empty", () => {
    expect(mergeTimeline([], 50)).toEqual({ entries: [], next: null });
    expect(mergeTimeline([complete([]), complete([])], 50)).toEqual({ entries: [], next: null });
  });

  it("is unaffected by an empty source beside a full one", () => {
    const page = mergeTimeline([complete([]), complete([entry("a", 1), entry("b", 2)]), complete([])], 50);
    expect(ids(page.entries)).toEqual(["b", "a"]);
    expect(page.next).toBeNull();
  });
});

describe("mergeTimeline: the cursor", () => {
  it("cuts at the limit and starts the next page after the last entry shown", () => {
    const all = complete([entry("a", 1), entry("b", 2), entry("c", 3)]);
    const first = mergeTimeline([all], 2);
    expect(ids(first.entries)).toEqual(["c", "b"]);
    expect(first.next).toEqual({ at: canonicalAt(at(2)), kind: "k.x", refId: "b", id: "b" });
    const second = mergeTimeline([all], 2, first.next);
    expect(ids(second.entries)).toEqual(["a"]);
    expect(second.next).toBeNull();
  });

  it("shows nothing at or below a source's floor, and fetches it on the next page", () => {
    const full: TimelineBatch = { entries: [entry("f9", 9), entry("f5", 5)], floor: at(5) };
    const other = complete([entry("o7", 7), entry("o3", 3)]);
    const page = mergeTimeline([full, other], 10);
    expect(ids(page.entries)).toEqual(["f9", "o7"]);
    expect(page.next?.id).toBe("o7");
  });

  it("starts the next page at the floor when the floor left nothing to show", () => {
    const full: TimelineBatch = { entries: [entry("f5", 5)], floor: at(5) };
    const page = mergeTimeline([full], 10);
    expect(page.entries).toEqual([]);
    expect(page.next).toEqual({ at: canonicalAt(at(5)), kind: "", refId: "", id: "" });
    expect(ids(mergeTimeline([complete([entry("f5", 5)])], 10, page.next).entries)).toEqual(["f5"]);
  });

  it("steps forward through a source that returned a whole page at the cursor's instant", () => {
    const saturated: TimelineBatch = { entries: [entry("s1", 5), entry("s2", 5)], floor: at(5) };
    const afterS1 = cursorOf({ ...entry("s1", 5), at: canonicalAt(at(5))! });
    const page = mergeTimeline([saturated], 2, afterS1);
    expect(ids(page.entries)).toEqual(["s2"]);
    const done = mergeTimeline([saturated], 2, page.next);
    expect(done.entries).toEqual([]);
    expect(done.next).toEqual({ at: "2026-10-01T00:04:59.999999Z", kind: "", refId: "", id: "" });
  });

  function source(all: TimelineEntry[], shuffle: (n: number) => number) {
    return (before: string | null, limit: number): TimelineBatch => {
      const rows = all
        .filter((e) => before === null || canonicalAt(e.at)! <= before)
        .map((e) => ({ e, r: shuffle(1000) }))
        .sort((a, b) => (a.e.at < b.e.at ? 1 : a.e.at > b.e.at ? -1 : a.r - b.r))
        .slice(0, limit)
        .map(({ e }) => e);
      return streamBatch(rows, "at", limit, (e) => e);
    };
  }

  function pageAll(sources: ReturnType<typeof source>[], limit: number) {
    const shown: TimelineEntry[] = [];
    let after: TimelineCursor | null = null;
    for (let guard = 0; guard < 500; guard++) {
      const batches = sources.map((s) => s(after?.at ?? null, limit));
      const page: TimelinePage = mergeTimeline(batches, limit, after);
      shown.push(...page.entries);
      after = page.next ? decodeCursor(encodeCursor(page.next)) : null;
      if (!after) return shown;
    }
    throw new Error("paging did not end");
  }

  it("pages through every entry exactly once, in order, across sources and tied times", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const kinds = ["order.paid", "note.added", "result.created"];
    for (let round = 0; round < 25; round++) {
      const lists: TimelineEntry[][] = [[], [], [], []];
      let n = 0;
      for (const list of lists) {
        const perMinute = new Map<number, number>();
        for (let i = rand(30); i > 0; i--) {
          const minute = rand(12);
          if ((perMinute.get(minute) ?? 0) >= 6) continue;
          perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
          list.push(entry(`e${n++}`, minute, kinds[rand(kinds.length)], `r${rand(5)}`));
        }
      }
      const expected = ids(
        lists
          .flat()
          .map((e) => ({ ...e, at: canonicalAt(e.at)! }))
          .sort(compareEntries),
      );
      for (const limit of [7, 10, 50]) {
        const sources = lists.map((list) => source(list, rand));
        expect(ids(pageAll(sources, limit)), `round ${round}, limit ${limit}`).toEqual(expected);
      }
    }
  });

  it("ends, without repeating an entry, when a source has more than a page at one instant", () => {
    let seed = 3;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const crowded = [1, 2, 3, 4, 5, 6, 7].map((i) => entry(`c${i}`, 5));
    const others = [entry("o9", 9), entry("o5", 5, "a.first"), entry("o1", 1)];
    const shown = ids(pageAll([source(crowded, rand), source(others, rand)], 3));
    expect(new Set(shown).size).toBe(shown.length);
    for (const id of ["o9", "o5", "o1"]) expect(shown).toContain(id);
  });
});

describe("batch helpers", () => {
  it("streamBatch floors a full read at its last row, and a short one not at all", () => {
    const rows = [{ id: "a", ts: at(3) }, { id: "b", ts: at(2) }];
    const toEntry = (r: { id: string; ts: string }) => entry(r.id, 0);
    expect(streamBatch(rows, "ts", 2, toEntry).floor).toBe(at(2));
    expect(streamBatch(rows, "ts", 3, toEntry).floor).toBeNull();
  });

  it("joinBatches keeps every entry under the highest floor", () => {
    const joined = joinBatches([
      { entries: [entry("a", 9)], floor: at(2) },
      { entries: [entry("b", 8)], floor: null },
      { entries: [entry("c", 7)], floor: at(4) },
    ]);
    expect(ids(joined.entries)).toEqual(["a", "b", "c"]);
    expect(joined.floor).toBe(canonicalAt(at(4)));
  });

  it("cappedBatch keeps what is at or before the cursor", () => {
    const batch = cappedBatch([entry("a", 1), entry("b", 2), entry("c", 3)], at(2), null);
    expect(ids(batch.entries)).toEqual(["a", "b"]);
  });
});

describe("the cursor on the wire", () => {
  it("round-trips", () => {
    const c: TimelineCursor = { at: "2026-10-01T02:00:00.123456Z", kind: "order.paid", refId: "o1", id: "order.paid:o1" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("refuses anything the route did not write", () => {
    for (const bad of [
      "",
      "not-base64!",
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify(["2026-10-01T02:00:00Z", "k", "r", "i"])).toString("base64url"),
      Buffer.from(JSON.stringify(["2026-10-01T02:00:00.000000Z", "k", 1, "i"])).toString("base64url"),
      Buffer.from(JSON.stringify(["2026-10-01T02:00:00.000000Z", "k", "r"])).toString("base64url"),
    ]) {
      expect(decodeCursor(bad), bad).toBeNull();
    }
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { PhotoScreening, screenSizingPhoto } from "@/lib/ai/photo-screening";
import { sizingPhotosForTelegram, type SizingPhotoRow } from "@/lib/results/sizing-photos";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const HEIC = `data:image/heic;base64,${Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic")]).toString("base64")}`;
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeAdmin() {
  const writes: { op: "update" | "delete"; patch?: Record<string, unknown>; filters: [string, string][] }[] = [];
  const admin = {
    from: () => {
      const write: (typeof writes)[number] = { op: "update", filters: [] };
      const chain = {
        update: (patch: Record<string, unknown>) => ((write.op = "update"), (write.patch = patch), chain),
        delete: () => ((write.op = "delete"), chain),
        eq: (col: string, val: string) => {
          write.filters.push([col, val]);
          if (write.filters.length === 2) {
            writes.push(write);
            return Promise.resolve({ error: null });
          }
          return chain;
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, writes };
}

const screenWith = (result: PhotoScreening) => vi.fn<typeof screenSizingPhoto>(async () => result);

describe("sizingPhotosForTelegram", () => {
  it("attaches photos that passed without asking Claude again", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5" });
    const rows: SizingPhotoRow[] = [
      { view: "front", data_url: PNG, screening_status: "passed" },
      { view: "side", data_url: PNG, screening_status: "passed" },
    ];
    expect(await sizingPhotosForTelegram(admin, ID, rows, { screen })).toEqual({ front: PNG, side: PNG, notes: [] });
    expect(screen).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("checks an unchecked or pre-screening photo again, briefly, and attaches it once it passes", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5" });
    const rows: SizingPhotoRow[] = [
      { view: "front", data_url: PNG, screening_status: "unchecked" },
      { view: "side", data_url: PNG, screening_status: null },
    ];
    const out = await sizingPhotosForTelegram(admin, ID, rows, { screen });
    expect(out).toEqual({ front: PNG, side: PNG, notes: [] });
    expect(screen).toHaveBeenCalledWith(expect.anything(), "front", { timeoutMs: 8_000, maxRetries: 0 });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ op: "update", patch: { screening_status: "passed", screening_model: "claude-haiku-5-5" } });
  });

  it("deletes a photo the retry rejects, and says so", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "rejected", reason: "no" });
    const out = await sizingPhotosForTelegram(admin, ID, [{ view: "side", data_url: PNG, screening_status: "unchecked" }], { screen });
    expect(out).toEqual({ front: null, side: null, notes: ["📷 Side photo removed: it didn't pass the photo check."] });
    expect(writes).toEqual([{ op: "delete", filters: [["response_id", ID], ["view", "side"]] }]);
  });

  it("leaves out a photo Claude still can't check, keeping it, and says so", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "unchecked", error: "down" });
    const rows: SizingPhotoRow[] = [
      { view: "side", data_url: PNG, screening_status: "unchecked" },
      { view: "front", data_url: HEIC, screening_status: null },
    ];
    const out = await sizingPhotosForTelegram(admin, ID, rows, { screen });
    expect(out.front).toBeNull();
    expect(out.side).toBeNull();
    expect(out.notes).toEqual([
      "📷 Front photo not attached: it couldn't be checked.",
      "📷 Side photo not attached: it couldn't be checked.",
    ]);
    expect(screen).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });
});

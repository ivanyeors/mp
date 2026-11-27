import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { PhotoScreening, screenSizingPhoto } from "@/lib/ai/photo-screening";
import type { PhotoDrive } from "@/lib/results/sizing-photo-drive";
import { sizingPhotosForTelegram, type SizingPhotoRow } from "@/lib/results/sizing-photos";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const HEIC = `data:image/heic;base64,${Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic")]).toString("base64")}`;
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeAdmin(rowAfterUpdate: { drive_file_id: string | null; data_url: string | null } = { drive_file_id: null, data_url: PNG }) {
  const writes: { op: "update" | "delete"; patch?: Record<string, unknown>; filters: [string, string][] }[] = [];
  const admin = {
    from: () => {
      const write: (typeof writes)[number] = { op: "update", filters: [] };
      const chain = {
        update: (patch: Record<string, unknown>) => ((write.op = "update"), (write.patch = patch), chain),
        delete: () => ((write.op = "delete"), chain),
        eq: (col: string, val: string) => {
          write.filters.push([col, val]);
          if (write.filters.length < 2) return chain;
          writes.push(write);
          return {
            then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
            select: async () => ({ data: [rowAfterUpdate], error: null }),
          };
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
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5", view: "front" });
    const rows: SizingPhotoRow[] = [
      { view: "front", data_url: PNG, drive_file_id: null, screening_status: "passed" },
      { view: "side", data_url: PNG, drive_file_id: null, screening_status: "passed" },
    ];
    expect(await sizingPhotosForTelegram(admin, ID, rows, { screen, drive: null })).toEqual({ front: PNG, side: PNG, notes: [] });
    expect(screen).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("checks an unchecked or pre-screening photo again, briefly, and attaches it once it passes", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5", view: "front" });
    const rows: SizingPhotoRow[] = [
      { view: "front", data_url: PNG, drive_file_id: null, screening_status: "unchecked" },
      { view: "side", data_url: PNG, drive_file_id: null, screening_status: null },
    ];
    const out = await sizingPhotosForTelegram(admin, ID, rows, { screen, drive: null });
    expect(out).toEqual({ front: PNG, side: PNG, notes: [] });
    expect(screen).toHaveBeenCalledWith(expect.anything(), "front", { timeoutMs: 8_000, maxRetries: 0 });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ op: "update", patch: { screening_status: "passed", screening_model: "claude-haiku-5-5" } });
  });

  it("deletes a photo the retry rejects, and says so", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "rejected", reason: "no" });
    const out = await sizingPhotosForTelegram(admin, ID, [{ view: "side", data_url: PNG, drive_file_id: null, screening_status: "unchecked" }], { screen, drive: null });
    expect(out).toEqual({ front: null, side: null, notes: ["📷 Side photo removed: it didn't pass the photo check."] });
    expect(writes).toEqual([{ op: "delete", filters: [["response_id", ID], ["view", "side"]] }]);
  });

  it("leaves out a photo Claude still can't check, keeping it, and says so", async () => {
    const { admin, writes } = fakeAdmin();
    const screen = screenWith({ status: "unchecked", error: "down" });
    const rows: SizingPhotoRow[] = [
      { view: "side", data_url: PNG, drive_file_id: null, screening_status: "unchecked" },
      { view: "front", data_url: HEIC, drive_file_id: null, screening_status: null },
    ];
    const out = await sizingPhotosForTelegram(admin, ID, rows, { screen, drive: null });
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

function fakeDrive(read: () => Promise<{ bytes: Buffer; mimeType: string }> = async () => ({ bytes: Buffer.from(PNG.split(",")[1], "base64"), mimeType: "image/png" })) {
  const drive = {
    folders: vi.fn(),
    upload: vi.fn(),
    moveOutOf: vi.fn(async () => undefined),
    trash: vi.fn(async () => undefined),
    download: vi.fn(read),
  };
  return drive as typeof drive & PhotoDrive;
}

describe("sizingPhotosForTelegram with photos on Google Drive", () => {
  it("attaches a photo that has moved to Drive, read through the server", async () => {
    const { admin } = fakeAdmin();
    const drive = fakeDrive();
    const out = await sizingPhotosForTelegram(admin, ID, [{ view: "side", data_url: null, drive_file_id: "file-side", screening_status: "passed" }], { drive });
    expect(out).toEqual({ front: null, side: PNG, notes: [] });
    expect(drive.download).toHaveBeenCalledWith("file-side");
  });

  it("reads a photo still waiting to move from the database, not Drive", async () => {
    const { admin } = fakeAdmin();
    const drive = fakeDrive();
    await sizingPhotosForTelegram(admin, ID, [{ view: "side", data_url: PNG, drive_file_id: "older-file", screening_status: "passed" }], { drive });
    expect(drive.download).not.toHaveBeenCalled();
  });

  it("says so when Drive can't be read, instead of failing the submit", async () => {
    const { admin } = fakeAdmin();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const drive = fakeDrive(async () => {
      throw new Error("token revoked");
    });
    const out = await sizingPhotosForTelegram(admin, ID, [{ view: "front", data_url: null, drive_file_id: "f", screening_status: "passed" }], { drive });
    expect(out).toEqual({ front: null, side: null, notes: ["📷 Front photo not attached: it couldn't be read from Google Drive."] });
  });

  it("files an unchecked photo on Drive under the view Claude saw once it passes", async () => {
    const { admin, writes } = fakeAdmin({ drive_file_id: "f", data_url: null });
    const drive = fakeDrive();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5", view: "back" });
    await sizingPhotosForTelegram(admin, ID, [{ view: "front", data_url: null, drive_file_id: "f", screening_status: "unchecked" }], { screen, drive });
    expect(writes[0]).toMatchObject({ op: "update", patch: { screening_status: "passed", screened_view: "back" } });
    expect(drive.moveOutOf).toHaveBeenCalledWith("f", "unchecked", "back");
  });

  it("files the Drive copy the row points to after the re-check, even one that moved while Claude was checking", async () => {
    const { admin } = fakeAdmin({ drive_file_id: "moved-meanwhile", data_url: null });
    const drive = fakeDrive();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5", view: "back" });
    await sizingPhotosForTelegram(admin, ID, [{ view: "front", data_url: PNG, drive_file_id: null, screening_status: "unchecked" }], { screen, drive });
    expect(drive.moveOutOf).toHaveBeenCalledWith("moved-meanwhile", "unchecked", "back");
  });

  it("leaves a passed photo still waiting to move for the move to file", async () => {
    const { admin } = fakeAdmin({ drive_file_id: "older-file", data_url: PNG });
    const drive = fakeDrive();
    const screen = screenWith({ status: "passed", model: "claude-haiku-5-5", view: "front" });
    await sizingPhotosForTelegram(admin, ID, [{ view: "front", data_url: PNG, drive_file_id: "older-file", screening_status: "unchecked" }], { screen, drive });
    expect(drive.moveOutOf).not.toHaveBeenCalled();
  });

  it("deletes a photo the retry rejects, leaving its Drive file to the database's release queue", async () => {
    const { admin, writes } = fakeAdmin();
    const drive = fakeDrive();
    const screen = screenWith({ status: "rejected", reason: "no" });
    await sizingPhotosForTelegram(admin, ID, [{ view: "side", data_url: null, drive_file_id: "f", screening_status: "unchecked" }], { screen, drive });
    expect(writes).toEqual([{ op: "delete", filters: [["response_id", ID], ["view", "side"]] }]);
    expect(drive.trash).not.toHaveBeenCalled();
  });
});

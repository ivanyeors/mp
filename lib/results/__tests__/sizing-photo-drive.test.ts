import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  googlePhotoDrive,
  moveSizingPhotosToDrive,
  photoDriveFromEnv,
  runSizingPhotoMoves,
  sizingPhotoFolder,
  trashReleasedSizingPhotos,
  type PhotoDrive,
  type SizingPhotoUpload,
} from "@/lib/results/sizing-photo-drive";

const RESULT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEBP_A = `data:image/webp;base64,${Buffer.from("photo-a").toString("base64")}`;
const WEBP_B = `data:image/webp;base64,${Buffer.from("photo-b").toString("base64")}`;

type Row = {
  id: string;
  response_id: string;
  view: string;
  data_url: string | null;
  drive_file_id: string | null;
  screening_status: string | null;
  screened_view: string | null;
  updated_at: string;
};

let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 26) + tick++ * 1000).toISOString();

function row(patch: Partial<Row> = {}): Row {
  return {
    id: "row-front",
    response_id: RESULT,
    view: "front",
    data_url: WEBP_A,
    drive_file_id: null,
    screening_status: "passed",
    screened_view: "front",
    updated_at: stamp(),
    ...patch,
  };
}

type Released = { drive_file_id: string; released_at: string };

function fakeDb(rows: Row[], fail: { update?: boolean; reread?: boolean } = {}, queue: Released[] = []) {
  const tables: Record<string, Record<string, unknown>[]> = { mp_config_response_photos: rows, sizing_photo_drive_trash: queue };
  const admin = {
    from: (name: string) => {
      const list = tables[name];
      const s = {
        op: "select" as "select" | "update" | "delete",
        patch: {} as Record<string, unknown>,
        where: [] as ((r: Record<string, unknown>) => boolean)[],
        cols: "",
        count: false,
        head: false,
        orderBy: "",
        descending: false,
        limit: Infinity,
      };
      const run = async () => {
        const hit = list.filter((r) => s.where.every((w) => w(r)));
        if (s.op === "update") {
          if (fail.update) return { data: null, error: { message: "connection reset" } };
          for (const r of hit) Object.assign(r, s.patch, { updated_at: stamp() });
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        if (s.op === "delete") {
          for (const r of hit) list.splice(list.indexOf(r), 1);
          return { data: null, error: null };
        }
        if (fail.reread && s.cols === "drive_file_id") return { data: null, error: { message: "still down" } };
        const key = s.orderBy;
        const sorted = key ? [...hit].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (s.descending ? -1 : 1)) : hit;
        const data = s.head ? null : sorted.slice(0, s.limit).map((r) => ({ ...r }));
        return { data, error: null, count: s.count ? hit.length : null };
      };
      const b = {
        select: (cols: string, opts?: { count?: string; head?: boolean }) => {
          if (s.op === "select") s.cols = cols;
          s.count = Boolean(opts?.count);
          s.head = Boolean(opts?.head);
          return b;
        },
        update: (patch: Record<string, unknown>) => ((s.op = "update"), (s.patch = patch), b),
        delete: () => ((s.op = "delete"), b),
        not: (col: string) => (s.where.push((r) => r[col] !== null), b),
        eq: (col: string, v: unknown) => (s.where.push((r) => r[col] === v), b),
        lt: (col: string, v: string) => (s.where.push((r) => String(r[col]) < v), b),
        order: (col: string, opts?: { ascending?: boolean }) => ((s.orderBy = col), (s.descending = opts?.ascending === false), b),
        limit: (n: number) => ((s.limit = n), b),
        maybeSingle: async () => {
          const res = await run();
          return { data: res.data?.[0] ?? null, error: res.error };
        },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return admin;
}

function fakeDrive(onUpload?: (photo: SizingPhotoUpload) => void) {
  const uploads: SizingPhotoUpload[] = [];
  const trashed: string[] = [];
  const drive: PhotoDrive = {
    folders: async () => ({ front: "f", back: "b", side: "s", unchecked: "u" }),
    upload: async (photo) => {
      uploads.push(photo);
      onUpload?.(photo);
      return `file-${uploads.length}`;
    },
    moveOutOf: async () => undefined,
    trash: async (id) => void trashed.push(id),
    download: async () => ({ bytes: Buffer.from("photo-a"), mimeType: "image/webp" }),
  };
  return { drive, uploads, trashed };
}

describe("sizingPhotoFolder", () => {
  it.each([
    [{ view: "front", screening_status: "passed", screened_view: "front" }, "front"],
    [{ view: "front", screening_status: "passed", screened_view: "back" }, "back"],
    [{ view: "front", screening_status: "passed", screened_view: null }, "front"],
    [{ view: "side", screening_status: "passed", screened_view: "side" }, "side"],
    [{ view: "side", screening_status: "passed", screened_view: null }, "side"],
    [{ view: "front", screening_status: "unchecked", screened_view: null }, "unchecked"],
    [{ view: "side", screening_status: null, screened_view: null }, "unchecked"],
  ])("%o goes in %s", (place, folder) => {
    expect(sizingPhotoFolder(place)).toBe(folder);
  });
});

describe("moveSizingPhotosToDrive", () => {
  it("copies a waiting photo into its folder, then clears it from the database", async () => {
    const rows = [row({ screened_view: "back" })];
    const { drive, uploads, trashed } = fakeDrive();
    expect(await moveSizingPhotosToDrive(fakeDb(rows), { drive })).toMatchObject({ configured: true, moved: 1, failed: 0 });
    expect(uploads[0]).toMatchObject({ name: `${RESULT}-front.webp`, folder: "back", mimeType: "image/webp", responseId: RESULT, view: "front" });
    expect(uploads[0].bytes.toString()).toBe("photo-a");
    expect(rows[0]).toMatchObject({ drive_file_id: "file-1", data_url: null });
    expect(trashed).toEqual([]);
  });

  it("keeps the customer's new photo when they replace it during the copy, and trashes the stale copy", async () => {
    const rows = [row()];
    const { drive, trashed } = fakeDrive(() => Object.assign(rows[0], { data_url: WEBP_B, updated_at: stamp() }));
    expect(await moveSizingPhotosToDrive(fakeDb(rows), { drive })).toMatchObject({ configured: true, moved: 0, failed: 0 });
    expect(rows[0]).toMatchObject({ data_url: WEBP_B, drive_file_id: null });
    expect(trashed).toEqual(["file-1"]);

    const second = fakeDrive();
    expect(await moveSizingPhotosToDrive(fakeDb(rows), { drive: second.drive })).toMatchObject({ moved: 1 });
    expect(second.uploads[0].bytes.toString()).toBe("photo-b");
    expect(rows[0]).toMatchObject({ data_url: null, drive_file_id: "file-1" });
  });

  it("points a replaced photo at its new file and leaves the old one to the database's release queue", async () => {
    const rows = [row({ data_url: WEBP_B, drive_file_id: "old-file" })];
    const { drive, trashed } = fakeDrive();
    await moveSizingPhotosToDrive(fakeDb(rows), { drive });
    expect(rows[0]).toMatchObject({ data_url: null, drive_file_id: "file-1" });
    expect(trashed).toEqual([]);
  });

  it("moves newer photos even when older ones keep failing", async () => {
    const broken = [1, 2].map((n) => row({ id: `broken-${n}`, data_url: "data:text/plain;base64,eA==" }));
    const fresh = [1, 2].map((n) => row({ id: `fresh-${n}`, view: n === 1 ? "front" : "side" }));
    const rows = [...broken, ...fresh];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await moveSizingPhotosToDrive(fakeDb(rows), { drive: fakeDrive().drive, limit: 2 })).toMatchObject({ moved: 2, failed: 0 });
    expect(rows.filter((r) => r.drive_file_id).map((r) => r.id).sort()).toEqual(["fresh-1", "fresh-2"]);
  });

  it("pages past failures with a cursor, so the script reaches every photo", async () => {
    const rows = [row({ id: "old" }), row({ id: "broken", data_url: "data:text/plain;base64,eA==" }), row({ id: "new" })];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = fakeDb(rows);
    const { drive } = fakeDrive();
    const first = await moveSizingPhotosToDrive(db, { drive, limit: 2 });
    expect(first).toMatchObject({ moved: 1, failed: 1, lastSeen: rows[1].updated_at });
    const second = await moveSizingPhotosToDrive(db, { drive, limit: 2, olderThan: first.lastSeen! });
    expect(second).toMatchObject({ moved: 1, failed: 0 });
    expect(rows.find((r) => r.id === "old")?.drive_file_id).toBe("file-2");
  });

  it("keeps the photo in the database when Drive refuses the upload", async () => {
    const rows = [row()];
    const { drive } = fakeDrive(() => {
      throw new Error("token revoked");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await moveSizingPhotosToDrive(fakeDb(rows), { drive })).toMatchObject({ configured: true, moved: 0, failed: 1 });
    expect(rows[0]).toMatchObject({ data_url: WEBP_A, drive_file_id: null });
  });

  it("trashes its copy and keeps the database photo when saving the Drive id fails", async () => {
    const rows = [row()];
    const { drive, trashed } = fakeDrive();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await moveSizingPhotosToDrive(fakeDb(rows, { update: true }), { drive })).toMatchObject({ moved: 0, failed: 1 });
    expect(rows[0]).toMatchObject({ data_url: WEBP_A, drive_file_id: null });
    expect(trashed).toEqual(["file-1"]);
  });

  it("never trashes a copy it can't prove is unused", async () => {
    const rows = [row()];
    const { drive, trashed } = fakeDrive();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await moveSizingPhotosToDrive(fakeDb(rows, { update: true, reread: true }), { drive })).toMatchObject({ failed: 1 });
    expect(trashed).toEqual([]);
  });

  it("does nothing, and reads nothing, when Drive is not set up", async () => {
    const admin = { from: vi.fn() } as unknown as SupabaseClient;
    expect(await moveSizingPhotosToDrive(admin, { drive: null })).toEqual({ configured: false, moved: 0, failed: 0 });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("moves only the Result it is asked about", async () => {
    const rows = [row(), row({ id: "other", response_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })];
    const { drive } = fakeDrive();
    await moveSizingPhotosToDrive(fakeDb(rows), { drive, responseId: RESULT });
    expect(rows.map((r) => r.drive_file_id)).toEqual(["file-1", null]);
  });
});

describe("runSizingPhotoMoves (daily catch-up)", () => {
  const now = new Date("2026-11-27T00:00:00Z");

  it("alerts when photos are still waiting an hour after their upload", async () => {
    const rows = [row({ updated_at: "2026-11-26T10:00:00.000000+00:00" })];
    const { drive } = fakeDrive(() => {
      throw new Error("Drive down");
    });
    const notify = vi.fn(async () => "sent");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = await runSizingPhotoMoves(fakeDb(rows), now, { drive, notify });
    expect(report).toMatchObject({ failed: 1, waiting: 1, alerted: true });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("1 Sizing photo(s) are still waiting to move to Google Drive, the oldest since 2026-11-26"));
  });

  it("stays quiet once everything has moved", async () => {
    const rows = [row({ updated_at: "2026-11-26T10:00:00.000000+00:00" })];
    const notify = vi.fn(async () => "sent");
    expect(await runSizingPhotoMoves(fakeDb(rows), now, { drive: fakeDrive().drive, notify })).toMatchObject({ moved: 1, waiting: 0, alerted: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it("stays quiet when Drive is not set up and no photo has moved, as before the move", async () => {
    const notify = vi.fn(async () => "sent");
    expect(await runSizingPhotoMoves(fakeDb([row()]), now, { drive: null, notify })).toMatchObject({ configured: false, onDrive: 0, alerted: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it("alerts when the Drive connection goes missing while photos live on Drive", async () => {
    const notify = vi.fn(async () => "sent");
    const rows = [row({ data_url: null, drive_file_id: "f1" }), row({ id: "side", view: "side", data_url: null, drive_file_id: "f2" })];
    expect(await runSizingPhotoMoves(fakeDb(rows), now, { drive: null, notify })).toMatchObject({ configured: false, onDrive: 2, alerted: true });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("connection for Sizing photos is missing, and 2 photo(s) live on Drive"));
  });

  it("trashes the files the database released", async () => {
    const queue = [{ drive_file_id: "released", released_at: stamp() }];
    const { drive, trashed } = fakeDrive();
    const report = await runSizingPhotoMoves(fakeDb([], {}, queue), now, { drive, notify: vi.fn() });
    expect(report.released).toEqual({ trashed: 1, failed: 0 });
    expect(trashed).toEqual(["released"]);
    expect(queue).toEqual([]);
  });
});

describe("googlePhotoDrive", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const md5 = (s: string) => createHash("md5").update(Buffer.from(s)).digest("hex");

  function fakeGoogle(md5Checksum: (sent: string) => string, existing: string[] = ["front", "back", "side", "unchecked"], uploaded: Record<string, unknown> = {}) {
    const calls: { method: string; url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body instanceof Uint8Array ? Buffer.from(init.body).toString("latin1") : String(init?.body ?? "");
      calls.push({ method: init?.method ?? "GET", url: u, body });
      if (u.includes("/upload/")) return json({ id: "photo1", md5Checksum: md5Checksum(body), ...uploaded });
      if (init?.method === "PATCH") return json({ id: "photo1" });
      if (init?.method === "POST") return json({ id: `made-${JSON.parse(body).name}` });
      const name = /name = '([a-z]+)'/.exec(decodeURIComponent(u.replace(/\+/g, " ")))?.[1] ?? "";
      return json({ files: existing.includes(name) ? [{ id: `id-${name}` }] : [] });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
  }

  const photo = (): SizingPhotoUpload => ({ bytes: Buffer.from("photo-a"), mimeType: "image/webp", name: `${RESULT}-front.webp`, folder: "back", responseId: RESULT, view: "front" });

  it("uploads into the folder's id with the Result on the file, and returns the id once Drive holds the same bytes", async () => {
    const { fetchImpl, calls } = fakeGoogle(() => md5("photo-a"));
    const drive = googlePhotoDrive("root-ok", async () => "token", fetchImpl);
    expect(await drive.upload(photo())).toBe("photo1");
    const upload = calls.find((c) => c.url.includes("/upload/"))!;
    expect(upload.url).toContain("uploadType=multipart");
    expect(upload.body).toContain(`"parents":["id-back"]`);
    expect(upload.body).toContain(`"appProperties":{"response_id":"${RESULT}","view":"front"}`);
    expect(upload.body).toContain("photo-a");
  });

  it("trashes the upload and fails when Drive's checksum doesn't match", async () => {
    const { fetchImpl, calls } = fakeGoogle(() => md5("something else"));
    const drive = googlePhotoDrive("root-bad-md5", async () => "token", fetchImpl);
    await expect(drive.upload(photo())).rejects.toThrow("Drive did not keep the same bytes");
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: JSON.stringify({ trashed: true }) });
  });

  it("makes a folder that is missing, once", async () => {
    const { fetchImpl, calls } = fakeGoogle(() => md5("photo-a"), ["front", "side"]);
    const drive = googlePhotoDrive("root-missing", async () => "token", fetchImpl);
    expect(await drive.folders()).toEqual({ front: "id-front", back: "made-back", side: "id-side", unchecked: "made-unchecked" });
    await drive.folders();
    expect(calls.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body))).toEqual([
      { name: "back", mimeType: "application/vnd.google-apps.folder", parents: ["root-missing"] },
      { name: "unchecked", mimeType: "application/vnd.google-apps.folder", parents: ["root-missing"] },
    ]);
  });

  it("leaves a photo where a person put it instead of moving it out of a folder it isn't in", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("fields=parents")) return json({ parents: ["id-side"] });
      return json({ files: [{ id: `id-${/name = '([a-z]+)'/.exec(decodeURIComponent(String(url).replace(/\+/g, " ")))?.[1]}` }] });
    }) as unknown as typeof fetch;
    const drive = googlePhotoDrive("root-labelled", async () => "token", fetchImpl);
    await drive.moveOutOf("photo1", "unchecked", "front");
    expect(calls.some((c) => c.startsWith("PATCH"))).toBe(false);
  });

  it("refuses a photo over Drive's 5 MB one-request upload before calling Drive", async () => {
    const { fetchImpl, calls } = fakeGoogle(() => md5("photo-a"));
    const drive = googlePhotoDrive("root-too-big", async () => "token", fetchImpl);
    await expect(drive.upload({ ...photo(), bytes: Buffer.alloc(5 * 1024 * 1024 + 1) })).rejects.toThrow("over Drive's 5 MB");
    expect(calls).toEqual([]);
  });

  it("fails, and looks the folders up again, when the upload landed in a trashed folder", async () => {
    const { fetchImpl, calls } = fakeGoogle(() => md5("photo-a"), undefined, { trashed: true });
    const drive = googlePhotoDrive("root-trashed", async () => "token", fetchImpl);
    await expect(drive.upload(photo())).rejects.toThrow("the back folder is in Drive's trash");
    const listings = () => calls.filter((c) => c.method === "GET").length;
    const before = listings();
    await drive.folders();
    expect(listings()).toBe(before + 4);
  });

  it("treats trashing a file that is already gone as done", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: "File not found" } }), { status: 404 })) as unknown as typeof fetch;
    await expect(googlePhotoDrive("root-gone", async () => "token", fetchImpl).trash("gone")).resolves.toBeUndefined();
  });
});

describe("photoDriveFromEnv", () => {
  const full = {
    PHOTO_EVAL_DRIVE_FOLDER: "https://drive.google.com/drive/folders/1nyIoHRs2B9o2flyySQAEYTV2c3JrayoJ?usp=drive_link",
    GOOGLE_OAUTH_CLIENT_ID: "id",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN: "refresh",
  };

  it("is set up only when the folder and the photos token are both there", () => {
    expect(photoDriveFromEnv(full)).not.toBeNull();
    expect(photoDriveFromEnv({ ...full, GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN: "" })).toBeNull();
    expect(photoDriveFromEnv({ ...full, PHOTO_EVAL_DRIVE_FOLDER: "" })).toBeNull();
  });
});

describe("trashReleasedSizingPhotos", () => {
  it("trashes only files no row points to, and keeps a file it couldn't trash queued", async () => {
    const queue = [
      { drive_file_id: "gone-row", released_at: stamp() },
      { drive_file_id: "pointed-to-again", released_at: stamp() },
      { drive_file_id: "drive-refuses", released_at: stamp() },
    ];
    const rows = [row({ data_url: null, drive_file_id: "pointed-to-again" })];
    const { drive, trashed } = fakeDrive();
    drive.trash = async (id) => {
      if (id === "drive-refuses") throw new Error("rate limited");
      trashed.push(id);
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await trashReleasedSizingPhotos(fakeDb(rows, {}, queue), drive)).toEqual({ trashed: 1, failed: 1 });
    expect(trashed).toEqual(["gone-row"]);
    expect(queue.map((q) => q.drive_file_id)).toEqual(["drive-refuses"]);
  });
});

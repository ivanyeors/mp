import { describe, expect, it, vi } from "vitest";
import { parseCsv } from "@/lib/csv";
import {
  existingFromMatches,
  NO_EXISTING,
  normaliseRows,
  planRows,
  type ExistingLookup,
  type IndexedRawRow,
} from "@/lib/customer-migration/plan";
import {
  chunkRows,
  jsonBytes,
  PREVIEW_CHUNK_ROWS,
  PREVIEW_FIELDS,
  readPreviewChunk,
  runShopifyPreview,
  sha256Hex,
  skippedRowsCsv,
  type PreviewChunkFn,
} from "@/lib/customer-migration/preview";
import { buyer, exportCsv, FIVE_ROWS, FIVE_ROWS_MATCHES, SHOPIFY_EXPORT_HEADER } from "./fixtures";

function fakeServer(existing: ExistingLookup = NO_EXISTING) {
  const calls: IndexedRawRow[][] = [];
  const preview = vi.fn<PreviewChunkFn>(async (rows) => {
    calls.push(rows);
    const chunk = readPreviewChunk(JSON.parse(JSON.stringify(rows)));
    if (!chunk.ok) return chunk;
    return { ok: true, results: planRows(normaliseRows(chunk.rows), existing) };
  });
  return { preview, calls };
}

const done = async (text: string, existing?: ExistingLookup) => {
  const server = fakeServer(existing);
  const run = await runShopifyPreview(text, server.preview);
  if (run.kind !== "done") throw new Error(`expected a finished preview, got ${run.kind}`);
  return { run, ...server };
};

describe("runShopifyPreview: the header is checked in the browser", () => {
  it("refuses a file missing a required column before any server call", async () => {
    const { preview } = fakeServer();
    const header = SHOPIFY_EXPORT_HEADER.filter((h) => h !== "Accepts Email Marketing");
    const run = await runShopifyPreview(exportCsv([buyer(1)], header), preview);
    expect(run).toMatchObject({ kind: "header_error", header: { ok: false, missing: ["Accepts Email Marketing"] } });
    expect(preview).not.toHaveBeenCalled();
  });

  it("stops on a header with no rows, before any server call", async () => {
    const { preview } = fakeServer();
    expect((await runShopifyPreview(exportCsv([]), preview)).kind).toBe("empty");
    expect(preview).not.toHaveBeenCalled();
  });
});

describe("runShopifyPreview: the 5-row fixture", () => {
  it("shows counts that sum to the row count", async () => {
    const { run } = await done(exportCsv(FIVE_ROWS), existingFromMatches(FIVE_ROWS_MATCHES));
    const { outcomes, rowsTotal } = run.summary;
    expect(rowsTotal).toBe(5);
    expect(outcomes).toEqual({ create: 1, merge: 1, already_imported: 1, skip: 2 });
    expect(outcomes.create + outcomes.merge + outcomes.already_imported + outcomes.skip).toBe(rowsTotal);
  });

  it("counts skip reasons, repairs, buyers and consent", async () => {
    const { run } = await done(exportCsv(FIVE_ROWS), existingFromMatches(FIVE_ROWS_MATCHES));
    expect(run.summary.skipReasons).toEqual({ no_email: 1, invalid_email: 1 });
    expect(run.summary.repairs).toEqual({ zip_repaired: 1 });
    expect(run.summary).toMatchObject({ buyers: 1, nonBuyers: 1, consented: 1, notConsented: 1 });
  });

  it("lists the skipped rows from the browser's own copy", async () => {
    const { run } = await done(exportCsv(FIVE_ROWS), existingFromMatches(FIVE_ROWS_MATCHES));
    expect(run.skipped).toEqual([
      { row: 3, email: "", name: "Test3 Buyer", reason: "no_email" },
      { row: 5, email: "ema@example", name: "Test5 Buyer", reason: "invalid_email" },
    ]);
  });

  it("sends only the columns the preview reads: never SMS consent, tax status, tags or the note", async () => {
    const { calls } = await done(exportCsv(FIVE_ROWS));
    const sent = calls.flat();
    for (const { raw } of sent) {
      for (const key of Object.keys(raw)) expect(PREVIEW_FIELDS).toContain(key);
      expect(raw).not.toHaveProperty("tags");
      expect(raw).not.toHaveProperty("note");
    }
    expect(JSON.stringify(sent)).not.toMatch(/Test note|neck, vip/);
  });
});

describe("runShopifyPreview: a 5,000-row fixture", () => {
  const rows = Array.from({ length: 5000 }, (_, n) =>
    buyer(n + 1, {
      "Default Address Address2": `Unit ${n} `.padEnd(120, "x"),
      Note: "A long staff note that stays in the browser. ".repeat(20),
    }),
  );
  const text = exportCsv(rows);

  it("previews in chunks of at most 250 rows, with no call over 1 MB", async () => {
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(1024 * 1024);
    const progress: number[] = [];
    const server = fakeServer();
    const run = await runShopifyPreview(text, server.preview, (d) => progress.push(d));
    expect(run.kind).toBe("done");
    expect(server.calls.length).toBeGreaterThanOrEqual(20);
    for (const call of server.calls) {
      expect(call.length).toBeLessThanOrEqual(PREVIEW_CHUNK_ROWS);
      expect(jsonBytes(call)).toBeLessThan(1024 * 1024);
    }
    expect(server.calls.flat().map((r) => r.i)).toEqual(rows.map((_, i) => i));
    expect(progress.at(-1)).toBe(5000);
    if (run.kind !== "done") return;
    const { outcomes } = run.summary;
    expect(outcomes.create + outcomes.merge + outcomes.already_imported + outcomes.skip).toBe(5000);
    expect(outcomes.create).toBe(5000);
  });

  it("skips both copies of an email that falls in two different chunks", async () => {
    const dupes = rows.slice(0, 600).map((r, n) => (n === 599 ? { ...r, Email: "BUYER1@example.com" } : r));
    const { run, calls } = await done(exportCsv(dupes));
    expect(calls[0].some((r) => r.i === 0)).toBe(true);
    expect(calls[0].some((r) => r.i === 599)).toBe(false);
    expect(run.previews[0]).toEqual({ i: 0, outcome: "skip", reason: "duplicate_email_in_file", repairs: [] });
    expect(run.previews[599]).toEqual({ i: 599, outcome: "skip", reason: "duplicate_email_in_file", repairs: [] });
    expect(run.summary.outcomes).toMatchObject({ create: 598, skip: 2 });
  });
});

describe("runShopifyPreview: failures", () => {
  it("stops on a refused chunk", async () => {
    const run = await runShopifyPreview(exportCsv([buyer(1)]), async () => ({ ok: false, error: "Forbidden" }));
    expect(run).toMatchObject({ kind: "failed", error: "Forbidden" });
  });

  it("stops when the server action throws", async () => {
    const run = await runShopifyPreview(exportCsv([buyer(1)]), async () => {
      throw new Error("Unauthorized");
    });
    expect(run).toMatchObject({ kind: "failed", error: "Unauthorized" });
  });

  it("stops when a row gets no answer", async () => {
    const run = await runShopifyPreview(exportCsv([buyer(1), buyer(2)]), async () => ({
      ok: true,
      results: [{ i: 0, outcome: "create", repairs: [] }],
    }));
    expect(run).toMatchObject({ kind: "failed", error: "Row 2 got no answer from the server." });
  });
});

describe("chunkRows", () => {
  it("splits by row count and by size, and never drops a row", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ i, pad: "x".repeat(100) }));
    expect(chunkRows(rows, { maxRows: 4 }).map((c) => c.length)).toEqual([4, 4, 2]);
    const bySize = chunkRows(rows, { maxBytes: 350 });
    expect(bySize.flat()).toEqual(rows);
    for (const c of bySize) expect(jsonBytes(c)).toBeLessThanOrEqual(350);
  });
});

describe("readPreviewChunk: the server's check", () => {
  it("refuses more than 250 rows, an empty chunk and anything not a list", () => {
    const many = Array.from({ length: 251 }, (_, i) => ({ i, raw: {} }));
    expect(readPreviewChunk(many)).toMatchObject({ ok: false });
    expect(readPreviewChunk([])).toMatchObject({ ok: false });
    expect(readPreviewChunk("rows")).toMatchObject({ ok: false });
  });

  it("refuses a missing, negative or repeated row number", () => {
    expect(readPreviewChunk([{ raw: {} }])).toMatchObject({ ok: false });
    expect(readPreviewChunk([{ i: -1, raw: {} }])).toMatchObject({ ok: false });
    expect(readPreviewChunk([{ i: 1, raw: {} }, { i: 1, raw: {} }])).toMatchObject({ ok: false });
    expect(readPreviewChunk([{ i: 1, raw: null }])).toMatchObject({ ok: false });
  });

  it("keeps only the preview's string cells, whatever else arrives", () => {
    const out = readPreviewChunk([
      { i: 0, raw: { email: "a@example.com", note: "health remark", tags: "x", acceptsSmsMarketing: "yes", phone: 5 } },
    ]);
    expect(out).toEqual({ ok: true, rows: [{ i: 0, raw: { email: "a@example.com" } }] });
  });
});

describe("skippedRowsCsv", () => {
  it("builds the download in the browser, and a formula cannot run in a spreadsheet", () => {
    const csv = skippedRowsCsv([
      { row: 3, email: "", name: "Test Three", reason: "no_email" },
      { row: 4, email: "=HYPERLINK(\"x\")@example.com", name: "+Plus, Name", reason: "invalid_email" },
    ]);
    expect(parseCsv(csv)).toEqual([
      ["Row", "Email", "Name", "Reason"],
      ["3", "", "Test Three", "No email (a phone-only customer cannot sign in)"],
      ["4", "'=HYPERLINK(\"x\")@example.com", "'+Plus, Name", "Email is not a valid address"],
    ]);
  });
});

describe("sha256Hex", () => {
  it("is the file's SHA-256 in hex", async () => {
    const abc = new TextEncoder().encode("abc");
    expect(await sha256Hex(abc.buffer.slice(abc.byteOffset, abc.byteOffset + abc.byteLength) as ArrayBuffer)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

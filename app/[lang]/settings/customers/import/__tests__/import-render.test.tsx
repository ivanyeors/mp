import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImportBatchView } from "@/lib/customer-migration/batches";
import type { PreviewSummary } from "@/lib/customer-migration/preview";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers/import",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  previewShopifyImport: vi.fn(),
  startShopifyImport: vi.fn(),
  applyShopifyImportChunk: vi.fn(),
  finishShopifyImport: vi.fn(),
  previewShopifyImportUndo: vi.fn(),
  undoShopifyImport: vi.fn(),
}));

const { CustomerImportClient, ImportPanel } = await import("../import-client");

const SHA = "a".repeat(64);
const batch = (over: Partial<ImportBatchView> = {}): ImportBatchView => ({
  id: "b1",
  fileName: "customers_export.csv",
  sha256: SHA,
  rowsTotal: 3400,
  rowsDone: 3400,
  withAddresses: true,
  exportedAt: "2026-10-19",
  created: 3000,
  merged: 300,
  alreadyImported: 50,
  skipped: { no_email: 50 },
  runBy: "Ivan",
  createdAt: "2026-10-20T01:00:00Z",
  appliedAt: "2026-10-20T01:10:00Z",
  rolledBackAt: null,
  undoCounts: null,
  ...over,
});
const stopped = batch({ id: "b2", rowsDone: 1200, created: 1000, merged: 100, alreadyImported: 50, skipped: { no_email: 50 }, appliedAt: null });

const summary = (create: number, merge: number): PreviewSummary => ({
  rowsTotal: 3400,
  outcomes: { create, merge, already_imported: 3400 - create - merge, skip: 0 },
  skipReasons: {},
  repairs: {},
  buyers: 0,
  nonBuyers: 0,
  consented: 0,
  notConsented: 0,
});
const file = { name: "customers_export.csv", sha256: SHA, lastModified: Date.UTC(2026, 9, 19, 4), text: "", pickedAt: 1 };
const panel = (history: ImportBatchView[]) =>
  renderToStaticMarkup(
    <ImportPanel file={file} summary={summary(3000, 300)} history={history} onRunning={() => {}} onChanged={() => {}} />,
  );

describe("the Import step", () => {
  it("names the count, offers the conservative import and the export date, and waits for IMPORT", () => {
    const html = panel([]);
    expect(html).toContain("Import 3,300 customers");
    expect(html).toContain("Import without addresses");
    expect(html).toMatch(/type="date"[^>]*value="2026-10-19"|value="2026-10-19"[^>]*type="date"/);
    expect(html).toContain("Type IMPORT to confirm");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import 3,300 customers/);
  });

  it("refuses the same file twice: imported on, by whom, and the button disabled", () => {
    const html = panel([batch()]);
    expect(html).toContain("This file was imported on 20 Oct 2026, 09:10 am by Ivan");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import 3,300 customers/);
    expect(html).not.toContain("Type IMPORT");
  });

  it("continues a stopped batch from rows_done, with no second confirmation", () => {
    const html = panel([{ ...stopped, sha256: SHA }]);
    expect(html).toContain("Import stopped at 1,200 of 3,400.");
    expect(html).toContain("Continue from row 1,201");
    expect(html).not.toContain("Type IMPORT");
  });

  it("an undone batch frees the file", () => {
    expect(panel([batch({ rolledBackAt: "2026-10-21T00:00:00Z" })])).toContain("Type IMPORT to confirm");
  });
});

describe("the page and its history", () => {
  it("says where a stopped import stands, and that the same file continues it", () => {
    const html = renderToStaticMarkup(<CustomerImportClient history={[stopped]} />);
    expect(html).toContain("Import stopped at 1,200 of 3,400. Pick the same file to continue.");
    expect(html).toContain("A different file cannot continue it.");
  });

  it("lists each batch with who ran it, the four counts, its state and Undo", () => {
    const html = renderToStaticMarkup(
      <CustomerImportClient
        history={[
          batch(),
          stopped,
          batch({ id: "b3", rolledBackAt: "2026-10-21T00:00:00Z", undoCounts: { removed: 312, unlinked: 20, kept: 41, keptClaimed: 30, keptReferenced: 11 } }),
        ]}
      />,
    );
    for (const text of ["Import history", "customers_export.csv", "Ivan", "3,000", "300", "Applied", "Stopped", "at 1,200 of 3,400", "Undone", "312 removed, 41 kept"]) {
      expect(html).toContain(text);
    }
    expect(html.match(/>Undo</g)).toHaveLength(2);
    for (const id of ["b1", "b2", "b3"]) expect(html).toMatch(new RegExp(`<tr[^>]*id="batch-${id}"`));
  });

  it("shows a batch that does not reconcile in red, never as applied", () => {
    const html = renderToStaticMarkup(<CustomerImportClient history={[batch({ appliedAt: null, merged: 299 })]} />);
    expect(html).toContain("The counts do not reconcile, so this import is not marked done.");
    expect(html).toContain("Does not reconcile: 3,399 of 3,400 rows accounted for");
    expect(html).toMatch(/text-destructive/);
  });

  it("says so when the history cannot be read, and when there is none", () => {
    expect(renderToStaticMarkup(<CustomerImportClient history={null} />)).toContain("The import history could not be read.");
    expect(renderToStaticMarkup(<CustomerImportClient history={[]} />)).toContain("No imports yet.");
  });
});

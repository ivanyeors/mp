/**
 * Slice 05 — Results bulk export CSV helper.
 */
import { describe, it, expect } from "vitest";
import { rowsToCsv } from "@/lib/results/rows-to-csv";

describe("rowsToCsv", () => {
  it("emits a header row with stable field order", () => {
    const [header] = rowsToCsv([]).split("\r\n");
    expect(header).toBe(
      "id,updated_at,name,customer_email,status,source,location_id,order_number,suggested_size,suggested_tier,assigned_size,assigned_tier",
    );
  });

  it("keeps field order stable regardless of input key order", () => {
    const csv = rowsToCsv([
      // keys deliberately out of order
      { customer_email: "a@b.com", id: "r1", name: "Ann" } as never,
    ]);
    const [, row] = csv.split("\r\n");
    // id first, updated_at empty, then name, then email
    expect(row).toBe("r1,,Ann,a@b.com,,,,,,,,");
  });

  it("escapes commas, quotes, and newlines per RFC-4180", () => {
    const csv = rowsToCsv([
      {
        id: "r1",
        name: 'Doe, John',
        customer_email: 'say "hi"',
        status: "line1\nline2",
      },
    ]);
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"Doe, John"');
    expect(row).toContain('"say ""hi"""');
    expect(row).toContain('"line1\nline2"');
  });

  it("renders null/undefined fields as empty cells", () => {
    const csv = rowsToCsv([{ id: "r1", name: null, customer_email: undefined }]);
    const [, row] = csv.split("\r\n");
    expect(row).toBe("r1,,,,,,,,,,,");
  });
});

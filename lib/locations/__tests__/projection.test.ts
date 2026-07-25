/**
 * Slice 02 — Locations projection.
 * Maps to .claude/PRD-locations-booking/issues/02-locations-schema-partner-migration.md
 *
 * Locks the rule /our-partners depends on: own studios never leak into the partner
 * projection, and hidden partners are excluded unless explicitly requested.
 */
import { describe, it, expect } from "vitest";
import {
  selectPartnerRows,
  toResolvedLocation,
  type LocationRow,
} from "@/lib/locations";

const row = (o: Partial<LocationRow>): LocationRow =>
  ({
    id: "id",
    name: "X",
    logo_url: null,
    website_url: null,
    description: null,
    position: 0,
    visible: true,
    type: "partner",
    address: null,
    postal_code: null,
    created_at: "",
    updated_at: "",
    ...o,
  }) as LocationRow;

describe("selectPartnerRows", () => {
  const rows = [
    row({ id: "p1", type: "partner", visible: true }),
    row({ id: "p2", type: "partner", visible: false }),
    row({ id: "o1", type: "own", visible: true }),
  ];

  it("returns only visible partners — own studios never leak", () => {
    expect(selectPartnerRows(rows).map((r) => r.id)).toEqual(["p1"]);
  });

  it("includes hidden partners when asked, still excludes own studios", () => {
    expect(selectPartnerRows(rows, true).map((r) => r.id)).toEqual(["p1", "p2"]);
  });

  it("preserves input order (already position-sorted)", () => {
    const ordered = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];
    expect(selectPartnerRows(ordered).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("toResolvedLocation", () => {
  it("maps snake_case columns and keeps own studios", () => {
    const r = toResolvedLocation(
      row({ id: "o1", type: "own", address: "1 A St", postal_code: "12345" }),
    );
    expect(r).toEqual({
      id: "o1",
      name: "X",
      type: "own",
      address: "1 A St",
      postalCode: "12345",
      visible: true,
    });
  });
});

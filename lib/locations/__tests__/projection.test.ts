/**
 * Slice 02 — Locations projection.
 * Maps to .claude/PRD-locations-booking/issues/02-locations-schema-partner-migration.md
 *
 * Locks the rule /our-partners depends on: own studios never leak into the partner
 * projection, and hidden partners are excluded unless explicitly requested.
 */
import { describe, it, expect } from "vitest";
import {
  selectBookableLocations,
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
    bookable: true,
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

  // ADR 0037: a partner with several clinics is one main row plus branch rows.
  describe("with branch rows", () => {
    const withBranches = [
      row({ id: "p1", name: "Alignwell Chiropractic", type: "partner", visible: true }),
      row({ id: "p1-novena", parent_id: "p1", branch_name: "Novena", visible: true }),
      row({ id: "p1-tampines", parent_id: "p1", branch_name: "Tampines", visible: false }),
      row({ id: "p2", name: "Harbourline Physio", type: "partner", visible: false }),
      row({ id: "p2-bishan", parent_id: "p2", branch_name: "Bishan", visible: false }),
      row({ id: "o1", type: "own", visible: true }),
    ];

    it("excludes branch rows, so each partner appears once", () => {
      expect(selectPartnerRows(withBranches).map((r) => r.id)).toEqual(["p1"]);
    });

    it("excludes branch rows, hidden ones included, when hidden partners are asked for", () => {
      expect(selectPartnerRows(withBranches, true).map((r) => r.id)).toEqual(["p1", "p2"]);
    });

    it("keeps a main row that carries a branch name", () => {
      const rows = [
        row({ id: "p3", name: "Meridian Sleep Clinic", branch_name: "Orchard", parent_id: null }),
        row({ id: "p3-katong", parent_id: "p3", branch_name: "Katong" }),
      ];
      expect(selectPartnerRows(rows).map((r) => r.id)).toEqual(["p3"]);
    });
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
      bookable: true,
    });
  });

  it("treats a missing bookable column as bookable", () => {
    const { bookable: _omit, ...legacy } = row({ id: "l1" });
    expect(toResolvedLocation(legacy as LocationRow).bookable).toBe(true);
  });

  it("names a branch row '<partner> · <branch>', other fields unchanged", () => {
    const r = toResolvedLocation(
      row({
        id: "p1-novena",
        name: "Alignwell Chiropractic",
        branch_name: "Novena",
        parent_id: "p1",
        address: "10 Sinaran Drive\n#08-12\nSingapore",
        postal_code: "307506",
      }),
    );
    expect(r).toEqual({
      id: "p1-novena",
      name: "Alignwell Chiropractic · Novena",
      type: "partner",
      address: "10 Sinaran Drive\n#08-12\nSingapore",
      postalCode: "307506",
      visible: true,
      bookable: true,
    });
  });

  it("names a main row with a branch name the same way", () => {
    const r = toResolvedLocation(
      row({ id: "p2", name: "Harbourline Physio", branch_name: "Tanjong Pagar", parent_id: null }),
    );
    expect(r.name).toBe("Harbourline Physio · Tanjong Pagar");
  });

  it("uses the trimmed branch name", () => {
    const r = toResolvedLocation(
      row({ id: "p1-tampines", name: "Alignwell Chiropractic", branch_name: "  Tampines ", parent_id: "p1" }),
    );
    expect(r.name).toBe("Alignwell Chiropractic · Tampines");
  });

  it("keeps the plain name when the branch name is blank or missing", () => {
    expect(toResolvedLocation(row({ name: "Meridian Sleep Clinic", branch_name: "  " })).name).toBe(
      "Meridian Sleep Clinic",
    );
    expect(toResolvedLocation(row({ name: "Meridian Sleep Clinic", branch_name: null })).name).toBe(
      "Meridian Sleep Clinic",
    );
    expect(toResolvedLocation(row({ name: "Meridian Sleep Clinic" })).name).toBe(
      "Meridian Sleep Clinic",
    );
  });
});

describe("selectBookableLocations", () => {
  const resolved = [
    row({ id: "own-hidden", type: "own", visible: false, address: "1 Studio Rd" }),
    row({ id: "partner-on", type: "partner", visible: true, address: "2 Clinic Ave" }),
    row({ id: "partner-off", type: "partner", visible: true, address: "3 Off St", bookable: false }),
    row({ id: "no-address", type: "partner", visible: true, address: "  " }),
    row({ id: "online-only", type: "partner", visible: true, address: null }),
  ].map(toResolvedLocation);

  it("keeps bookable rows with an address regardless of /our-partners visibility", () => {
    expect(selectBookableLocations(resolved).map((l) => l.id)).toEqual([
      "own-hidden",
      "partner-on",
    ]);
  });
});

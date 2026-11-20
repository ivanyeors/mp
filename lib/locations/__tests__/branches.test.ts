import { describe, it, expect } from "vitest";
import {
  branchesByParent,
  formatLocationAddress,
  isBranch,
  locationDisplayName,
  locationMapsUrl,
  orderWithBranches,
} from "@/lib/locations";
import { planBranchSave, type BranchInput } from "@/lib/locations/branches";

type Loc = { id: string; name: string; parent_id?: string | null; position?: number | null };

const main = (id: string, name: string, position: number): Loc => ({
  id,
  name,
  parent_id: null,
  position,
});
const branch = (id: string, parentId: string, position: number): Loc => ({
  id,
  name: "",
  parent_id: parentId,
  position,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("isBranch", () => {
  it("is true when parent_id names a main row", () => {
    expect(isBranch({ parent_id: "alignwell" })).toBe(true);
  });

  it("is false for a main row (parent_id null)", () => {
    expect(isBranch({ parent_id: null })).toBe(false);
  });

  it("is false when parent_id is missing", () => {
    expect(isBranch({})).toBe(false);
  });

  it("is false when parent_id is an empty string", () => {
    expect(isBranch({ parent_id: "" })).toBe(false);
  });
});

describe("locationDisplayName", () => {
  it("joins the partner name and branch name with a spaced middle dot", () => {
    expect(locationDisplayName({ name: "Alignwell Chiropractic", branch_name: "Novena" })).toBe(
      "Alignwell Chiropractic · Novena",
    );
  });

  it("uses the trimmed branch name", () => {
    expect(
      locationDisplayName({ name: "Alignwell Chiropractic", branch_name: "  Tampines  " }),
    ).toBe("Alignwell Chiropractic · Tampines");
  });

  it("suffixes the main row too when it has a branch name", () => {
    expect(
      locationDisplayName({ name: "Harbourline Physio", branch_name: "Tanjong Pagar" }),
    ).toBe("Harbourline Physio · Tanjong Pagar");
  });

  it("returns the name unchanged when branch_name is null", () => {
    expect(locationDisplayName({ name: "Meridian Sleep Clinic", branch_name: null })).toBe(
      "Meridian Sleep Clinic",
    );
  });

  it("returns the name unchanged when branch_name is missing", () => {
    expect(locationDisplayName({ name: "Meridian Sleep Clinic" })).toBe("Meridian Sleep Clinic");
  });

  it("returns the name unchanged when branch_name is empty or whitespace", () => {
    expect(locationDisplayName({ name: "Meridian Sleep Clinic", branch_name: "" })).toBe(
      "Meridian Sleep Clinic",
    );
    expect(locationDisplayName({ name: "Meridian Sleep Clinic", branch_name: "   " })).toBe(
      "Meridian Sleep Clinic",
    );
  });
});

describe("branchesByParent", () => {
  const rows: Loc[] = [
    main("alignwell", "Alignwell Chiropractic", 0),
    branch("aw-jurong", "alignwell", 2),
    main("harbourline", "Harbourline Physio", 1),
    branch("aw-novena", "alignwell", 0),
    branch("hl-bishan", "harbourline", 0),
    main("meridian", "Meridian Sleep Clinic", 2),
    branch("aw-tampines", "alignwell", 1),
  ];

  it("groups each partner's branches under its main-row id, sorted by position", () => {
    const map = branchesByParent(rows);
    expect(ids(map.get("alignwell") ?? [])).toEqual(["aw-novena", "aw-tampines", "aw-jurong"]);
    expect(ids(map.get("harbourline") ?? [])).toEqual(["hl-bishan"]);
  });

  it("gives a partner with no branches no branch rows", () => {
    expect(branchesByParent(rows).get("meridian") ?? []).toEqual([]);
  });

  it("never puts a main row in the map's values", () => {
    const values = [...branchesByParent(rows).values()].flat();
    expect(values.every((r) => !!r.parent_id)).toBe(true);
    expect(ids(values).sort()).toEqual(["aw-jurong", "aw-novena", "aw-tampines", "hl-bishan"]);
  });

  it("returns an empty map for no rows", () => {
    expect(branchesByParent([]).size).toBe(0);
  });
});

describe("orderWithBranches", () => {
  it("puts each main row, in input order, straight before its branches", () => {
    const rows: Loc[] = [
      main("alignwell", "Alignwell Chiropractic", 0),
      branch("aw-novena", "alignwell", 0),
      branch("hl-bishan", "harbourline", 0),
      main("harbourline", "Harbourline Physio", 1),
      branch("aw-tampines", "alignwell", 1),
      main("meridian", "Meridian Sleep Clinic", 2),
      branch("aw-jurong", "alignwell", 2),
    ];
    expect(ids(orderWithBranches(rows))).toEqual([
      "alignwell",
      "aw-novena",
      "aw-tampines",
      "aw-jurong",
      "harbourline",
      "hl-bishan",
      "meridian",
    ]);
  });

  it("sorts a partner's branches by their own position", () => {
    const rows: Loc[] = [
      main("alignwell", "Alignwell Chiropractic", 0),
      branch("aw-jurong", "alignwell", 2),
      branch("aw-tampines", "alignwell", 1),
      branch("aw-novena", "alignwell", 0),
    ];
    expect(ids(orderWithBranches(rows))).toEqual([
      "alignwell",
      "aw-novena",
      "aw-tampines",
      "aw-jurong",
    ]);
  });

  it("appends a branch whose main row is not in the input at the end", () => {
    const rows: Loc[] = [
      main("alignwell", "Alignwell Chiropractic", 0),
      branch("orphan-clementi", "closed-partner", 0),
      branch("aw-novena", "alignwell", 0),
      main("harbourline", "Harbourline Physio", 1),
    ];
    const out = orderWithBranches(rows);
    expect(ids(out)).toEqual(["alignwell", "aw-novena", "harbourline", "orphan-clementi"]);
  });

  it("never drops orphaned branches", () => {
    const rows: Loc[] = [
      branch("orphan-yishun", "gone-a", 0),
      main("meridian", "Meridian Sleep Clinic", 0),
      branch("orphan-bedok", "gone-b", 1),
    ];
    const out = orderWithBranches(rows);
    expect(out).toHaveLength(rows.length);
    expect(out[0].id).toBe("meridian");
    expect(ids(out.slice(1)).sort()).toEqual(["orphan-bedok", "orphan-yishun"]);
  });

  it("returns as many rows as it was given, each exactly once", () => {
    const rows: Loc[] = [
      main("alignwell", "Alignwell Chiropractic", 0),
      branch("aw-novena", "alignwell", 0),
      main("harbourline", "Harbourline Physio", 1),
      branch("aw-tampines", "alignwell", 1),
      branch("stray", "nowhere", 1),
    ];
    const out = orderWithBranches(rows);
    expect(out).toHaveLength(rows.length);
    expect(ids(out).sort()).toEqual(ids(rows).sort());
  });

  it("keeps a list of main rows only as given", () => {
    const rows: Loc[] = [
      main("alignwell", "Alignwell Chiropractic", 0),
      main("harbourline", "Harbourline Physio", 1),
      main("meridian", "Meridian Sleep Clinic", 2),
    ];
    expect(ids(orderWithBranches(rows))).toEqual(["alignwell", "harbourline", "meridian"]);
  });

  it("returns an empty list for no rows", () => {
    expect(orderWithBranches([])).toEqual([]);
  });
});

describe("formatLocationAddress", () => {
  it("joins lines and puts the postal code after a trailing Singapore", () => {
    expect(
      formatLocationAddress("190 Middle Road\n#14-07\nFortune Centre\nSingapore", "188979"),
    ).toBe("190 Middle Road, #14-07, Fortune Centre, Singapore 188979");
  });

  it("splits on Windows line endings too", () => {
    expect(
      formatLocationAddress("8 Tampines Central 1\r\n#03-15\r\nTampines Plaza\r\nSingapore", "529541"),
    ).toBe("8 Tampines Central 1, #03-15, Tampines Plaza, Singapore 529541");
  });

  it("trims each line, strips trailing commas and drops empty lines", () => {
    expect(
      formatLocationAddress(
        "  38 Irrawaddy Road,\n\n   #05-21,  \n,\n  Singapore  \n",
        "329563",
      ),
    ).toBe("38 Irrawaddy Road, #05-21, Singapore 329563");
  });

  it("matches Singapore on the last line case-insensitively", () => {
    expect(formatLocationAddress("51 Bishan Street 13\n#02-08\nSINGAPORE", "579799")).toBe(
      "51 Bishan Street 13, #02-08, SINGAPORE 579799",
    );
    expect(formatLocationAddress("51 Bishan Street 13\n#02-08\nsingapore", "579799")).toBe(
      "51 Bishan Street 13, #02-08, singapore 579799",
    );
  });

  it("treats a last line that ends with Singapore after other words the same way", () => {
    expect(formatLocationAddress("135 Jurong Gateway Road\n#04-317, Singapore", "600135")).toBe(
      "135 Jurong Gateway Road, #04-317, Singapore 600135",
    );
  });

  it("appends the postal code with a space when the last line is not Singapore", () => {
    expect(formatLocationAddress("38 Irrawaddy Road\n#05-21", "329563")).toBe(
      "38 Irrawaddy Road, #05-21 329563",
    );
  });

  it("appends the postal code to a single-line address", () => {
    expect(formatLocationAddress("1 Coleman Street #04-11", "179803")).toBe(
      "1 Coleman Street #04-11 179803",
    );
  });

  it("does not repeat a postal code already in the address", () => {
    expect(
      formatLocationAddress("101 Thomson Road\n#09-02 United Square\nSingapore 307591", "307591"),
    ).toBe("101 Thomson Road, #09-02 United Square, Singapore 307591");
  });

  it("does not repeat a postal code that appears on a line other than the last", () => {
    expect(formatLocationAddress("Singapore 307591\n101 Thomson Road", "307591")).toBe(
      "Singapore 307591, 101 Thomson Road",
    );
  });

  it("returns only the joined lines when there is no postal code", () => {
    const address = "190 Middle Road\n#14-07\nFortune Centre\nSingapore";
    const expected = "190 Middle Road, #14-07, Fortune Centre, Singapore";
    expect(formatLocationAddress(address)).toBe(expected);
    expect(formatLocationAddress(address, null)).toBe(expected);
    expect(formatLocationAddress(address, undefined)).toBe(expected);
  });

  it("returns only the joined lines when the postal code is blank", () => {
    expect(formatLocationAddress("38 Irrawaddy Road\n#05-21", "")).toBe(
      "38 Irrawaddy Road, #05-21",
    );
    expect(formatLocationAddress("38 Irrawaddy Road\n#05-21", "   ")).toBe(
      "38 Irrawaddy Road, #05-21",
    );
  });

  it("returns just the postal code when there are no address lines", () => {
    expect(formatLocationAddress(null, "188979")).toBe("188979");
    expect(formatLocationAddress(undefined, "188979")).toBe("188979");
    expect(formatLocationAddress("", "188979")).toBe("188979");
    expect(formatLocationAddress("  \n , \r\n  ", "188979")).toBe("188979");
  });

  it("returns an empty string for a null or undefined address with no postal code", () => {
    expect(formatLocationAddress(null)).toBe("");
    expect(formatLocationAddress(undefined)).toBe("");
    expect(formatLocationAddress(null, null)).toBe("");
    expect(formatLocationAddress(undefined, "")).toBe("");
  });
});

describe("locationMapsUrl", () => {
  const base = "https://www.google.com/maps/search/?api=1&query=";

  it("links Google Maps search to the formatted, URI-encoded address", () => {
    expect(
      locationMapsUrl("190 Middle Road\n#14-07\nFortune Centre\nSingapore", "188979"),
    ).toBe(
      `${base}190%20Middle%20Road%2C%20%2314-07%2C%20Fortune%20Centre%2C%20Singapore%20188979`,
    );
  });

  it("encodes exactly what formatLocationAddress returns", () => {
    const address = "38 Irrawaddy Road,\r\n#05-21\r\n";
    expect(locationMapsUrl(address, "329563")).toBe(
      base + encodeURIComponent(formatLocationAddress(address, "329563")),
    );
  });

  it("searches by postal code alone when there is no address", () => {
    expect(locationMapsUrl(null, "529541")).toBe(`${base}529541`);
  });

  it("is null when there is nothing to search for", () => {
    expect(locationMapsUrl(null)).toBeNull();
    expect(locationMapsUrl(undefined, null)).toBeNull();
    expect(locationMapsUrl("", "")).toBeNull();
    expect(locationMapsUrl("  \n , \n", "  ")).toBeNull();
  });
});

describe("planBranchSave", () => {
  const novena: BranchInput = {
    id: "aw-novena",
    branch_name: "Novena",
    address: "10 Sinaran Drive\n#08-12\nSingapore",
    postal_code: "307506",
  };
  const tampines: BranchInput = {
    id: "aw-tampines",
    branch_name: "Tampines",
    address: "8 Tampines Central 1\n#03-15\nSingapore",
    postal_code: "529541",
  };
  const jurong: BranchInput = {
    id: "aw-jurong",
    branch_name: "Jurong East",
    address: "135 Jurong Gateway Road\n#04-317\nSingapore",
    postal_code: "600135",
  };
  const punggolNew: BranchInput = {
    branch_name: "Punggol",
    address: "1 Punggol Drive\n#01-22\nSingapore",
    postal_code: "828629",
  };

  it("updates known ids, inserts items without an id and deletes branches left out", () => {
    const plan = planBranchSave(
      ["aw-novena", "aw-tampines", "aw-jurong"],
      [tampines, punggolNew, novena],
    );
    expect(plan.updates).toEqual([
      { ...tampines, position: 0 },
      { ...novena, position: 2 },
    ]);
    expect(plan.inserts).toEqual([{ ...punggolNew, position: 1 }]);
    expect(plan.deleteIds).toEqual(["aw-jurong"]);
    expect(plan.unknownIds).toEqual([]);
  });

  it("gives every update and insert its index in the incoming list as position", () => {
    const bedokNew: BranchInput = { branch_name: "Bedok", address: "311 New Upper Changi Road" };
    const plan = planBranchSave(["aw-jurong"], [punggolNew, jurong, bedokNew]);
    expect(plan.inserts.map((i) => [i.branch_name, i.position])).toEqual([
      ["Punggol", 0],
      ["Bedok", 2],
    ]);
    expect(plan.updates.map((u) => [u.id, u.position])).toEqual([["aw-jurong", 1]]);
  });

  it("numbers inserts 0, 1, 2 for a partner with no branches yet", () => {
    const a: BranchInput = { branch_name: "Novena", address: "10 Sinaran Drive" };
    const b: BranchInput = { branch_name: "Tampines", address: "8 Tampines Central 1" };
    const c: BranchInput = { branch_name: null, address: "135 Jurong Gateway Road" };
    const plan = planBranchSave([], [a, b, c]);
    expect(plan.inserts).toEqual([
      { ...a, position: 0 },
      { ...b, position: 1 },
      { ...c, position: 2 },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.unknownIds).toEqual([]);
  });

  it("reports an id that is not one of the partner's branches as unknown", () => {
    const foreign: BranchInput = {
      id: "hl-bishan",
      branch_name: "Bishan",
      address: "51 Bishan Street 13",
    };
    const plan = planBranchSave(["aw-novena"], [foreign, novena]);
    expect(plan.unknownIds).toEqual(["hl-bishan"]);
    expect(plan.updates.map((u) => u.id)).toEqual(["aw-novena"]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("counts unknown items when numbering positions", () => {
    const stale: BranchInput = { id: "aw-removed", branch_name: "Clementi", address: "3155 Commonwealth Avenue West" };
    const plan = planBranchSave(["aw-novena"], [stale, punggolNew, novena]);
    expect(plan.inserts).toEqual([{ ...punggolNew, position: 1 }]);
    expect(plan.updates).toEqual([{ ...novena, position: 2 }]);
    expect(plan.unknownIds).toEqual(["aw-removed"]);
  });

  it("updates only the first occurrence of a repeated id and reports the repeat", () => {
    const novenaAgain: BranchInput = { ...novena, branch_name: "Novena (level 9)" };
    const plan = planBranchSave(["aw-novena", "aw-tampines"], [novena, tampines, novenaAgain]);
    expect(plan.updates).toEqual([
      { ...novena, position: 0 },
      { ...tampines, position: 1 },
    ]);
    expect(plan.unknownIds).toEqual(["aw-novena"]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("lists deleted ids in existingIds order", () => {
    const plan = planBranchSave(
      ["aw-novena", "aw-tampines", "aw-jurong", "aw-punggol"],
      [jurong],
    );
    expect(plan.deleteIds).toEqual(["aw-novena", "aw-tampines", "aw-punggol"]);
    expect(plan.updates).toEqual([{ ...jurong, position: 0 }]);
  });

  it("deletes every existing branch when nothing is sent", () => {
    const plan = planBranchSave(["aw-novena", "aw-tampines"], []);
    expect(plan).toEqual({
      updates: [],
      inserts: [],
      deleteIds: ["aw-novena", "aw-tampines"],
      unknownIds: [],
    });
  });

  it("does not delete a branch kept by an update even if its id is also repeated", () => {
    const plan = planBranchSave(["aw-tampines"], [tampines, tampines]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toEqual([{ ...tampines, position: 0 }]);
    expect(plan.unknownIds).toEqual(["aw-tampines"]);
  });
});

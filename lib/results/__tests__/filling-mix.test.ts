import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAssignResult, canEditFillingMix } from "../admin/detail-prep";
import { draftMixVerdict, fillingMixMode } from "../filling-mix";

const draft = { status: null, order_id: null, product_type: null };

describe("fillingMixMode", () => {
  it("edits a Draft Result's mix ahead of the customer", () => {
    expect(fillingMixMode(draft)).toBe("draft");
    expect(fillingMixMode({ ...draft, product_type: "pillow" })).toBe("draft");
  });

  it("confirms a held Result's mix through the Assignment card", () => {
    expect(fillingMixMode({ ...draft, status: "held" })).toBe("assign");
  });

  it("only shows the mix once it is assigned or later", () => {
    for (const status of ["assigned", "accepted", "captured", "declined", "expired", "cancelled"]) {
      expect(fillingMixMode({ ...draft, status })).toBe("view");
    }
  });

  it("never edits a draft that is somehow already an Order", () => {
    expect(fillingMixMode({ ...draft, order_id: "ord_1" })).toBe("view");
  });
});

describe("draftMixVerdict", () => {
  it("allows an Mpillow Draft Result", () => {
    expect(draftMixVerdict(draft).ok).toBe(true);
  });

  it("refuses once the customer has submitted, pointing at Save assignment", () => {
    const verdict = draftMixVerdict({ ...draft, status: "held" });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/Save assignment/);
  });

  it("refuses a bolster — the Mbolster configurator creates no Draft Result", () => {
    expect(draftMixVerdict({ ...draft, product_type: "bolster" }).ok).toBe(false);
  });

  it("refuses once an Order exists", () => {
    expect(draftMixVerdict({ ...draft, order_id: "ord_1" }).ok).toBe(false);
  });
});

describe("the page gates", () => {
  it("loads the template list and Items for a draft as well as a held Result", () => {
    expect(canEditFillingMix({ status: null, order_id: null, product_type: null })).toBe(true);
    expect(canEditFillingMix({ status: "held", product_type: "pillow" })).toBe(true);
    expect(canEditFillingMix({ status: "assigned", product_type: "pillow" })).toBe(false);
  });

  it("leaves Assign itself to held Results", () => {
    expect(canAssignResult({ status: null })).toBe(false);
    expect(canAssignResult({ status: "held" })).toBe(true);
  });
});

describe("the draft mix route", () => {
  const src = readFileSync("app/api/results/[id]/filling-mix/route.ts", "utf8");

  it("is Staff-only with the results permission, for reading and writing", () => {
    expect(src.match(/requireAdmin\("results"\)/g)?.length).toBe(2);
  });

  it("shares the one draft rule rather than restating it", () => {
    expect(src).toMatch(/draftMixVerdict\(row\)/);
  });

  it("moves nothing but the snapshot: no status, price, hold or email", () => {
    expect(src.match(/\.update\(/g)?.length).toBe(1);
    expect(src).toMatch(
      /\.update\(\{ filling_fingerprint: snapshot\.fingerprint, filling_template_id: snapshot\.fillingTemplateId \}\)/,
    );
    for (const column of ["final_amount", "authorized_amount", "payment_intent_id", "assigned_at", "suggested_size"]) {
      expect(src).not.toContain(column);
    }
    expect(src).not.toMatch(/sendEmail|getEmailTransport|send\(/);
  });

  it("checks-and-sets on the draft state before touching the placements", () => {
    const cas = src.indexOf('.is("status", null)');
    expect(cas).toBeGreaterThan(-1);
    expect(src).toContain('.is("order_id", null)');
    expect(cas).toBeLessThan(src.indexOf('.from("result_filling_placements").delete()'));
  });

  it("keeps the template id only on a server-confirmed exact match", () => {
    expect(src).toMatch(/buildFillingSnapshot\(\{ placements, claimedTemplateId, templatePlacements \}\)/);
    expect(src).toMatch(/filling_template_id: snapshot\.fillingTemplateId/);
  });

  it("validates the mix at the tier it is drawn for", () => {
    expect(src).toMatch(/validatePillowPlacements\(placements, kinds\.byId, \{ tier: input\.tier \}\)/);
  });
});

describe("the customer's submit keeps a mix Staff saved on the draft", () => {
  const hold = readFileSync("app/api/results/hold/route.ts", "utf8");

  it("writes the snapshot columns only when the configurator sent a mix", () => {
    expect(hold).toMatch(/\.\.\.\(fillingSnapshot\s*\?\s*\{\s*filling_fingerprint:/);
  });

  it("replaces the Result's pillow placements only when the configurator sent a mix", () => {
    const guard = hold.indexOf("if (fillingSnapshot) {");
    const replace = hold.indexOf(".from(snapshotTable)\n      .delete()");
    expect(guard).toBeGreaterThan(-1);
    expect(replace).toBeGreaterThan(guard);
    expect(hold.slice(guard, replace)).not.toMatch(/\n  \}\n/);
  });
});

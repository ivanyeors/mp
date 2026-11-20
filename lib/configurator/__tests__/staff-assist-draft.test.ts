import { describe, expect, it } from "vitest";

import {
  asSizeTier,
  bolsterAssistDraft,
  parseBolsterAssistDraft,
  parsePillowAssistDraft,
  pillowAssistDraft,
  restoreBolsterAssist,
  restorePillowAssist,
} from "@/lib/configurator/staff-assist-draft";
import {
  parseHoldCancelDraft,
  readHoldCancelDraft,
  writeHoldCancelDraft,
  type HoldCancelDraft,
} from "@/lib/configurator/hold-cancel-restore";
import { parsePairedHandoff, reanchorPairedHandoff, type PairedHandoff } from "@/lib/configurator/paired-mbolster";
import type { BolsterPlacement, PillowPlacement } from "@/lib/spatial-fillings/core";

const stored = <T,>(value: T): unknown => JSON.parse(JSON.stringify(value));

const mix: PillowPlacement[] = [
  { section: "left", subSection: "front", slot: 1, itemId: 11 },
  { section: "left", subSection: "front", slot: 2, itemId: 12, row: 1, insertOrder: 2 },
  { section: "center", subSection: "middle", slot: 1, itemId: 13, offsetXMm: -4, offsetYMm: 6 },
];
const template = { id: 7, placements: mix.slice(0, 2) };

const bolsterMix: BolsterPlacement[] = [
  { slot: 1, itemId: 21 },
  { slot: 2, itemId: 22 },
];

describe("Mpillow Staff session", () => {
  it("comes back from storage as the size×tier, mix and template Staff left", () => {
    const draft = parsePillowAssistDraft(stored(pillowAssistDraft({ size: "L", tier: "basic" }, mix, template)));
    expect(draft).not.toBeNull();
    const restored = restorePillowAssist(draft!);
    expect(restored.sizeTier).toEqual({ size: "L", tier: "basic" });
    expect(restored.placements).toEqual(mix);
    expect(restored.loadedTemplate).toEqual(template);
  });

  it("keeps an emptied pillow and a mix built from no template", () => {
    const emptied = parsePillowAssistDraft(stored(pillowAssistDraft({ size: "M", tier: "premium" }, [], template)));
    expect(restorePillowAssist(emptied!).placements).toEqual([]);
    expect(restorePillowAssist(emptied!).loadedTemplate).toEqual(template);
    const scratch = parsePillowAssistDraft(stored(pillowAssistDraft({ size: "M", tier: "premium" }, mix, null)));
    expect(restorePillowAssist(scratch!).loadedTemplate).toBeNull();
  });

  it("refuses anything it did not write", () => {
    const good = stored(pillowAssistDraft({ size: "S", tier: "premium" }, mix, template)) as Record<string, unknown>;
    expect(parsePillowAssistDraft({ ...good, size: "XXL" })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, tier: "gold" })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, placements: "nope" })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, placements: [{ section: "top", sub_section: "front", slot: 1, item_id: 1 }] })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, placements: [{ section: "left", sub_section: "front", slot: 0, item_id: 1 }] })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, loadedTemplate: { id: "7", placements: [] } })).toBeNull();
    expect(parsePillowAssistDraft({ ...good, loadedTemplate: undefined })).toBeNull();
    expect(parsePillowAssistDraft(null)).toBeNull();
  });

  it("reads a size×tier off the preview only when Staff could have picked it", () => {
    expect(asSizeTier("XL", "premium")).toEqual({ size: "XL", tier: "premium" });
    expect(asSizeTier(null, "premium")).toBeNull();
    expect(asSizeTier("XL", undefined)).toBeNull();
    expect(asSizeTier("XXL", "basic")).toBeNull();
  });
});

describe("Mbolster Staff session", () => {
  it("comes back for the length it was built for, and only that one", () => {
    const draft = parseBolsterAssistDraft(stored(bolsterAssistDraft("medium", bolsterMix, { id: 3, placements: bolsterMix })));
    expect(restoreBolsterAssist(draft, "medium")).toEqual({
      placements: bolsterMix,
      loadedTemplate: { id: 3, placements: bolsterMix },
    });
    expect(restoreBolsterAssist(draft, "long")).toBeNull();
    expect(restoreBolsterAssist(null, "medium")).toBeNull();
  });

  it("refuses anything it did not write", () => {
    expect(parseBolsterAssistDraft({ length: "", placements: [], loadedTemplate: null })).toBeNull();
    expect(parseBolsterAssistDraft({ length: "short", placements: [{ slot: 1 }], loadedTemplate: null })).toBeNull();
  });
});

describe("the Mpillow's preview draft carries the Staff session", () => {
  const draft: HoldCancelDraft = {
    v: 1,
    surface: "mp-full",
    step: "preview",
    responseId: "r1",
    selections: {
      selectedCover: 1,
      selectedCase: 2,
      selectedAddons: [],
      selectedShippingId: "",
      holdEmail: "",
      holdPhone: "",
      discoverySource: "",
      discoverySourceOther: "",
      notes: "",
      holdAddress: { recipient: "", line1: "", line2: "", city: "", postal_code: "", country: "SG" },
    },
    staffAssist: pillowAssistDraft({ size: "XS", tier: "premium" }, mix, template),
  };

  it("through a reload", () => {
    const map = new Map<string, string>();
    writeHoldCancelDraft({ setItem: (k, v) => void map.set(k, v) }, draft);
    const read = readHoldCancelDraft({ getItem: (k) => map.get(k) ?? null }, "mp-full");
    expect(read?.staffAssist).toEqual(draft.staffAssist);
  });

  it("drops a broken session without losing the rest of the draft", () => {
    const broken = { ...(stored(draft) as Record<string, unknown>), staffAssist: { size: "XS" } };
    const parsed = parseHoldCancelDraft(broken);
    expect(parsed?.selections.selectedCover).toBe(1);
    expect(parsed && "staffAssist" in parsed).toBe(false);
  });
});

describe("the Paired build hand-off carries the Mbolster's Staff session", () => {
  const handoff: PairedHandoff = {
    v: 2,
    anchorId: "a1",
    companionId: "c1",
    sleepPosition: "side",
    reason: "",
    configPath: "/mp-config",
    pillow: { label: "Mpillow", ballpark: null, currency: "SGD" },
    bolster: { heightCm: "170", caseId: 9, assist: bolsterAssistDraft("long", bolsterMix, null) },
  };

  it("across the trip to the Mpillow page and back", () => {
    const parsed = parsePairedHandoff(stored(handoff));
    expect(parsed?.bolster).toEqual(handoff.bolster);
    expect(reanchorPairedHandoff(parsed!, "a2", () => "c2").bolster).toEqual(handoff.bolster);
  });

  it("drops a broken session and keeps step 2's other answers", () => {
    const broken = stored({ ...handoff, bolster: { ...handoff.bolster, assist: { length: "long" } } });
    expect(parsePairedHandoff(broken)?.bolster).toEqual({ heightCm: "170", caseId: 9 });
  });
});

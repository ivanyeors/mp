import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { buildPillowSheet, type PillowSheet } from "@/lib/customer-pillow/sheet";
import type { OwnPillowView } from "@/lib/customer-pillow/view";
import { FITTING_MEASUREMENTS, type FittingAnswersView } from "@/lib/fitting-import/view";
import { pillowSheetDocument, registerSheetFonts, type SheetArt, type SheetImage } from "../pillow-sheet-document";

const PUBLIC = join(process.cwd(), "public");

async function png(input: Buffer | { width: number; height: number }, width: number): Promise<SheetImage> {
  const source = Buffer.isBuffer(input)
    ? sharp(input)
    : sharp({ create: { width: input.width, height: input.height, channels: 4, background: "#020617" } });
  const out = await source.resize({ width }).png().toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${out.data.toString("base64")}`, width: out.info.width, height: out.info.height };
}

const cell = (section: string, sub_section: string, slot: number, item_id: number, insert_order: number | null, row_index: number | null = null) => ({
  section,
  sub_section,
  slot,
  item_id,
  row_index,
  insert_order,
  offset_x_mm: null,
  offset_y_mm: null,
});

const pillow: OwnPillowView = {
  source: "linked",
  size: "S",
  name: "Type-12",
  orderNumber: null,
  date: "2026-11-21T03:00:00.000Z",
  readjusted: true,
  placements: [
    cell("left", "front", 1, 1, 1),
    cell("left", "middle", 1, 2, 2),
    cell("left", "back", 1, 3, 3),
    cell("left", "back", 2, 4, 4, 1),
    cell("center", "front", 1, 4, 1),
    cell("center", "middle", 1, 5, 2),
    cell("center", "back", 1, 6, 3),
    cell("right", "front", 1, 1, 1),
    cell("right", "middle", 1, 2, 2),
    cell("right", "back", 1, 3, 3),
    cell("right", "back", 2, 4, 4, 1),
  ],
  items: [
    { id: 1, name: "6D Corner Small", subtype: "6D Corner", size: "S", category: "fillings" },
    { id: 2, name: "6D Large", subtype: "6D", size: "L", category: "fillings" },
    { id: 3, name: "6D Fold Small", subtype: "6D Fold", size: "S", category: "fillings" },
    { id: 4, name: "6D Small", subtype: "6D", size: "S", category: "fillings" },
    { id: 5, name: "6D+ Small", subtype: "6D+", size: "S", category: "fillings" },
    { id: 6, name: "Cervical neck support", subtype: null, size: "L", category: "accessories" },
  ],
  colorOverrides: [],
  dimensionOverrides: undefined,
};

const fitting: FittingAnswersView = {
  id: "f-1",
  fittedAt: "2026-10-15T02:00:00.000Z",
  shoulderLengthIn: 15.5,
  neckToBackIn: 2.75,
  headToBackIn: 3.5,
  neckLengthIn: 4.25,
  recommendedSize: "S",
  configurationType: "T12",
  profileSide: "S-SN",
  sleeperType: "Side and back",
  sleepSymptoms: [],
  bloodPressure: null,
  acidReflux: null,
  earDiscomfortSideSleep: null,
  bedFirmness: null,
  usesBolster: null,
  ageGroup: null,
  gender: null,
  discoverySource: null,
  referredBy: null,
  servicedBy: "Ivan",
  notes: null,
  otherAnswers: [],
};

const sheetFor = (fittings: FittingAnswersView[], over: Partial<OwnPillowView> = {}): PillowSheet =>
  buildPillowSheet({
    pillow: { ...pillow, ...over },
    customer: { first_name: "Mei Ling", last_name: "Tan" },
    fittings,
    origin: "https://mpillow.com",
    now: new Date("2026-11-21T04:00:00.000Z"),
  });

const render = (sheet: PillowSheet, art: SheetArt) => renderToBuffer(pillowSheetDocument(sheet, art));
const pageCount = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;

let art: SheetArt;

beforeAll(async () => {
  registerSheetFonts((weight) => join(PUBLIC, "fonts", "figtree", `figtree-${weight}.woff`));
  const icons = await Promise.all(
    FITTING_MEASUREMENTS.map(async (m) => [m.icon, await png(readFileSync(join(PUBLIC, m.icon.slice(1))), 160)] as const),
  );
  art = {
    logo: await png(readFileSync(join(PUBLIC, "mpillow_logo_2026.png")), 192),
    top: await png({ width: 1328, height: 748 }, 1328),
    cuts: {
      left: await png({ width: 1328, height: 440 }, 1328),
      center: await png({ width: 1328, height: 440 }, 1328),
      right: await png({ width: 1328, height: 440 }, 1328),
    },
    icons: Object.fromEntries(icons),
  };
});

describe("pillowSheetDocument", () => {
  it("makes a two-page PDF in Figtree that links to re-adjustment, WhatsApp and care", async () => {
    const pdf = await render(sheetFor([fitting]), art);
    if (process.env.PILLOW_SHEET_OUT) writeFileSync(process.env.PILLOW_SHEET_OUT, pdf);
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(pageCount(pdf)).toBe(2);
    expect(raw).toMatch(/\/FontName \/[A-Z]{6}\+Figtree/);
    for (const uri of ["https://mpillow.com/appointments?type=readjustment", "https://mpillow.com/mp-care", "https://wa.me/"]) {
      expect(raw).toContain(`/URI (${uri}`);
    }
    expect(pdf.length).toBeLessThan(400_000);
  }, 30_000);

  it("still makes the two pages with no fitting, an empty Section and no drawings", async () => {
    const sheet = sheetFor([], { placements: pillow.placements.filter((p) => p.section !== "right"), name: null });
    const pdf = await render(sheet, { ...art, top: null, cuts: {} });
    expect(pageCount(pdf)).toBe(2);
  }, 30_000);
});

import { sectionInsertOrder } from "@/lib/configurator/staff-assist";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { FITTING_MEASUREMENTS, inches, type FittingAnswersView } from "@/lib/fitting-import/view";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { flattenToPackList, rowsToPillowPlacements, SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import { fillingDescriptor, fillingLabel } from "@/lib/spatial-fillings/filling-groups";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import type { OwnPillowView } from "./view";

export const SHEET_ART_BACKGROUND = "#020617";

export type SheetFilling = { label: string; color: string; count: number };
export type SheetStep = { label: string; color: string; where: string };
export type SheetSection = { section: Section; steps: SheetStep[]; ordered: boolean };
export type SheetMeasurement = { letter: string; label: string; value: string; icon: string };
export type SheetLink = { href: string; text: string };

export type PillowSheet = {
  fileName: string;
  customerName: string | null;
  preparedOn: string;
  pillowName: string;
  size: string | null;
  pieces: number;
  story: string;
  fillings: SheetFilling[];
  sections: SheetSection[];
  fitting: { fittedOn: string; measurements: SheetMeasurement[]; facts: [string, string][] } | null;
  links: { care: SheetLink; readjust: SheetLink; whatsapp: SheetLink };
};

export type PillowSheetInput = {
  pillow: OwnPillowView;
  customer: { first_name: string | null; last_name: string | null };
  fittings: readonly FittingAnswersView[];
  origin: string;
  now: Date;
};

export const longDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore" });

function story(p: OwnPillowView): string {
  const on = p.date ? ` on ${longDate(p.date)}` : "";
  if (p.source === "order") return `What's inside the pillow we built${p.orderNumber ? ` for order ${p.orderNumber}` : ""}${on}, section by section.`;
  if (p.source === "fitting") return `What's inside your pillow, section by section, from your in-store fitting${on}.`;
  if (p.readjusted) return `What's inside your pillow, section by section, as we re-adjusted it${on}.`;
  return "What's inside your pillow, section by section, as our team recorded it.";
}

function colorFor(descriptor: string, overrides: readonly ColorOverrideRow[]): string {
  const visual = fillingVisual(descriptor);
  return overrides.find((o) => fillingVisual(o.subtype).cssVar === visual.cssVar)?.color ?? visual.defaultColor;
}

const PRINTABLE = /^[ -ÿ’]+$/;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sectionSteps(placements: PillowPlacement[], section: Section, describe: (itemId: number) => { label: string; color: string }): SheetSection {
  const steps = sectionInsertOrder(placements, section);
  const stacked = new Set(steps.filter((p) => (p.row ?? 0) > 0).map((p) => p.subSection));
  return {
    section,
    ordered: steps.some((p) => p.insertOrder != null),
    steps: steps.map((p) => ({
      ...describe(p.itemId),
      where: capitalise(stacked.has(p.subSection) ? `${p.subSection} · layer ${(p.row ?? 0) + 1}` : p.subSection),
    })),
  };
}

function latestFitting(fittings: readonly FittingAnswersView[]): PillowSheet["fitting"] {
  const sorted = [...fittings].sort((a, b) => Date.parse(b.fittedAt) - Date.parse(a.fittedAt));
  for (const f of sorted) {
    const measured = FITTING_MEASUREMENTS.some(({ key }) => f[key] !== null);
    const facts: [string, string][] = [];
    for (const [label, value] of [
      ["Recommended size", f.recommendedSize],
      ["Configuration type", f.configurationType],
      ["Profile side", f.profileSide],
      ["Sleeper", f.sleeperType],
    ] as const) {
      if (value?.trim()) facts.push([label, value.trim()]);
    }
    if (!measured && facts.length === 0) continue;
    return {
      fittedOn: longDate(f.fittedAt),
      measurements: measured
        ? FITTING_MEASUREMENTS.map(({ letter, label, key, icon }) => ({ letter, label, icon, value: inches(f[key]) }))
        : [],
      facts,
    };
  }
  return null;
}

function fileSlug(name: string | null): string {
  const slug = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `mpillow-guide-${slug}.pdf` : "mpillow-guide.pdf";
}

export function buildPillowSheet({ pillow, customer, fittings, origin, now }: PillowSheetInput): PillowSheet {
  const placements = rowsToPillowPlacements(pillow.placements);
  const items = new Map(pillow.items.map((i) => [i.id, i]));
  const describe = (itemId: number) => {
    const item = items.get(itemId);
    if (!item) return { label: `Item #${itemId}`, color: colorFor("", pillow.colorOverrides) };
    return { label: fillingLabel(item), color: colorFor(fillingDescriptor(item), pillow.colorOverrides) };
  };
  const fullName = [customer.first_name, customer.last_name].map((s) => s?.trim()).filter(Boolean).join(" ");
  // ponytail: the PDF embeds Figtree's Latin subset only, so a name in another script is left off
  // rather than printed as empty boxes; register a Noto Sans SC fallback font to print it.
  const customerName = PRINTABLE.test(fullName) ? fullName : null;
  const site = origin.replace(/\/$/, "");
  const host = new URL(site).host.replace(/^www\./, "");
  return {
    fileName: fileSlug(customerName),
    customerName,
    preparedOn: longDate(now),
    pillowName: pillow.name ?? "Custom mix",
    size: pillow.size,
    pieces: placements.length,
    story: story(pillow),
    fillings: flattenToPackList(placements).map((line) => ({ ...describe(line.item_id), count: line.count })),
    sections: SECTIONS.map((section) => sectionSteps(placements, section, describe)),
    fitting: latestFitting(fittings),
    links: {
      care: { href: `${site}/mp-care`, text: `${host}/mp-care` },
      readjust: { href: `${site}/appointments?type=readjustment`, text: `${host}/appointments` },
      whatsapp: { href: SUPPORT_WHATSAPP_URL, text: SUPPORT_WHATSAPP_DISPLAY },
    },
  };
}

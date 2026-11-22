export type PriceDraftRow = { costPrice: string; msrp: string; compareAt: string };
export type PriceDrafts = Record<string, PriceDraftRow>;
export type PriceBaseRow = { cost: number | null; msrp: number | null; compareAt: number | null };
export type PriceBases = Record<string, PriceBaseRow>;
export type DraftField = keyof PriceDraftRow;

export type SavedChangeUnderDraft = { key: string; field: DraftField; savedCents: number | null };

export const DRAFT_FIELDS: readonly DraftField[] = ["costPrice", "msrp", "compareAt"];

export const BASE_FIELD: Record<DraftField, keyof PriceBaseRow> = {
  costPrice: "cost",
  msrp: "msrp",
  compareAt: "compareAt",
};

const NO_BASE: PriceBaseRow = { cost: null, msrp: null, compareAt: null };

export const parseToCents = (value: string): number | null => {
  if (!value || value === ".") return null;
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  if (normalized === "") return null;
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
};

export const isFieldDirty = (
  draft: PriceDraftRow | undefined,
  base: PriceBaseRow | undefined,
  field: DraftField,
): boolean => parseToCents(draft?.[field] ?? "") !== (base?.[BASE_FIELD[field]] ?? null);

const changeId = ({ key, field }: { key: string; field: DraftField }) => JSON.stringify([key, field]);

export function keepDrafts(
  mine: { drafts: PriceDrafts; bases: PriceBases; savedChanges: readonly SavedChangeUnderDraft[] },
  fresh: { drafts: PriceDrafts; bases: PriceBases },
  { rebase }: { rebase: boolean },
): { drafts: PriceDrafts; bases: PriceBases; savedChanges: SavedChangeUnderDraft[] } {
  const changedBefore = new Set(mine.savedChanges.map(changeId));
  const drafts: PriceDrafts = {};
  const bases: PriceBases = {};
  const savedChanges: SavedChangeUnderDraft[] = [];
  for (const [key, freshRow] of Object.entries(fresh.drafts)) {
    const freshBase = fresh.bases[key] ?? NO_BASE;
    const myDraft = mine.drafts[key];
    const myBase = mine.bases[key];
    const row = { ...freshRow };
    const base = { ...freshBase };
    if (myDraft && myBase) {
      for (const field of DRAFT_FIELDS) {
        if (!isFieldDirty(myDraft, myBase, field)) continue;
        row[field] = myDraft[field];
        const baseField = BASE_FIELD[field];
        if (parseToCents(myDraft[field]) === freshBase[baseField]) continue;
        if (!rebase) base[baseField] = myBase[baseField];
        if (freshBase[baseField] !== myBase[baseField] || changedBefore.has(changeId({ key, field }))) {
          savedChanges.push({ key, field, savedCents: freshBase[baseField] });
        }
      }
    }
    drafts[key] = row;
    bases[key] = base;
  }
  return { drafts, bases, savedChanges };
}

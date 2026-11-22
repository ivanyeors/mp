export type PriceDraftRow = { costPrice: string; msrp: string; compareAt: string };
export type PriceDrafts = Record<string, PriceDraftRow>;
export type PriceBaseRow = { cost: number | null; msrp: number | null; compareAt: number | null };
export type PriceBases = Record<string, PriceBaseRow>;
export type DraftField = keyof PriceDraftRow;

export type SavedChangeUnderDraft = { key: string; field: DraftField };

export type PriceEdits = {
  drafts: PriceDrafts;
  stored: PriceBases;
  conflictBases: PriceBases;
  savedChanges: SavedChangeUnderDraft[];
};

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
  stored: PriceBaseRow | undefined,
  field: DraftField,
): boolean => parseToCents(draft?.[field] ?? "") !== (stored?.[BASE_FIELD[field]] ?? null);

const changeId = ({ key, field }: SavedChangeUnderDraft) => JSON.stringify([key, field]);

export function keepDrafts(
  mine: PriceEdits,
  fresh: { drafts: PriceDrafts; stored: PriceBases },
  { rebase }: { rebase: boolean },
): PriceEdits {
  const changedBefore = new Set(mine.savedChanges.map(changeId));
  const next: PriceEdits = { drafts: {}, stored: {}, conflictBases: {}, savedChanges: [] };
  for (const [key, freshRow] of Object.entries(fresh.drafts)) {
    const freshStored = fresh.stored[key] ?? NO_BASE;
    const myDraft = mine.drafts[key];
    const myStored = mine.stored[key];
    const myBase = mine.conflictBases[key] ?? myStored;
    const row = { ...freshRow };
    const conflictBase = { ...freshStored };
    if (myDraft && myStored && myBase) {
      for (const field of DRAFT_FIELDS) {
        if (!isFieldDirty(myDraft, myStored, field)) continue;
        row[field] = myDraft[field];
        const baseField = BASE_FIELD[field];
        if (parseToCents(myDraft[field]) === freshStored[baseField]) continue;
        if (!rebase) conflictBase[baseField] = myBase[baseField];
        if (freshStored[baseField] !== myBase[baseField] || changedBefore.has(changeId({ key, field }))) {
          next.savedChanges.push({ key, field });
        }
      }
    }
    next.drafts[key] = row;
    next.stored[key] = { ...freshStored };
    next.conflictBases[key] = conflictBase;
  }
  return next;
}

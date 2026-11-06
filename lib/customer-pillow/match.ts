/**
 * Which Filling Template a **Fitting record** describes (ADR 0042 j). Pure and
 * shared by the server reader and the Customer page.
 *
 * The old Google Form recorded a pillow in the studio's own codes: a size
 * (`S`), a configuration type (`T12`, `8A`, `T6A`) and a profile side
 * (`S-LN`, `M-SN`: the size again, then long or short neck). The catalog's
 * Filling Templates carry the same types in their names — `Type-12`,
 * `Type-8a`, `Type-9A (Short Neck)` — each serving one or more sizes (its
 * **Size membership**). So a fitting is read as: the template whose type is
 * the fitting's, in the fitting's neck variant, serving the fitting's size.
 *
 * Derived on every read and never stored, so a template renamed, added or
 * given another size is picked up at once. When no template is exactly that,
 * the nearest is taken and the result says what it gave up, so the Customer
 * page can say so instead of presenting a guess as the record.
 */
import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";

export type PillowSizeKey = (typeof PILLOW_TEMPLATE_KEYS)[number];

/** An active pillow Filling Template and the sizes it serves. */
export type MatchableTemplate = { id: number; name: string; keys: readonly string[] };

/** The three answers on a Fitting record that describe the pillow. */
export type FittingPillowAnswers = {
  recommendedSize: string | null;
  configurationType: string | null;
  profileSide: string | null;
};

export type FittingTemplateMatch = {
  /** The pillow size the fitting recorded, read as a catalog size; null when it recorded none. */
  size: PillowSizeKey | null;
  /** The configuration type as the catalog writes it (`12`, `8A`); null when the fitting has none. */
  code: string | null;
  /** The profile side's neck: `short` for `-SN`, `long` for `-LN`, null when it says neither. */
  neck: "short" | "long" | null;
  /** The template, or null when no active template has this type. */
  template: MatchableTemplate | null;
  /** The template does not serve `size`: the nearest size's template of this type was taken. */
  otherSize: boolean;
  /** The fitting recorded a neck whose variant has no template of this type: the other variant was taken. */
  otherNeck: boolean;
};

const SIZES: readonly string[] = PILLOW_TEMPLATE_KEYS;

/** `S`, `xs`, ` XL ` → a catalog size; anything else (`Returned`, `?`) → null. */
export function pillowSizeKey(value: string | null | undefined): PillowSizeKey | null {
  const v = (value ?? "").trim().toUpperCase();
  return SIZES.includes(v) ? (v as PillowSizeKey) : null;
}

/** `T12`, `12`, `t8a`, `Type-8A` → `12`, `12`, `8A`, `8A`; `-` or blank → null. */
export function fittingTypeCode(configurationType: string | null | undefined): string | null {
  const m = /^\s*(?:T|Type[-\s]?)?\s*(\d{1,2})\s*([a-z])?\s*$/i.exec(configurationType ?? "");
  return m ? `${Number(m[1])}${(m[2] ?? "").toUpperCase()}` : null;
}

/** `Type-11a (Short Neck)` → `{ code: "11A", shortNeck: true }`; a name not in that form → null. */
export function templateType(name: string): { code: string; shortNeck: boolean } | null {
  const m = /^\s*Type[-\s]?(\d{1,2})\s*([a-z])?\s*(\(\s*short\s*neck\s*\))?\s*$/i.exec(name);
  return m ? { code: `${Number(m[1])}${(m[2] ?? "").toUpperCase()}`, shortNeck: Boolean(m[3]) } : null;
}

/** The profile side's neck: `S-SN` / `m-sn` → short, `S-LN` → long, otherwise null. */
export function fittingNeck(profileSide: string | null | undefined): "short" | "long" | null {
  const m = /-\s*([SL])N\s*$/i.exec(profileSide ?? "");
  if (!m) return null;
  return m[1].toUpperCase() === "S" ? "short" : "long";
}

/** The recorded size; when it is not a size, the one the profile side starts with (`S-LN`). */
export function fittingSize(f: Pick<FittingPillowAnswers, "recommendedSize" | "profileSide">): PillowSizeKey | null {
  return pillowSizeKey(f.recommendedSize) ?? pillowSizeKey(/^\s*([a-z]{1,2})\s*-/i.exec(f.profileSide ?? "")?.[1]);
}

/** How far a template's nearest size is from `target`, in steps along XS…XL. */
function sizeDistance(t: MatchableTemplate, target: number): number {
  const steps = t.keys.map((k) => SIZES.indexOf(k)).filter((i) => i >= 0).map((i) => Math.abs(i - target));
  return steps.length ? Math.min(...steps) : Number.POSITIVE_INFINITY;
}

/**
 * The Filling Template a fitting describes. Among the templates of the
 * fitting's type: its neck variant first (a long neck, or none recorded, is the
 * standard one), then one serving its size, else the nearest size (M when no
 * size was recorded, the reference Size), then the lowest id.
 */
export function matchFittingTemplate(
  f: FittingPillowAnswers,
  templates: readonly MatchableTemplate[],
): FittingTemplateMatch {
  const size = fittingSize(f);
  const code = fittingTypeCode(f.configurationType);
  const neck = fittingNeck(f.profileSide);
  const none = { size, code, neck, template: null, otherSize: false, otherNeck: false };
  if (!code) return none;

  const ofType = templates.filter((t) => templateType(t.name)?.code === code);
  if (!ofType.length) return none;
  const wantShort = neck === "short";
  const sameNeck = ofType.filter((t) => templateType(t.name)!.shortNeck === wantShort);
  const pool = sameNeck.length ? sameNeck : ofType;

  const target = SIZES.indexOf(size ?? "M");
  const [template] = [...pool].sort((a, b) => sizeDistance(a, target) - sizeDistance(b, target) || a.id - b.id);
  return {
    size,
    code,
    neck,
    template,
    otherSize: size !== null && !template.keys.includes(size),
    otherNeck: neck !== null && sameNeck.length === 0,
  };
}

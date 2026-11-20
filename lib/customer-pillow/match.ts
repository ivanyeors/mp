import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";

export type PillowSizeKey = (typeof PILLOW_TEMPLATE_KEYS)[number];

export type MatchableTemplate = { id: number; name: string; keys: readonly string[] };

export type FittingPillowAnswers = {
  recommendedSize: string | null;
  configurationType: string | null;
  profileSide: string | null;
};

export type FittingTemplateMatch = {
  size: PillowSizeKey | null;
  code: string | null;
  neck: "short" | "long" | null;
  template: MatchableTemplate | null;
  otherSize: boolean;
  otherNeck: boolean;
};

const SIZES: readonly string[] = PILLOW_TEMPLATE_KEYS;

export function pillowSizeKey(value: string | null | undefined): PillowSizeKey | null {
  const v = (value ?? "").trim().toUpperCase();
  return SIZES.includes(v) ? (v as PillowSizeKey) : null;
}

export function fittingTypeCode(configurationType: string | null | undefined): string | null {
  const m = /^\s*(?:T|Type[-\s]?)?\s*(\d{1,2})\s*([a-z])?\s*$/i.exec(configurationType ?? "");
  return m ? `${Number(m[1])}${(m[2] ?? "").toUpperCase()}` : null;
}

export function templateType(name: string): { code: string; shortNeck: boolean } | null {
  const m = /^\s*Type[-\s]?(\d{1,2})\s*([a-z])?\s*(\(\s*short\s*neck\s*\))?\s*$/i.exec(name);
  return m ? { code: `${Number(m[1])}${(m[2] ?? "").toUpperCase()}`, shortNeck: Boolean(m[3]) } : null;
}

export function fittingNeck(profileSide: string | null | undefined): "short" | "long" | null {
  const m = /-\s*([SL])N\s*$/i.exec(profileSide ?? "");
  if (!m) return null;
  return m[1].toUpperCase() === "S" ? "short" : "long";
}

export function fittingSize(f: Pick<FittingPillowAnswers, "recommendedSize" | "profileSide">): PillowSizeKey | null {
  return pillowSizeKey(f.recommendedSize) ?? pillowSizeKey(/^\s*([a-z]{1,2})\s*-/i.exec(f.profileSide ?? "")?.[1]);
}

function sizeDistance(t: MatchableTemplate, target: number): number {
  const steps = t.keys.map((k) => SIZES.indexOf(k)).filter((i) => i >= 0).map((i) => Math.abs(i - target));
  return steps.length ? Math.min(...steps) : Number.POSITIVE_INFINITY;
}

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

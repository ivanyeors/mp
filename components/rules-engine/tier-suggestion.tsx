"use client";

export type TierSuggestionProps = {
  tier: "basic" | "premium";
  /** Optional reason fragment, e.g. "acid reflux" */
  because?: string | null;
};

const TIER_LABELS: Record<TierSuggestionProps["tier"], string> = {
  basic: "Basic",
  premium: "Premium",
};

export function tierSuggestionCopy(
  tier: TierSuggestionProps["tier"],
  because?: string | null,
): string {
  const label = TIER_LABELS[tier];
  const fragment = because?.trim();
  return fragment
    ? `Based on ${fragment} we'd recommend ${label}`
    : `We'd recommend ${label}`;
}

/** Advisory tier copy only — never implies product or price change. */
export function TierSuggestion({ tier, because }: TierSuggestionProps) {
  return (
    <p className="max-w-sm text-center text-[11px] italic leading-snug text-white/70">
      {tierSuggestionCopy(tier, because)}
    </p>
  );
}

export { TIER_LABELS };

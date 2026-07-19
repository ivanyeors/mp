/** Pain-area multi-select: "none" is exclusive with every other chip. */

export const PAIN_AREA_NONE = "none";

export const PAIN_AREA_OPTIONS = [
  { value: PAIN_AREA_NONE, label: "None" },
  { value: "neck", label: "Neck pain" },
  { value: "shoulder", label: "Shoulder pain" },
  { value: "lower-back", label: "Lower Back pain" },
  { value: "sleep-apnea", label: "Sleep Apnea" },
  { value: "bad-sleep-quality", label: "Bad Sleep Quality" },
] as const;

/** Toggle one chip; selecting None clears others, selecting any other clears None. */
export function togglePainArea(selected: string[], value: string): string[] {
  const has = selected.includes(value);
  if (value === PAIN_AREA_NONE) {
    return has ? [] : [PAIN_AREA_NONE];
  }
  const withoutNone = selected.filter((v) => v !== PAIN_AREA_NONE);
  if (has) return withoutNone.filter((v) => v !== value);
  return [...withoutNone, value];
}

export function painAreasAnswered(selected: string[]): boolean {
  return selected.length > 0;
}

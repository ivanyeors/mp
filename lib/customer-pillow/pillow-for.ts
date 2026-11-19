/**
 * Who a customised pillow is for. Someone signed in who already has a pillow
 * is asked on the configurator's first question whether this one is for them
 * or for someone else, and the answer is kept with the Result's answers
 * (`data.pillowFor`). Nobody else is asked, so no answer means "for them".
 * Pure, so the configurator, the save route and the Pillow on record read one
 * rule.
 */
export type PillowFor = "self" | "other";

export const PILLOW_FOR_OPTIONS: { value: PillowFor; label: string }[] = [
  { value: "self", label: "For me" },
  { value: "other", label: "For someone else" },
];

/** The answer in a Result's stored answers, or null when it was never asked. */
export function pillowForOf(data: unknown): PillowFor | null {
  const v = data && typeof data === "object" ? (data as Record<string, unknown>).pillowFor : null;
  return v === "self" || v === "other" ? v : null;
}

/**
 * The first question's name after the answer changes. "For me" fills an empty
 * name with the account's; "for someone else" clears the account's name, which
 * is not theirs. A name the shopper typed is never touched.
 */
export function nameForPillowFor(answer: PillowFor, name: string, ownerName: string): string {
  const typed = name.trim();
  const own = ownerName.trim();
  if (answer === "self") return typed ? name : own;
  return own && typed === own ? "" : name;
}

/**
 * The bought pillows that are the buyer's own: one built from a Result they
 * said was for someone else is that person's pillow, not theirs. A line from
 * no Result (or from before the question) stays.
 */
export function ownBoughtPillows<T extends { resultId: string | null }>(
  bought: readonly T[],
  forOthers: ReadonlySet<string>,
): T[] {
  return bought.filter((b) => b.resultId === null || !forOthers.has(b.resultId));
}
